"""Clean-up shared by both engines: dates list, title, location, follow-up questions."""
from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Optional

from .budget import default_services
from .geocode import Geocoder
from .schema import Brief, LatLng
from .vocab import CATEGORIES, EVENT_LABELS, EVENT_TYPES, GUEST_EVENT_TYPES

MAX_DATES = 14
MAX_QUESTIONS = 2


def parse_iso(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return date.fromisoformat(value.strip()[:10])
    except ValueError:
        return None


def date_range(start: date, end: date) -> list[date]:
    if end < start:
        start, end = end, start
    days = min((end - start).days + 1, MAX_DATES)
    return [start + timedelta(days=i) for i in range(days)]


def fmt_day(d: date, with_year: bool = True) -> str:
    """Jun 14, 2027"""
    return f"{d:%b} {d.day}, {d.year}" if with_year else f"{d:%b} {d.day}"


def fmt_dates(days: list[date]) -> str:
    """'Jun 14-15, 2027', 'Oct 20, 2026', 'Jun 14 and Jun 21, 2027'."""
    if not days:
        return ""
    if len(days) == 1:
        return fmt_day(days[0])
    first, last = days[0], days[-1]
    contiguous = (last - first).days == len(days) - 1
    if contiguous and first.year == last.year:
        if first.month == last.month:
            return f"{first:%b} {first.day}-{last.day}, {first.year}"
        return f"{fmt_day(first, False)} - {fmt_day(last)}"
    if contiguous:
        return f"{fmt_day(first)} - {fmt_day(last)}"
    return ", ".join(fmt_day(d, False) for d in days[:-1]) + f" and {fmt_day(last)}"


def money(cents: int) -> str:
    dollars = cents / 100
    return f"${dollars:,.0f}" if dollars >= 100 or dollars == int(dollars) else f"${dollars:,.2f}"


def make_title(event_type: str, location_text: Optional[str]) -> str:
    label = EVENT_LABELS.get(event_type, "Photo shoot")
    if not location_text:
        return label
    place = location_text.split(",")[0].strip()
    return f"{label} {'at' if place.isupper() or VENUE_WORDS.search(place) else 'in'} {place}"


VENUE_WORDS = re.compile(
    r"\b(ranch|hotel|park|estate|gardens?|museum|club|winery|vineyard|hall|center|centre|observatory|church|"
    r"chapel|resort|inn|house|barn|university|college|campus|studio|venue|loft|rooftop|pier|mansion|library)\b", re.I)


def finalize(brief: Brief, *, today: date, geocode: Geocoder, previous: Optional[Brief] = None,
             keep_title: bool = False) -> Brief:
    """Make a brief consistent: valid dates + dates list, location coordinates, title,
    services, de-duplicated styles. Engines fill the fields; this fixes the rest."""
    b = brief.model_copy(deep=True)
    if b.event_type not in EVENT_TYPES:
        b.event_type = "other"

    # Dates: keep explicit non-contiguous days if the engine gave them, else expand start..end.
    days = sorted({d for d in (parse_iso(x) for x in b.dates) if d})
    start, end = parse_iso(b.start_date), parse_iso(b.end_date)
    if start and end and end < start:
        start, end = end, start
    if start and not (days and days[0] == start and days[-1] == (end or start)):
        days = date_range(start, end or start)  # no list, or it disagrees with start/end
    days = days[:MAX_DATES]
    b.dates = [d.isoformat() for d in days]
    b.start_date = days[0].isoformat() if days else None
    b.end_date = days[-1].isoformat() if days else None

    # Location: reuse the previous coordinates when the place didn't change; geocode otherwise.
    if b.location_text:
        b.location_text = b.location_text.strip() or None
    if not b.location_text:
        b.location = None
    elif b.location is None:
        if previous and previous.location and previous.location_text and \
                previous.location_text.strip().lower() == b.location_text.lower():
            b.location = previous.location
        else:
            place = geocode(b.location_text)
            if place:
                b.location = LatLng(lat=place[1], lng=place[2])

    if b.budget_total_cents is not None and b.budget_total_cents <= 0:
        b.budget_total_cents = None
    if b.guest_count is not None and not (0 < b.guest_count <= 100000):
        b.guest_count = None

    b.styles = list(dict.fromkeys(s.strip().lower() for s in b.styles if s and s.strip()))[:8]
    services = [s.strip().lower() for s in b.services_needed if s and s.strip()]
    b.services_needed = list(dict.fromkeys(services)) or default_services(b.event_type)
    # Known categories in display order first, then anything new the engine came up with.
    order = {c: i for i, c in enumerate(CATEGORIES)}
    b.services_needed.sort(key=lambda c: order.get(c, len(order)))

    if not keep_title or not b.title.strip():
        b.title = make_title(b.event_type, b.location_text)
    b.title = b.title.strip()[:80]
    if b.notes is not None:
        b.notes = b.notes.strip()[:500] or None
    return b


def missing_questions(b: Brief, today: date, month_hint: Optional[str] = None) -> list[str]:
    """The most useful things to ask next (max 2)."""
    qs: list[str] = []
    start = parse_iso(b.start_date)
    if start and start < today:
        qs.append(f"{fmt_day(start)} has already passed. Which date did you mean?")
    elif not b.dates:
        qs.append(f"Which day in {month_hint}?" if month_hint else "What date (or dates) is it?")
    if not b.location_text:
        qs.append("Where will it be? A city or venue name is enough.")
    if b.budget_total_cents is None:
        photo_only = b.services_needed == ["photography"]
        qs.append("What's your budget for photos?" if photo_only else "What's your total budget?")
    if b.guest_count is None and b.event_type in GUEST_EVENT_TYPES:
        qs.append("About how many guests?")
    return qs[:MAX_QUESTIONS]


def hours_from_notes(notes: Optional[str]) -> Optional[float]:
    """Both engines record a requested duration in notes as 'N hours of coverage'."""
    m = re.search(r"(\d+(?:\.\d+)?)\s*hours? of coverage", notes or "", re.I)
    return float(m.group(1)) if m else None
