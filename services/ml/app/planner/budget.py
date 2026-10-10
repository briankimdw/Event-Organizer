"""How a total budget is usually split, by event type. Tune the numbers here.

Shares are relative weights (they don't have to add up to 100): the split is rescaled
over the categories the user actually needs. A category that isn't listed for an
event type borrows its share from FALLBACK_SHARE.
"""
from __future__ import annotations

from .vocab import category_label, is_bookable

# Percent of the total budget per vendor category.
SPLITS: dict[str, dict[str, float]] = {
    # Typical US wedding: venue + food are about 60%, photography 10-12%.
    "wedding": {
        "venue": 33, "catering": 27, "photography": 12, "florals": 7, "videography": 6,
        "music": 5, "attire": 5, "extras": 3, "hair-makeup": 2,
    },
    # Parties, corporate events, birthdays, galas.
    "event": {"catering": 35, "venue": 30, "photography": 12, "music": 10, "decor": 8, "extras": 5},
    # Photo-only bookings.
    "graduation": {"photography": 100},
    "portrait": {"photography": 100},
    "headshots": {"photography": 100},
    "real-estate": {"photography": 100},
    "product": {"photography": 100},
    "other": {"photography": 100},
}

# Share for a needed category the event type's table doesn't list (e.g. a DJ at a portrait session).
FALLBACK_SHARE = {"videography": 30, "hair-makeup": 10, "music": 20, "decor": 15}
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
