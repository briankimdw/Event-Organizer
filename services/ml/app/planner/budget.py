"""How a total budget is usually split, by event type. Tune the numbers here.

Shares are relative weights (they don't have to add up to 100): the split is rescaled
over the categories the user actually needs. A category that isn't listed for an
event type borrows its share from FALLBACK_SHARE.
"""
from __future__ import annotations

from .vocab import category_label, is_bookable

# Percent of the total budget per vendor category (vertical slugs from catalog.js).
# For the occasions, the categories are exactly catalog.js OCCASIONS[].needs.
SPLITS: dict[str, dict[str, float]] = {
    # Typical US wedding: venue + food are about half, photography 10-12%.
    "wedding": {
        "venue": 28, "catering": 24, "photography": 11, "florals": 7, "videography": 6, "music": 5,
        "planning": 5, "rentals": 4, "hair-makeup": 3, "cakes": 3, "transportation": 2, "officiant": 2,
    },
    # Parties, galas, reunions (anything without its own occasion).
    "event": {"catering": 33, "venue": 28, "photography": 12, "music": 10, "decor": 8, "bar": 6, "rentals": 3},
    "birthday": {"catering": 30, "venue": 25, "decor": 10, "music": 10, "photography": 10, "entertainment": 9,
                 "cakes": 6},
    # Mostly about the photos; a party (catering, venue...) when the user plans one.
    "graduation": {"photography": 40, "catering": 30, "venue": 15, "decor": 8, "cakes": 7},
    # A proposal: photographer to catch it, a planner to stage it, then dinner.
    "engagement": {"photography": 30, "private-chef": 25, "planning": 20, "florals": 15, "music": 10},
    "corporate": {"catering": 30, "venue": 28, "bar": 10, "staffing": 9, "photography": 8, "rentals": 8,
                  "planning": 7},
    "baby-shower": {"catering": 35, "venue": 25, "decor": 15, "photography": 13, "cakes": 12},
    "quinceanera": {"venue": 25, "catering": 25, "music": 12, "photography": 10, "decor": 10, "cakes": 6,
                    "hair-makeup": 5},
    "dinner-party": {"private-chef": 55, "bar": 20, "staffing": 13, "florals": 12},
    "bachelor": {"transportation": 25, "bar": 25, "private-chef": 25, "wellness": 15, "photography": 10},
    "holiday-party": {"catering": 32, "venue": 25, "bar": 15, "music": 10, "decor": 10, "photography": 8},
    # Photo-only bookings.
    "portrait": {"photography": 100},
    "headshots": {"photography": 100},
    "real-estate": {"photography": 100},
    "product": {"photography": 100},
    "other": {"photography": 100},
}

# Share for a needed category the event type's table doesn't list (e.g. a DJ at a portrait session).
FALLBACK_SHARE = {"videography": 30, "hair-makeup": 10, "music": 20, "decor": 15, "venue": 30, "catering": 30}
DEFAULT_SHARE = 10


def default_services(event_type: str) -> list[str]:
    """The vendor categories this kind of event usually needs, biggest share first."""
    split = SPLITS.get(event_type, SPLITS["other"])
    return sorted(split, key=lambda c: -split[c])


def split_budget(total_cents: int | None, event_type: str, services: list[str]) -> list[dict]:
    """[{category, label, cents, pct, bookable}] summing exactly to total_cents.

    Returns [] when the total is unknown: a split of $0 isn't useful to show.
    pct is a percentage (0-100).
    """
    if not total_cents or total_cents <= 0:
        return []
    table = SPLITS.get(event_type, SPLITS["other"])
    needed = [c for c in dict.fromkeys(services)] or default_services(event_type)
    weights = {c: table.get(c, FALLBACK_SHARE.get(c, DEFAULT_SHARE)) for c in needed}
    weight_sum = sum(weights.values())
    rows = []
    for c in sorted(weights, key=lambda c: -weights[c]):
        cents = int(round(total_cents * weights[c] / weight_sum / 100)) * 100  # whole dollars
        rows.append({"category": c, "label": category_label(c), "cents": cents,
                     "pct": round(100 * weights[c] / weight_sum, 1), "bookable": is_bookable(c)})
    rows[0]["cents"] += total_cents - sum(r["cents"] for r in rows)  # rounding remainder
    return rows
