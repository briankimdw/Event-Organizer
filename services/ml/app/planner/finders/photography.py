"""Photography: picks the photo package that fits the event (a wedding package for a
wedding, an event package as a stand-in, never a real estate shoot for a wedding)."""
from __future__ import annotations

from typing import Optional

from ..brief import hours_from_notes
from ..schema import Brief
from ..vocab import NON_HIREABLE_SERVICES, SERVICE_SLUG, TYPICAL_HOURS
from .base import BaseFinder, Candidate, Choice

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
    if not pool:
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


class PhotographerFinder(BaseFinder):
    """Recommendations for the 'photography' category."""

    vertical = "photography"

    def service_for(self, brief: Brief) -> Optional[str]:
        return SERVICE_SLUG.get(brief.event_type)  # None ('other') = any photographer

    def choose(self, brief: Brief, service: Optional[str], budget_cents: Optional[int], n_days: int,
               c: Candidate) -> Optional[Choice]:
        pkg, total, match = choose_package(c.packages, service or "photography", budget_cents, n_days,
                                           hours_from_notes(brief.notes), brief.event_type)
        if pkg is None:
            return None  # nothing hireable or related (e.g. only classes, or only real estate for a wedding)
        return Choice(pkg, total, match)

    def service_reason(self, service: Optional[str], offers_service: bool, pkg: dict) -> Optional[str]:
        if not service:
            return None
        label = {"headshots": "headshot", "real-estate": "real estate"}.get(service, service)
        return (f"Offers {label} photography" if offers_service
                else f"No {label} package listed; their {pkg.get('name') or 'closest package'} is the nearest fit")
