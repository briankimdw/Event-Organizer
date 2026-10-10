"""Shared vendor search + scoring for every vertical. Read-only: never books anything.

A finder turns (brief, this category's share of the budget) into ranked options:
real providers who are free on the dates, travel to the event, fit the budget, are
well rated and (for visual verticals) match the requested style. Subclasses only
decide which service to look for and which package fits (photography.py, generic.py).

Uses the service role key (server only) to call search_providers() and read
providers, packages and portfolio embeddings. Every option is a real database row.
"""
from __future__ import annotations

import json
import math
import struct
import threading
from dataclasses import dataclass, field
from datetime import date
from typing import Optional

import httpx

from ..brief import fmt_day, hours_from_notes, money
from ..schema import Brief
from ..vocab import budget_word, is_visual

MAX_OPTIONS = 6
MAX_EMBEDDINGS = 3000

# Score = weighted mix of these (each 0..1). Style is left out when no styles were asked for
# (or the vertical has no portfolios).
WEIGHTS = {"dates": 0.25, "budget": 0.20, "service": 0.20, "travel": 0.15, "style": 0.12, "rating": 0.08}

# SigLIP isn't guaranteed thread-safe; the planner runs finders in parallel.
_SIGLIP_LOCK = threading.Lock()


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


# --------------------------------------------------------------------------- data
@dataclass
class Candidate:
    provider: dict
    free_dates: list[str]
    offers_service: bool
    packages: list[dict] = field(default_factory=list)
    style: Optional[float] = None
    style_tags: dict[str, int] = field(default_factory=dict)  # requested style tag -> photos tagged


@dataclass
class Choice:
    """The package a finder picked for a provider."""
    package: dict
    total: Optional[int]          # cents for all the days, None = price on request
    match: float                  # service match 0..1
    quantity: Optional[int] = None  # guests / pieces the price assumes
    note: Optional[str] = None    # how the price was worked out, e.g. "$65/person x 80 guests"


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
            "select": "*,provider_services(service_categories(slug))",
            "id": f"in.({','.join(ids)})", "status": "eq.active"})
        r.raise_for_status()
        return r.json()

    def packages(self, ids: list[str]) -> list[dict]:
        # '*' rather than a column list: min_quantity / max_quantity only exist after the
        # all_verticals migration, and photography must keep working without it.
        r = self.http.get(f"{self.rest}/packages", params={
            "select": "*,service_categories(slug)",
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


# --------------------------------------------------------------------------- finder
class BaseFinder:
    """Search + scoring shared by every vertical. Subclasses implement service_for() and choose()."""

    vertical = ""
    on_site = False  # True for venues: the event comes to them, so distance matters, not travel radius

    def __init__(self, catalog: SupabaseCatalog, siglip=None, vertical: Optional[str] = None):
        self.catalog = catalog
        self.siglip = siglip  # app.siglip.SigLIP, or None to skip style matching
        if vertical:
            self.vertical = vertical

    # -- to override ------------------------------------------------------------
    def service_for(self, brief: Brief) -> Optional[str]:
        """The service slug to look for (e.g. 'wedding-venue'), or None for any in the vertical."""
        return None

    def choose(self, brief: Brief, service: Optional[str], budget_cents: Optional[int], n_days: int,
               c: Candidate) -> Optional[Choice]:
        raise NotImplementedError

    def fit_reasons(self, brief: Brief, c: Candidate, choice: Choice) -> list[str]:
        """Extra vertical-specific reasons (capacity...)."""
        return []

    def service_reason(self, service: Optional[str], offers_service: bool, pkg: dict) -> Optional[str]:
        if not service:
            return None
        label = service.replace("-", " ")
        if offers_service:
            return f"Offers {label}"
        return f"No {label} package listed; their {pkg.get('name') or 'closest package'} is the nearest fit"

    # -- search -----------------------------------------------------------------
    def __call__(self, brief: Brief, budget_cents: Optional[int]) -> list[dict]:
        return self.find(brief, budget_cents)

    def find(self, brief: Brief, budget_cents: Optional[int]) -> list[dict]:
        service = self.service_for(brief)
        candidates: dict[str, Candidate] = {}
        for row in self.catalog.search_providers(brief.dates, service or self.vertical):
            candidates[row["provider_id"]] = Candidate({}, row.get("free_dates") or [], service is not None)
        if service and len(candidates) < MAX_OPTIONS:
            # Not enough specialists: also consider the rest of the vertical (ranked lower).
            for row in self.catalog.search_providers(brief.dates, self.vertical):
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
        if self.uses_style(brief) and candidates:
            self._style(brief, candidates)

        options = [o for c in candidates.values() if (o := self._option(brief, service, budget_cents, c))]
        options.sort(key=lambda o: -o["score"])
        return options[:MAX_OPTIONS]

    def uses_style(self, brief: Brief) -> bool:
        return bool(brief.styles) and self.siglip is not None and is_visual(self.vertical)

    # -- style ------------------------------------------------------------------
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
        with _SIGLIP_LOCK:
            text = self.siglip.embed_texts([f"a {', '.join(brief.styles)} photo"])[0].float().cpu()
        sims = {}
        for pid, vecs in by_provider.items():
            mean = torch.nn.functional.normalize(torch.tensor(vecs, dtype=torch.float32).mean(dim=0), dim=0)
            sims[pid] = float(mean @ text)
        for pid, score in normalise_style(sims).items():
            candidates[pid].style = score

    # -- one option -------------------------------------------------------------
    def _option(self, brief: Brief, service: Optional[str], budget_cents: Optional[int],
                c: Candidate) -> Optional[dict]:
        p = c.provider
        dates = brief.dates
        free = [d for d in c.free_dates if d in dates] if dates else []
        n_days = len(free) if dates else 1
        choice = self.choose(brief, service, budget_cents, n_days, c)
        if choice is None:
            return None  # nothing that fits (wrong service, too many guests...)
        pkg, total = choice.package, choice.total
        match = max(choice.match, 1.0) if c.offers_service else choice.match
        offers_service = match >= 1.0

        base = parse_ewkb_point(p.get("base_location"))
        event_loc = (brief.location.lat, brief.location.lng) if brief.location else None
        distance = haversine_km(base, event_loc) if base and event_loc else None
        radius = p.get("service_radius_km")
        travels = None if self.on_site else (
            (distance <= radius) if distance is not None and radius is not None else None)
        fits = (total <= budget_cents) if budget_cents and total is not None else None

        rating = float(p["rating_avg"]) if p.get("rating_avg") is not None else None
        count = p.get("rating_count") or 0

        parts = {
            "dates": (len(free) / len(dates)) if dates else 0.5,
            "budget": self._budget_part(fits, total, budget_cents, brief),
            "travel": self._distance_part(distance) if self.on_site else self._travel_part(travels, distance, radius),
            "rating": self._rating_part(rating, count),
            "service": match,
        }
        weights = dict(WEIGHTS)
        if self.uses_style(brief):
            parts["style"] = c.style if c.style is not None else 0.3
        else:
            weights.pop("style")
        score = sum(weights[k] * parts[k] for k in weights) / sum(weights.values())

        reasons = self._dates_reasons(brief, free)
        reasons.append(self._price_reason(pkg, total, fits, budget_cents, n_days, choice))
        reasons += self._place_reasons(brief, p, distance, radius, travels)
        reasons += self.fit_reasons(brief, c, choice)
        if self.uses_style(brief):
            reasons += self._style_reasons(brief, c)
        if count:
            reasons.append(f"Rated {rating:.1f} from {count} review{'s' if count != 1 else ''}")
        if (r := self.service_reason(service, offers_service, pkg)):
            reasons.append(r)

        return {
            "provider_id": p["id"],
            "package_id": pkg.get("id"),
            "package_name": pkg.get("name"),
            "price_type": pkg.get("price_type"),
            "quantity": choice.quantity,
            "price_cents": total,
            "fits_budget": fits,
            "free_dates": free,
            "free_on_all_dates": bool(dates) and len(free) == len(dates),
            "distance_km": round(distance, 1) if distance is not None else None,
            "travels_to_event": travels,
            "style_match": c.style if self.uses_style(brief) else None,
            "reasons": reasons,
            "score": round(score, 3),
        }

    # -- scoring parts ------------------------------------------------------------
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
    def _distance_part(distance) -> float:
        """On-site vendors (venues): within 15 km is ideal, 75 km+ is too far."""
        if distance is None:
            return 0.5
        return max(0.0, min(1.0, 1.0 - (distance - 15) / 60))

    @staticmethod
    def _rating_part(rating, count) -> float:
        prior, weight = 4.0, 2  # a couple of imaginary 4-star reviews keep 1 review from dominating
        avg = ((rating or 0) * count + prior * weight) / (count + weight)
        return max(0.0, min(1.0, (avg - 3.0) / 2.0))

    # -- reasons --------------------------------------------------------------------
    @staticmethod
    def _dates_reasons(brief: Brief, free: list[str]) -> list[str]:
        dates = brief.dates
        if not dates:
            return []
        if len(free) == len(dates):
            return [{1: f"Free on {fmt_day(date.fromisoformat(free[0]), False)}",
                     2: "Free on both dates"}.get(len(dates), f"Free on all {len(dates)} dates")]
        names = ", ".join(fmt_day(date.fromisoformat(d), False) for d in free)
        return [f"Free on {names} only ({len(free)} of {len(dates)} dates)"]

    def _price_reason(self, pkg, total, fits, budget, n_days, choice: Choice) -> str:
        days_txt = f" for {n_days} days" if n_days > 1 and pkg.get("price_type") != "per_item" else ""
        price = f"{choice.note} = {money(total)}" if choice.note and total is not None else (
            money(total) if total is not None else "")
        word = budget_word(self.vertical)
        if total is None:
            return f"{pkg['name']}: price on request"
        if fits is True:
            return f"Within your {money(budget)} {word} budget ({pkg['name']}, {price}{days_txt})"
        if fits is False:
            return f"{pkg['name']} is {price}{days_txt}, over your {money(budget)} {word} budget"
        return f"{pkg['name']}: {price}{days_txt}"

    def _place_reasons(self, brief: Brief, p: dict, distance, radius, travels) -> list[str]:
        if distance is None:
            return []
        place = (brief.location_text or "the event").split(",")[0]
        if self.on_site:
            return [f"In {p.get('city') or 'the area'}, {distance:.0f} km from {place}"]
        if travels:
            return [f"Based in {p.get('city') or 'the area'}, {distance:.0f} km from {place}"]
        return [f"{distance:.0f} km from {place}, outside their usual {radius} km travel area"]

    @staticmethod
    def _style_reasons(brief: Brief, c: Candidate) -> list[str]:
        tagged = sorted(c.style_tags.items(), key=lambda kv: -kv[1])
        if tagged and tagged[0][1] >= 2:
            return [f"Known for {' and '.join(t for t, _ in tagged[:2])} shots"]
        if c.style is not None and c.style >= 0.7:
            return [f"Portfolio fits the {', '.join(brief.styles[:2])} look"]
        return []


def hours_for(brief: Brief, pkg: dict, typical: float) -> float:
    """Hours to price an hourly package for: what the user asked, else the package's length,
    else the usual length of this kind of event; never below the package's minimum."""
    hours = hours_from_notes(brief.notes) or ((pkg.get("duration_minutes") or 0) / 60) or typical
    minimum = (pkg.get("attributes") or {}).get("min_hours") or 0
    return max(hours, minimum)
