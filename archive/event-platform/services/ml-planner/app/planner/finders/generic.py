"""Any vertical: caterers, venues, DJs, florists... One finder class, configured by slug.

Package prices follow the database's price types (see request_booking()):
    fixed       price                     (x days)
    daily       price per day             (x days)
    hourly      price x hours             (x days)   hours: asked, else package length, else typical
    per_person  price x guests            (x days)   guests: asked, else typical for the event type
    per_item    price x pieces            (once)     pieces: guests x units_per_guest, else 1
    quote       price on request
Per-person / per-item quantities never go below the package's min_quantity; a package
whose max_quantity is below the (known) guest count isn't suggested.
"""
from __future__ import annotations

import math
from typing import Optional

from ..brief import money
from ..schema import Brief
from ..vocab import TYPICAL_GUESTS, TYPICAL_HOURS
from .base import BaseFinder, Candidate, Choice, hours_for

# The service to look for in a vertical for an event type ('*' = any other event type).
# Unlisted verticals / event types: any package in the vertical is a full match.
PREFERRED_SERVICE: dict[str, dict[str, str]] = {
    "videography": {"wedding": "wedding-film", "*": "event-recap"},
    "venue": {"wedding": "wedding-venue", "birthday": "party-space", "baby-shower": "party-space",
              "quinceanera": "party-space", "holiday-party": "party-space", "corporate": "party-space",
              "event": "party-space", "graduation": "party-space"},
    "cakes": {"wedding": "wedding-cake", "birthday": "celebration-cake", "quinceanera": "celebration-cake",
              "graduation": "celebration-cake", "baby-shower": "dessert-table"},
    "music": {"wedding": "dj", "birthday": "dj", "quinceanera": "dj", "holiday-party": "dj", "event": "dj",
              "engagement": "solo-musician", "dinner-party": "solo-musician"},
    "entertainment": {"wedding": "photo-booth", "quinceanera": "photo-booth", "holiday-party": "photo-booth",
                      "corporate": "photo-booth"},
    "florals": {"wedding": "centerpieces", "dinner-party": "centerpieces", "engagement": "floral-installation"},
    "decor": {"birthday": "balloon-decor", "baby-shower": "balloon-decor", "quinceanera": "themed-decor",
              "holiday-party": "themed-decor", "wedding": "tablescapes"},
    "hair-makeup": {"wedding": "bridal-makeup", "*": "event-makeup"},
    "rentals": {"wedding": "tables-chairs", "event": "tables-chairs", "corporate": "av-equipment"},
    "planning": {"wedding": "full-planning", "engagement": "proposal-planning", "corporate": "corporate-planning",
                 "*": "day-of-coordination"},
    "officiant": {"wedding": "wedding-officiant"},
    "private-chef": {"dinner-party": "chef-dinner", "engagement": "chef-dinner", "bachelor": "chef-dinner"},
    "transportation": {"wedding": "classic-car", "bachelor": "party-bus", "quinceanera": "limo"},
    "staffing": {"corporate": "servers", "dinner-party": "servers", "wedding": "servers"},
    "wellness": {"bachelor": "spa-day"},
}

# Per-person verticals where "person" is the people getting ready, not every guest.
PARTY_SIZE = {"wedding": 6, "quinceanera": 5, "bachelor": 6, "baby-shower": 3, "engagement": 2}
SMALL_GROUP_VERTICALS = {"hair-makeup", "wellness"}

# A package of another service in the same vertical is a decent stand-in (a buffet
# caterer for a plated wedding), just ranked a bit lower.
RELATED_MATCH = 0.6


def preferred_service(vertical: str, event_type: str) -> Optional[str]:
    table = PREFERRED_SERVICE.get(vertical, {})
    return table.get(event_type) or table.get("*")


def headcount(brief: Brief, vertical: str) -> tuple[int, bool]:
    """(guests, whether the user told us)."""
    guests = brief.guest_count or TYPICAL_GUESTS.get(brief.event_type, 20)
    if vertical in SMALL_GROUP_VERTICALS:
        guests = min(guests, PARTY_SIZE.get(brief.event_type, 2))
    return guests, brief.guest_count is not None


def price_package(pkg: dict, brief: Brief, vertical: str, n_days: int
                  ) -> Optional[tuple[Optional[int], Optional[int], Optional[str]]]:
    """(total cents or None for quotes, quantity, note) for this package, or None if it can't
    take this many guests."""
    t = pkg.get("price_type")
    price = pkg.get("price_cents")
    guests, known = headcount(brief, vertical)
    lo, hi = pkg.get("min_quantity"), pkg.get("max_quantity")
    attrs = pkg.get("attributes") or {}
    days = max(1, n_days)

    if t == "per_item":
        per_guest = attrs.get("units_per_guest")
        qty = math.ceil(guests * per_guest) if per_guest else 1
    else:
        qty = guests
    if t in ("per_person", "per_item"):
        qty = max(qty, lo or 1)
        if hi and qty > hi and (known or t == "per_item"):
            return None
    elif hi and known and guests > hi:
        return None  # a 120-guest venue for 150 people, a 30-seat party bus for 80
    if t == "quote" or price is None:
        return None, (qty if t in ("per_person", "per_item") or known else None), None

    unit_word = {"per_person": "guests" if vertical not in SMALL_GROUP_VERTICALS else "people"}.get(t, "")
    estimate = "" if known else " (estimate)"
    if t == "per_person":
        return price * qty * days, qty, f"{money(price)}/person x {qty} {unit_word}{estimate}"
    if t == "per_item":
        return price * qty, qty, (f"{money(price)} each x {qty}" if qty > 1 else None)
    if t == "hourly":
        hours = hours_for(brief, pkg, TYPICAL_HOURS.get(brief.event_type, 4))
        return int(round(price * hours)) * days, None, f"{money(price)}/hour x {hours:g} h"
    if t == "daily":
        return price * days, (guests if known else None), (f"{money(price)}/day" if days > 1 else None)
    return price * days, (guests if known else None), None  # fixed


def choose_vendor_package(packages: list[dict], service: Optional[str], budget_cents: Optional[int],
                          n_days: int, brief: Brief, vertical: str) -> Optional[Choice]:
    """Best-fitting package. Exact service first (match 1), else any other package in the
    vertical (match 0.6); with no preferred service every package is a full match.
    With a budget: the most complete package that fits, else the cheapest. Without: the cheapest."""
    exact = [p for p in packages if service and p.get("service") == service]
    pool, level = (exact, 1.0) if exact else (packages, RELATED_MATCH if service else 1.0)
    priced = []
    for p in pool:
        result = price_package(p, brief, vertical, n_days)
        if result is not None:
            priced.append((p, *result))
    if not priced:
        return None
    with_price = [x for x in priced if x[1] is not None]
    if budget_cents and with_price:
        fits = [x for x in with_price if x[1] <= budget_cents]
        p, total, qty, note = max(fits, key=lambda x: x[1]) if fits else min(with_price, key=lambda x: x[1])
    elif with_price:
        p, total, qty, note = min(with_price, key=lambda x: x[1])
    else:
        p, total, qty, note = priced[0]
    return Choice(p, total, level, qty, note)


class VendorFinder(BaseFinder):
    """Recommendations for any vertical (generic by default)."""

    def __init__(self, catalog, siglip=None, vertical: str = ""):
        super().__init__(catalog, siglip, vertical)
        self.on_site = vertical == "venue"

    def service_for(self, brief: Brief) -> Optional[str]:
        return preferred_service(self.vertical, brief.event_type)

    def choose(self, brief: Brief, service: Optional[str], budget_cents: Optional[int], n_days: int,
               c: Candidate) -> Optional[Choice]:
        if self._too_small(brief, c.provider):
            return None
        return choose_vendor_package(c.packages, service, budget_cents, n_days, brief, self.vertical)

    @staticmethod
    def _capacity(provider: dict) -> Optional[int]:
        a = provider.get("attributes") or {}
        caps = [a.get(k) for k in ("capacity_standing", "capacity_seated", "max_guests") if isinstance(a.get(k), int)]
        return max(caps) if caps else None

    def _too_small(self, brief: Brief, provider: dict) -> bool:
        cap = self._capacity(provider)
        return bool(brief.guest_count and cap and brief.guest_count > cap and self.vertical != "hair-makeup")

    def fit_reasons(self, brief: Brief, c: Candidate, choice: Choice) -> list[str]:
        cap = self._capacity(c.provider)
        if brief.guest_count and cap:
            return [f"Fits {brief.guest_count} guests (up to {cap})"]
        return []
