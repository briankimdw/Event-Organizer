"""Find and rank real photographers for a brief. Read-only: never books anything.

Uses the service role key (server only) to call search_providers() and read
providers, packages and portfolio embeddings. Every option is a real database row.
"""
from __future__ import annotations

import json
import math
import struct
from dataclasses import dataclass, field
from datetime import date
from typing import Optional

import httpx

from .brief import fmt_day, hours_from_notes, money
from .schema import Brief
from .vocab import NON_HIREABLE_SERVICES, SERVICE_SLUG, TYPICAL_HOURS

MAX_OPTIONS = 6
MAX_EMBEDDINGS = 3000

# Score = weighted mix of these (each 0..1). Style is left out when no styles were asked for.
WEIGHTS = {"dates": 0.25, "budget": 0.20, "service": 0.20, "travel": 0.15, "style": 0.12, "rating": 0.08}

# When a photographer doesn't offer the exact service, these packages are a reasonable
# stand-in (an event package for a wedding...). Anything else isn't suggested at all:
# a real estate "Listing Shoot" is never a wedding option.
RELATED_SERVICES = {
    "wedding": {"event", "portrait"},
    "event": {"wedding", "portrait"},
    "graduation": {"portrait", "headshots"},
    "portrait": {"graduation", "headshots", "wedding", "event"},
    "headshots": {"portrait", "graduation"},
    "real-estate": {"product"},
    "product": {"real-estate"},
}


# --------------------------------------------------------------------------- helpers
def parse_ewkb_point(value: Optional[str]) -> Optional[tuple[float, float]]:
    """PostGIS geography as EWKB hex ('0101000020E6100000...') -> (lat, lng)."""
    if not value or not isinstance(value, str):
        return None
    try:
        raw = bytes.fromhex(value)
        endian = "<" if raw[0] == 1 else ">"
        geom_type = struct.unpack(endian + "I", raw[1:5])[0]
        offset = 5 + (4 if geom_type & 0x20000000 else 0)  # skip SRID if present
        if geom_type & 0xFF != 1:  # not a point
            return None
        lng, lat = struct.unpack(endian + "dd", raw[offset:offset + 16])
        return lat, lng
    except (ValueError, struct.error, IndexError):
        return None


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lng1, lat2, lng2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(h))


def parse_vector(value) -> Optional[list[float]]:
    """pgvector comes back from PostgREST as a string '[0.1,0.2,...]'."""
    if isinstance(value, list):
        return value
    try:
        return json.loads(value) if isinstance(value, str) else None
    except ValueError:
        return None


def package_price(pkg: dict, hours: Optional[float], event_type: str) -> Optional[int]:
    """Price of one day of this package in cents (None for 'quote' packages)."""
    if pkg.get("price_type") == "quote" or pkg.get("price_cents") is None:
        return None
    if pkg.get("price_type") == "hourly":
        h = hours or ((pkg.get("duration_minutes") or 0) / 60) or TYPICAL_HOURS.get(event_type, 2)
        return int(round(pkg["price_cents"] * h))
    return int(pkg["price_cents"])


def choose_package(packages: list[dict], service: str, budget_cents: Optional[int], n_days: int,
                   hours: Optional[float], event_type: str) -> tuple[Optional[dict], Optional[int], float]:
    """Best-fitting package -> (package, total price for n_days or None, service match 0..1).

    Service match: 1 = a package for this exact service, 0.5 = a related one (an event
    package for a wedding), 0 = any package (only when no specific service was asked for).
    Unrelated packages are never chosen, so (None, None, 0) means "not a fit".
    With a budget: the most complete package that fits, else the cheapest.
    Without one: the package closest to the usual length of this kind of event.
    """
    hireable = [p for p in packages if (p.get("service") or "") not in NON_HIREABLE_SERVICES]
    exact = [p for p in hireable if p.get("service") == service]
    related = [p for p in hireable if p.get("service") in RELATED_SERVICES.get(service, set())]
    if exact:
        pool, level = exact, 1.0
    elif related:
        pool, level = related, 0.5
    elif service == "photography":
        pool, level = hireable, 0.0
    else:
        return None, None, 0.0
    priced = [(p, package_price(p, hours, event_type)) for p in pool]
    totals = [(p, None if price is None else price * max(1, n_days)) for p, price in priced]
    with_price = [(p, t) for p, t in totals if t is not None]
    if budget_cents and with_price:
        fits = [(p, t) for p, t in with_price if t <= budget_cents]
        p, t = max(fits, key=lambda x: x[1]) if fits else min(with_price, key=lambda x: x[1])
    elif with_price:
        target = (hours or TYPICAL_HOURS.get(event_type, 2)) * 60
        p, t = min(with_price, key=lambda x: (abs((x[0].get("duration_minutes") or target) - target), x[1]))
    else:
        p, t = totals[0]
    return p, t, level


def normalise_style(sims: dict[str, float]) -> dict[str, float]:
    """SigLIP text-image cosines are small and close together: against a provider's
    average photo they ran about -0.02 (unrelated) to 0.04 (clear match) on the dev
    portfolios. Blend a rank within the candidates (min-max) with an absolute scale
    (-0.02 -> 0, 0.06 -> 1), so the best candidate stands out but a weak field doesn't
    look like a perfect match."""
    if not sims:
        return {}
    lo, hi = min(sims.values()), max(sims.values())
    out = {}
    for pid, s in sims.items():
        absolute = min(1.0, max(0.0, (s + 0.02) / 0.08))
        relative = (s - lo) / (hi - lo) if hi - lo > 0.005 else absolute
        out[pid] = round(0.5 * relative + 0.5 * absolute, 3)
    return out


# --------------------------------------------------------------------------- search
@dataclass
class Candidate:
    provider: dict
    free_dates: list[str]
    offers_service: bool
    packages: list[dict] = field(default_factory=list)
    style: Optional[float] = None
    style_tags: dict[str, int] = field(default_factory=dict)  # requested style tag -> photos tagged


class SupabaseCatalog:
    """Reads what the planner needs from Supabase with the service role key."""

    def __init__(self, url: str, key: str, http: Optional[httpx.Client] = None):
        if not url or not key:
            raise RuntimeError("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see services/ml/.env.example).")
        self.rest = f"{url}/rest/v1"
        self.http = http or httpx.Client(
            timeout=30, headers={"apikey": key, "Authorization": f"Bearer {key}"})

    def search_providers(self, dates: list[str], category: str) -> list[dict]:
        r = self.http.post(f"{self.rest}/rpc/search_providers",
                           json={"p_dates": dates or None, "p_category": category})
        r.raise_for_status()
        return r.json()

    def providers(self, ids: list[str]) -> list[dict]:
        r = self.http.get(f"{self.rest}/providers", params={
            "select": "id,display_name,slug,city,base_location,service_radius_km,rating_avg,rating_count,is_pro,"
                      "provider_services(service_categories(slug))",
            "id": f"in.({','.join(ids)})", "status": "eq.active"})
        r.raise_for_status()
        return r.json()

    def packages(self, ids: list[str]) -> list[dict]:
        r = self.http.get(f"{self.rest}/packages", params={
            "select": "id,provider_id,name,price_type,price_cents,duration_minutes,sort_order,service_categories(slug)",
            "provider_id": f"in.({','.join(ids)})", "is_active": "eq.true", "order": "sort_order,price_cents"})
        r.raise_for_status()
        rows = r.json()
        for row in rows:
            row["service"] = (row.pop("service_categories", None) or {}).get("slug")
        return rows

    def portfolio_embeddings(self, ids: list[str]) -> list[tuple[str, list[float], list[str]]]:
        """[(provider_id, embedding, auto_tags)] for published portfolio photos."""
        r = self.http.get(f"{self.rest}/photo_embeddings", params={
            "select": "embedding,photos!inner(auto_tags,albums!photos_album_id_fkey!inner(provider_id,status))",
            "photos.albums.provider_id": f"in.({','.join(ids)})",
            "photos.albums.status": "eq.published",
            "limit": str(MAX_EMBEDDINGS)})
        r.raise_for_status()
        out = []
        for row in r.json():
            photo = row.get("photos") or {}
            album = photo.get("albums") or {}
            vec = parse_vector(row.get("embedding"))
            if album.get("provider_id") and vec:
                out.append((album["provider_id"], vec, photo.get("auto_tags") or []))
        return out


class PhotographerFinder:
    """Recommendations for the 'photography' category. Other bookable categories can get
    their own finder later (same output shape)."""

    def __init__(self, catalog: SupabaseCatalog, siglip=None):
        self.catalog = catalog
        self.siglip = siglip  # app.siglip.SigLIP, or None to skip style matching

    def find(self, brief: Brief, budget_cents: Optional[int]) -> list[dict]:
        service = SERVICE_SLUG.get(brief.event_type, "photography")
        candidates: dict[str, Candidate] = {}
        for row in self.catalog.search_providers(brief.dates, service):
            candidates[row["provider_id"]] = Candidate({}, row.get("free_dates") or [], service != "photography")
        if service != "photography" and len(candidates) < MAX_OPTIONS:
            # Not enough specialists: also consider other photographers (ranked lower).
            for row in self.catalog.search_providers(brief.dates, "photography"):
                candidates.setdefault(row["provider_id"], Candidate({}, row.get("free_dates") or [], False))
        if not candidates:
            return []

        ids = list(candidates)
        for p in self.catalog.providers(ids):
            candidates[p["id"]].provider = p
        for pkg in self.catalog.packages(ids):
            if pkg["provider_id"] in candidates:
                candidates[pkg["provider_id"]].packages.append(pkg)
        candidates = {pid: c for pid, c in candidates.items() if c.provider}
        if brief.styles and self.siglip is not None and candidates:
            self._style(brief, candidates)

        options = [o for c in candidates.values() if (o := self._option(brief, service, budget_cents, c))]
        options.sort(key=lambda o: -o["score"])
        return options[:MAX_OPTIONS]

    # -- style ---------------------------------------------------------------
    def _style(self, brief: Brief, candidates: dict[str, Candidate]) -> None:
        import torch

        rows = self.catalog.portfolio_embeddings(list(candidates))
        wanted = set(brief.styles)
        by_provider: dict[str, list[list[float]]] = {}
        for pid, vec, tags in rows:
            if pid in candidates:
                by_provider.setdefault(pid, []).append(vec)
                for t in wanted.intersection(tags):
                    candidates[pid].style_tags[t] = candidates[pid].style_tags.get(t, 0) + 1
        if not by_provider:
            return
        text = self.siglip.embed_texts([f"a {', '.join(brief.styles)} photo"])[0].float().cpu()
        sims = {}
        for pid, vecs in by_provider.items():
            mean = torch.nn.functional.normalize(torch.tensor(vecs, dtype=torch.float32).mean(dim=0), dim=0)
            sims[pid] = float(mean @ text)
        for pid, score in normalise_style(sims).items():
            candidates[pid].style = score

    # -- one option ----------------------------------------------------------
    def _option(self, brief: Brief, service: str, budget_cents: Optional[int], c: Candidate) -> Optional[dict]:
        p = c.provider
        dates = brief.dates
        free = [d for d in c.free_dates if d in dates] if dates else []
        n_days = len(free) if dates else 1
        hours = hours_from_notes(brief.notes)
        pkg, total, match = choose_package(c.packages, service, budget_cents, n_days, hours, brief.event_type)
        if pkg is None:
            return None  # nothing hireable or related (e.g. only classes, or only real estate for a wedding)
        if c.offers_service:
            match = max(match, 1.0)
        offers_service = match >= 1.0

        base = parse_ewkb_point(p.get("base_location"))
        event_loc = (brief.location.lat, brief.location.lng) if brief.location else None
        distance = haversine_km(base, event_loc) if base and event_loc else None
        radius = p.get("service_radius_km")
        travels = (distance <= radius) if distance is not None and radius is not None else None
        fits = (total <= budget_cents) if budget_cents and total is not None else None

        rating = float(p["rating_avg"]) if p.get("rating_avg") is not None else None
        count = p.get("rating_count") or 0

        parts = {
            "dates": (len(free) / len(dates)) if dates else 0.5,
            "budget": self._budget_part(fits, total, budget_cents, brief),
            "travel": self._travel_part(travels, distance, radius),
            "rating": self._rating_part(rating, count),
            "service": match,
        }
        weights = dict(WEIGHTS)
        if brief.styles:
            parts["style"] = c.style if c.style is not None else 0.3
        else:
            weights.pop("style")
        score = sum(weights[k] * parts[k] for k in weights) / sum(weights.values())

        return {
            "provider_id": p["id"],
            "package_id": pkg.get("id"),
            "package_name": pkg.get("name"),
            "price_cents": total,
            "fits_budget": fits,
            "free_dates": free,
            "free_on_all_dates": bool(dates) and len(free) == len(dates),
            "distance_km": round(distance, 1) if distance is not None else None,
            "travels_to_event": travels,
            "style_match": c.style if brief.styles else None,
            "reasons": self._reasons(brief, p, pkg, free, n_days, total, fits, budget_cents, distance,
                                     radius, travels, c, offers_service, service, rating, count),
            "score": round(score, 3),
        }

    @staticmethod
    def _budget_part(fits, total, budget, brief: Brief) -> float:
        if fits is True:
            return 1.0
        if fits is False:
            return max(0.0, min(0.6, budget / total - 0.3)) if total else 0.0
        if total is None:
            return 0.4  # price on request
        if brief.notes and "Prefers cheaper" in brief.notes:
            return max(0.0, 1.0 - total / 1_000_000)  # cheaper is better, $10k = 0
        return 0.5

    @staticmethod
    def _travel_part(travels, distance, radius) -> float:
        if travels is None:
            return 0.5
        if travels:
            return 1.0 - 0.3 * (distance / radius if radius else 0)
        return max(0.0, 0.3 * (radius or 0) / distance) if distance else 0.0

    @staticmethod
    def _rating_part(rating, count) -> float:
        prior, weight = 4.0, 2  # a couple of imaginary 4-star reviews keep 1 review from dominating
        avg = ((rating or 0) * count + prior * weight) / (count + weight)
        return max(0.0, min(1.0, (avg - 3.0) / 2.0))

    @staticmethod
    def _reasons(brief, p, pkg, free, n_days, total, fits, budget, distance, radius, travels, c,
                 offers_service, service, rating, count) -> list[str]:
        reasons: list[str] = []
        dates = brief.dates
        if dates:
            if len(free) == len(dates):
                reasons.append({1: f"Free on {fmt_day(date.fromisoformat(free[0]), False)}",
                                2: "Free on both dates"}.get(len(dates), f"Free on all {len(dates)} dates"))
            else:
                names = ", ".join(fmt_day(date.fromisoformat(d), False) for d in free)
                reasons.append(f"Free on {names} only ({len(free)} of {len(dates)} dates)")

        days_txt = f" for {n_days} days" if n_days > 1 else ""
        if total is None:
            reasons.append(f"{pkg['name']}: price on request")
        elif fits is True:
            reasons.append(f"Within your {money(budget)} photography budget ({pkg['name']}, {money(total)}{days_txt})")
        elif fits is False:
            reasons.append(f"{pkg['name']} is {money(total)}{days_txt}, over your {money(budget)} photography budget")
        else:
            reasons.append(f"{pkg['name']}: {money(total)}{days_txt}")

        if distance is not None:
            place = (brief.location_text or "the event").split(",")[0]
            if travels:
                reasons.append(f"Based in {p.get('city') or 'the area'}, {distance:.0f} km from {place}")
            else:
                reasons.append(f"{distance:.0f} km from {place}, outside their usual {radius} km travel area")

        if brief.styles:
            tagged = sorted(c.style_tags.items(), key=lambda kv: -kv[1])
            if tagged and tagged[0][1] >= 2:
                tags = " and ".join(t for t, _ in tagged[:2])
                reasons.append(f"Known for {tags} shots")
            elif c.style is not None and c.style >= 0.7:
                reasons.append(f"Portfolio fits the {', '.join(brief.styles[:2])} look")

        if count:
            reasons.append(f"Rated {rating:.1f} from {count} review{'s' if count != 1 else ''}")
        if service != "photography":
            label = {"headshots": "headshot", "real-estate": "real estate"}.get(service, service)
            reasons.append(f"Offers {label} photography" if offers_service
                           else f"No {label} package listed; their {pkg.get('name') or 'closest package'} is the nearest fit")
        return reasons
