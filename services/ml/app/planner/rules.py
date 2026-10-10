"""Deterministic parser: no API key, no network (except geocoding unknown places).

Good enough for typical requests ("wedding June 14-15 2027 in Malibu, $25k, 120
guests, candid golden hour"). Claude handles the long tail when it's configured.

Parsing order matters: dates are found first and masked out of the text, so their
numbers can't be mistaken for a budget or a guest count.
"""
from __future__ import annotations

import calendar
import re
from datetime import date, timedelta
from typing import Optional

from .brief import MAX_DATES, date_range, finalize, missing_questions
from .budget import default_services
from .geocode import Geocoder, find_known_place, known_only
from .schema import Brief, LatLng, Understanding
from .vocab import CATEGORIES, STYLE_SYNONYMS

I = re.IGNORECASE

# =========================================================================== dates
MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}
MONTH = r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?"
DAY = r"(\d{1,2})(?!\d)(?:st|nd|rd|th)?"
YEAR = r"(?:,?\s*(\d{4})(?!\d))?"
RANGE_SEP = r"\s*(?:-|–|—|to|through|thru|till|until)\s*"
PEOPLE = (r"(?:guests?|people|persons?|attendees|pax|ppl|heads|adults|invitees|students|graduates|grads|"
          r"kids|children|employees|team\s+members|members|folks)")
# "June 14 and 5 people": the 5 is a head count, not a day.
NOT_PEOPLE = r"(?!\s*\+?\s*(?:or\s+so\s+)?" + PEOPLE + r"\b)"
WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
# Full names only: "sun", "wed", "sat" are ordinary words too.
WEEKDAY = r"(monday|tuesday|wednesday|thursday|friday|saturday|sunday)"
# "Saturday, June 14" / "Sat 6/14": a weekday in front of a date is part of that date.
WEEKDAY_PREFIX = r"(?:(?:on\s+)?(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?\.?,?\s+)?"
ORDINALS = {"first": 1, "1st": 1, "second": 2, "2nd": 2, "third": 3, "3rd": 3, "fourth": 4, "4th": 4, "last": -1}

RX_ISO = re.compile(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b(?:" + RANGE_SEP + r"(\d{4})-(\d{1,2})-(\d{1,2})\b)?")
# "June 14 to June 15 2027", "June 14-15", "Jun 14th - 16th, 2027", "May 3rd", "between June 14 and 16"
RX_MONTH_DAY = re.compile(
    r"\b" + WEEKDAY_PREFIX + r"(between\s+)?" + MONTH + r"\s+" + DAY + NOT_PEOPLE + YEAR
    + r"(?:(" + RANGE_SEP + r"|\s+and\s+)" + WEEKDAY_PREFIX + r"(?:" + MONTH + r"\s+)?" + DAY + NOT_PEOPLE + YEAR + r")?\b", I)
# "14-15 June 2027", "the 3rd of May", "14 June"
RX_DAY_MONTH = re.compile(
    r"\b" + WEEKDAY_PREFIX + r"(?:the\s+)?" + DAY + r"(?:" + RANGE_SEP + DAY + r")?\s+(?:of\s+)?" + MONTH + YEAR + r"\b", I)
# "6/14-6/16", "6/14/2027", "6/14-16"
RX_NUMERIC = re.compile(
    r"(?<![\w/])" + WEEKDAY_PREFIX + r"(\d{1,2})/(\d{1,2})(?:/(\d{2}|\d{4}))?"
    r"(?:" + RANGE_SEP + r"(?:(\d{1,2})/)?(\d{1,2})(?:/(\d{2}|\d{4}))?)?(?![\d/])", I)
RX_NTH_WEEKEND = re.compile(
    r"\b(?:the\s+)?(first|1st|second|2nd|third|3rd|fourth|4th|last)\s+weekend\s+(?:of|in)\s+" + MONTH + YEAR, I)
RX_WEEKEND = re.compile(r"\b(this|next)\s+weekend\b", I)
RX_WEEKDAY = re.compile(r"\b(?:(this|next|on|coming)\s+)?" + WEEKDAY + r"\b", I)
RX_TODAY = re.compile(r"\b(today|tonight|tomorrow)\b", I)
# Month without a day: "next May", "in June 2027", "what about July instead"
RX_MONTH_ONLY = re.compile(
    r"\b(?:(in|next|this|during|around|about|early|late|mid-?|for|by)\s+(?:the\s+)?(?:month\s+of\s+)?" + MONTH + YEAR
    + r"|" + MONTH + r"\s+(\d{4})"
    + r"|(january|february|april|june|july|august|september|october|november|december))\b", I)


def _month(name: str) -> int:
    return MONTHS[name.lower()[:3]]


def _year(text: Optional[str]) -> Optional[int]:
    if not text:
        return None
    y = int(text)
    return y + 2000 if y < 100 else y


def _safe_date(y: int, m: int, d: int) -> Optional[date]:
    try:
        return date(y, m, d)
    except ValueError:
        return None


def _next_occurrence(m: int, d: int, today: date) -> Optional[date]:
    """The next time month/day comes around (today counts)."""
    for y in (today.year, today.year + 1):
        if (dt := _safe_date(y, m, d)) and dt >= today:
            return dt
    return None


def _resolve(m1: int, d1: int, y1: Optional[int], m2: int, d2: int, y2: Optional[int], today: date):
    """Resolve a (possibly single-day) range; a year written once applies to both ends."""
    if y1 is None and y2 is not None:
        y1 = y2 - 1 if (m1, d1) > (m2, d2) else y2  # "Dec 30 - Jan 2, 2028"
    start = _safe_date(y1, m1, d1) if y1 else _next_occurrence(m1, d1, today)
    if not start:
        return None
    if y2 is None:
        y2 = start.year + (1 if (m2, d2) < (m1, d1) else 0)
    end = _safe_date(y2, m2, d2)
    if not end:
        return None
    return (start, end) if end >= start else None


def _mask(text: str, m: re.Match) -> str:
    return text[:m.start()] + " " * (m.end() - m.start()) + text[m.end():]


def _nth_weekend(n: int, month: int, year: int) -> date:
    """Saturday of the nth weekend (a weekend counts for the month its Saturday is in)."""
    days_in = calendar.monthrange(year, month)[1]
    saturdays = [date(year, month, d) for d in range(1, days_in + 1) if date(year, month, d).weekday() == 5]
    return saturdays[n - 1] if n > 0 else saturdays[-1]


def _month_year(m: int, y: Optional[int], today: date, force_next: bool = False) -> int:
    """Year for a month mentioned without one: this year unless it's over ('next' skips the current month)."""
    if y:
        return y
    if force_next:
        return today.year if m > today.month else today.year + 1
    return today.year if m >= today.month else today.year + 1


MonthHint = tuple[int, int, bool]  # (year, month, year was written explicitly)


def parse_dates(text: str, today: date) -> tuple[list[date], Optional[MonthHint], str]:
    """-> (event days, month hint when only a month was given, text with dates masked)."""
    spans: list[tuple[date, date]] = []

    for m in list(RX_ISO.finditer(text)):
        start = _safe_date(int(m[1]), int(m[2]), int(m[3]))
        end = _safe_date(int(m[4]), int(m[5]), int(m[6])) if m[4] else start
        if start and end and end >= start:
            spans.append((start, end))
        text = _mask(text, m)

    for m in list(RX_NTH_WEEKEND.finditer(text)):
        n, month = ORDINALS[m[1].lower()], _month(m[2])
        year = _month_year(month, _year(m[3]), today)
        sat = _nth_weekend(n, month, year)
        if sat < today and not m[3]:
            sat = _nth_weekend(n, month, year + 1)
        spans.append((sat, sat + timedelta(days=1)))
        text = _mask(text, m)

    for m in list(RX_MONTH_DAY.finditer(text)):
        between, m1, d1, y1 = m[1], _month(m[2]), int(m[3]), _year(m[4])
        if m[7]:
            sep, m2, d2, y2 = m[5], (_month(m[6]) if m[6] else m1), int(m[7]), _year(m[8])
            if sep.strip().lower() == "and" and not between:  # "June 14 and June 21": two separate days
                for mm, dd, yy in ((m1, d1, y1 or y2), (m2, d2, y2 or y1)):
                    if (r := _resolve(mm, dd, yy, mm, dd, yy, today)):
                        spans.append(r)
            elif (r := _resolve(m1, d1, y1, m2, d2, y2, today)):
                spans.append(r)
        elif (r := _resolve(m1, d1, y1, m1, d1, y1, today)):
            spans.append(r)
        text = _mask(text, m)

    for m in list(RX_DAY_MONTH.finditer(text)):
        month, d1, y = _month(m[3]), int(m[1]), _year(m[4])
        d2 = int(m[2]) if m[2] else d1
        if (r := _resolve(month, d1, y, month, d2, y, today)):
            spans.append(r)
        text = _mask(text, m)

    for m in list(RX_NUMERIC.finditer(text)):
        m1, d1, y1 = int(m[1]), int(m[2]), _year(m[3])
        if not (1 <= m1 <= 12 and 1 <= d1 <= 31):
            continue
        if m[5]:
            m2, d2, y2 = (int(m[4]) if m[4] else m1), int(m[5]), _year(m[6])
        else:
            m2, d2, y2 = m1, d1, y1
        if (r := _resolve(m1, d1, y1, m2, d2, y2, today)):
            spans.append(r)
        text = _mask(text, m)

    for m in list(RX_WEEKEND.finditer(text)):
        sat = today + timedelta(days=(5 - today.weekday()) % 7)
        if today.weekday() == 6:  # Sunday
            sat = today - timedelta(days=1) if m[1].lower() == "this" else today + timedelta(days=6)
        elif m[1].lower() == "next" and today.weekday() == 5:
            sat += timedelta(days=7)  # on a Saturday, "next weekend" is the following one
        spans.append((max(sat, today), sat + timedelta(days=1)))
        text = _mask(text, m)

    for m in list(RX_TODAY.finditer(text)):
        d = today + timedelta(days=1 if m[1].lower() == "tomorrow" else 0)
        spans.append((d, d))
        text = _mask(text, m)

    for m in list(RX_WEEKDAY.finditer(text)):
        target = WEEKDAYS.index(m[2].lower())
        ahead = (target - today.weekday()) % 7 or 7  # "Saturday", "this Saturday": the coming one
        if (m[1] or "").lower() == "next" and today.weekday() + ahead <= 6:
            ahead += 7  # "next Saturday" = Saturday of next week (Monday-start weeks)
        spans.append((today + timedelta(days=ahead),) * 2)
        text = _mask(text, m)

    days = sorted({d for start, end in spans for d in date_range(start, end)})[:MAX_DATES]

    hint: Optional[MonthHint] = None
    if not days:
        for m in RX_MONTH_ONLY.finditer(text):
            if m[2]:
                word, name, year = m[1].lower(), m[2], m[3]
                if name.lower() == "may" and word in ("for", "by", "about"):
                    continue  # "for may", "about may" are too ambiguous
            else:
                word, name, year = "", (m[4] or m[6]), m[5]
            month = _month(name)
            hint = (_month_year(month, _year(year), today, force_next=word == "next"), month, bool(year))
            text = _mask(text, m)
            break
    return days, hint, text


# =========================================================================== numbers
NUM = r"(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)"
MULT = r"(k|thousand|grand|m|mil|million)"
PER_UNIT = re.compile(r"^\s*(?:/|per\b|an?\s+(?:hour|person|guest|head)\b|each\b|hourly\b)", I)
RX_MONEY = [
    re.compile(r"\$\s?" + NUM + r"\s*" + MULT + r"?(?![a-z])", I),
    re.compile(r"\b" + NUM + r"\s*" + MULT + r"?\s*(?:dollars|usd|bucks)\b", I),
    re.compile(r"\b" + NUM + r"\s*(k|thousand|grand)(?![a-z])", I),
    re.compile(r"\b(?:budget|spend|afford)\b[^\d$\n]{0,25}?" + NUM + r"\s*" + MULT + r"?(?![a-z\d])" + NOT_PEOPLE, I),
]
MULTIPLIER = {"k": 1_000, "thousand": 1_000, "grand": 1_000, "m": 1_000_000, "mil": 1_000_000, "million": 1_000_000}
RX_BUDGET_WORD = re.compile(r"\b(budget|spend|afford|total|max|maximum|up\s+to|under)\b", I)


def parse_budget(text: str) -> Optional[int]:
    """Total budget in cents. Prefers amounts next to 'budget'; else the largest amount."""
    found: list[tuple[int, bool]] = []
    taken: list[tuple[int, int]] = []
    for rx in RX_MONEY:
        for m in rx.finditer(text):
            if any(a <= m.start(1) < b for a, b in taken):
                continue
            if PER_UNIT.match(text[m.end():]):
                continue  # "$150/hour", "$40 per guest"
            value = float(m[1].replace(",", ""))
            if m.lastindex and m.lastindex >= 2 and m[2]:
                value *= MULTIPLIER[m[2].lower()]
            if value < 20 or value > 50_000_000:
                continue
            near_budget = bool(RX_BUDGET_WORD.search(text[max(0, m.start() - 30):m.end()]))
            found.append((int(round(value * 100)), near_budget))
            taken.append((m.start(1), m.end()))
    if not found:
        return None
    flagged = [c for c, near in found if near]
    return max(flagged or [c for c, _ in found])


WORD_NUMBERS = {
    "a couple": 2, "a few": 3, "a dozen": 12, "a hundred": 100,
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
    "ten": 10, "eleven": 11, "twelve": 12, "fifteen": 15, "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
}
RX_GUESTS = [
    re.compile(r"\b(\d{1,3}(?:,\d{3})+|\d+)\s*\+?\s*(?:or\s+so\s+)?" + PEOPLE + r"\b", I),
    re.compile(r"\b(?:party|group|team|family|crew)\s+of\s+(\d+)\b", I),
    re.compile(r"\bguest\s*(?:count|list)\s*(?:of|is|:|around|about|~)?\s*(?:about|around|~)?\s*(\d+)", I),
    re.compile(r"\bhead\s*count\s*(?:of|is|:)?\s*(?:about|around|~)?\s*(\d+)", I),
    re.compile(r"\b(\d+)[-\s]person\b", I),
]


def parse_guests(text: str) -> Optional[int]:
    t = text
    for word, n in WORD_NUMBERS.items():
        t = re.sub(rf"\b{word}\b(?=\s+(?:of\s+)?{PEOPLE})", str(n), t, flags=I)
    for rx in RX_GUESTS:
        if (m := rx.search(t)):
            n = int(m[1].replace(",", ""))
            if 0 < n <= 100000:
                return n
    return None


RX_HOURS = re.compile(r"\b(\d+(?:\.\d+)?)\s*(?:-\s*)?(?:hours?|hrs?)\b(?!\s*(?:away|drive))", I)


def parse_hours(text: str) -> Optional[float]:
    """Hours of coverage ("8 hours", "a 2-hour session"); ignores rates like "$150 an hour"."""
    for m in RX_HOURS.finditer(text):
        if re.search(r"(?:\$\s?\d[\d,.]*\s*(?:/|per|an?)?\s*)$", text[:m.end(1)]):
            continue
        hours = float(m[1])
        if 0 < hours <= 24:
            return hours
    return None


# =========================================================================== words
# Event type keywords. The earliest mention in the text wins; ties go to the first listed.
EVENT_PATTERNS: list[tuple[str, str]] = [
    ("event", r"grad(?:uation)?\s+part(?:y|ies)|engagement\s+part(?:y|ies)|bridal\s+shower|baby\s+shower|rehearsal\s+dinner"),
    ("wedding", r"weddings?|elop(?:e|ement|ing)|nuptials|vow\s+renewal|bride|groom"),
    ("graduation", r"graduation|grad\s+(?:photos?|pics?|pictures?|shoot|session|portraits?)|grad|commencement|"
                   r"senior\s+(?:photos?|pictures?|portraits?|session)|cap\s+and\s+gown"),
    ("headshots", r"head\s?shots?|linkedin\s+(?:photos?|pictures?|headshots?)|corporate\s+portraits?|profile\s+pictures?"),
    ("real-estate", r"real[\s-]estate|listing\s+(?:photos?|shoot)|property\s+(?:photos?|shoot)|airbnb|realtor|home\s+listing"),
    ("product", r"product\s+(?:photos?|shoot|photography|pictures?)|e-?commerce|catalog(?:ue)?|food\s+photography|"
                r"menu\s+photos?|products?"),
    ("portrait", r"portraits?|family\s+(?:photos?|pictures?|session|shoot)|maternity|newborn|"
                 r"engagement\s+(?:photos?|shoot|session|pictures?)|couples?\s+(?:photos?|shoot|session)|"
                 r"photo\s?shoot|pet\s+photos?|boudoir"),
    ("event", r"part(?:y|ies)|birthday|quincea[nñ]era|quince|bar\s+mitzvah|bat\s+mitzvah|b'nai\s+mitzvah|gala|"
              r"conference|corporate\s+event|concert|festival|fundraiser|reunion|anniversary|launch|celebration|"
              r"events?|reception"),
]
_EVENT_RX = [(t, re.compile(rf"\b(?:{p})\b", I)) for t, p in EVENT_PATTERNS]

CATEGORY_PATTERNS: dict[str, str] = {
    "photography": r"photo(?:s|graphy|grapher|graphers)?|pictures?|pics|head\s?shots?|portraits?|photo\s?shoot",
    "videography": r"video(?:s|grapher|graphers|graphy)?|filmmaker|film(?:ed)?\s+(?:it|the|our|my)",
    "venue": r"venues?|ballroom|reception\s+hall|banquet\s+hall",
    "catering": r"cater(?:ing|er|ers)|buffet|dinner\s+service",
    "florals": r"florals?|flowers|florists?|bouquets?",
    "music": r"dj|djs|live\s+band|band|music|musicians?|string\s+quartet",
    "attire": r"attire|wedding\s+dress|dress|gown|tux(?:edo)?s?",
    "hair-makeup": r"make-?up|hair\s+and\s+make-?up|hmua|hair\s+stylists?|glam",
    "decor": r"decor|decorations?|rentals?",
    "extras": r"cake|stationery|invitations?|favou?rs|officiant",
}
_CATEGORY_RX = {c: re.compile(rf"\b(?:{p})\b", I) for c, p in CATEGORY_PATTERNS.items()}
RX_PLANNING = re.compile(r"\b(organi[sz]e|plan|planning|coordinate|everything|whole\s+thing|entire|full\s+event)\b", I)
RX_ONLY = re.compile(r"\b(only|just)\b", I)
RX_ADD = re.compile(r"\b(also|add|plus|as\s+well|too)\b", I)
RX_INSTEAD = re.compile(r"\b(instead|rather|change|switch|replace|actually)\b", I)
RX_CHEAPER = re.compile(
    r"\b(cheaper|less\s+expensive|more\s+affordable|lower\s+(?:the\s+)?(?:budget|price|cost)|"
    r"cut\s+(?:the\s+)?(?:budget|costs?)|save\s+money|tighter\s+budget|reduce\s+(?:the\s+)?budget|too\s+expensive)\b", I)
RX_PRICIER = re.compile(
    r"\b(bigger\s+budget|increase\s+(?:the\s+)?budget|raise\s+(?:the\s+)?budget|more\s+budget|splurge|"
    r"higher\s+budget|spend\s+more)\b", I)

_STYLE_RX = [(re.compile(rf"\b(?:{p})\b", I), tag) for p, tag in STYLE_SYNONYMS.items()]

# Capitalised words after "in/at/near" that aren't places.
NOT_PLACES = {
    "i", "my", "our", "a", "an", "june", "july", "may", "march", "april", "august", "september",
    "october", "november", "december", "january", "february", "monday", "tuesday", "wednesday",
    "thursday", "friday", "saturday", "sunday", "spring", "summer", "fall", "autumn", "winter",
    "black", "golden", "noon", "budget", "least", "total", "all", "any", "some", "this", "that",
}
CONNECTORS = r"(?:of|de|del|la|el|on|the|by|at)"
RX_PLACE = re.compile(
    r"\b(?:in|at|near|around|by)\s+((?:the\s+)?[A-Z][\w'&.-]*(?:\s+(?:[A-Z][\w'&.-]*|" + CONNECTORS + r")){0,5})")


def parse_event_type(text: str) -> Optional[str]:
    hits = [(m.start(), i, t) for i, (t, rx) in enumerate(_EVENT_RX) if (m := rx.search(text))]
    return min(hits)[2] if hits else None


def parse_categories(text: str) -> list[str]:
    t = re.sub(r"cap\s+and\s+gown", " ", text, flags=I)
    return [c for c in CATEGORIES if c in _CATEGORY_RX and _CATEGORY_RX[c].search(t)]


def parse_styles(text: str) -> list[str]:
    hits = sorted((m.start(), tag) for rx, tag in _STYLE_RX if (m := rx.search(text)))
    return list(dict.fromkeys(tag for _, tag in hits))


def parse_location(text: str, geocode: Geocoder) -> Optional[tuple[str, Optional[tuple[float, float]]]]:
    """-> (location text, (lat, lng) or None). Known LA places win unless a more specific
    place (e.g. a venue name) comes first and the geocoder finds it."""
    known = find_known_place(text)
    for m in RX_PLACE.finditer(text):
        if known and known[0] <= m.start(1) + 4:
            break  # the known place is this phrase (or comes first)
        phrase = re.sub(r"(?:\s+" + CONNECTORS + r")+$", "", m[1]).strip(" .,'")
        words = phrase.lower().split()
        if not words or words[0] in NOT_PLACES or len(phrase) < 3:
            continue
        if any(rx.fullmatch(" ".join(words)) for rx, _ in _STYLE_RX):
            continue
        place = geocode(phrase)
        if place:
            return place[0], (place[1], place[2])
        if known:  # "at Calamigos Ranch in Malibu": keep the venue name, use the town's coordinates
            name, lat, lng = known[1]
            return f"{phrase}, {name}", (lat, lng)
        return phrase, None
    if known:
        name, lat, lng = known[1]
        return name, (lat, lng)
    return None


# =========================================================================== engine
def _note_kind(note: str) -> Optional[str]:
    if "hours of coverage" in note:
        return "hours"
    if note.startswith("Sometime in"):
        return "month"
    if note.startswith("Prefers cheaper"):
        return "cheaper"
    return None


def _merge_notes(old: Optional[str], new: list[str], has_dates: bool) -> Optional[str]:
    """Notes are short sentences; a new note replaces an older one of the same kind."""
    parts = [p.strip().rstrip(".") for p in re.split(r"(?<=\.)\s+", old or "") if p.strip()]
    for n in new:
        kind = _note_kind(n)
        parts = [p for p in parts if kind is None or _note_kind(p) != kind]
        if n not in parts:
            parts.append(n)
    if has_dates:
        parts = [p for p in parts if _note_kind(p) != "month"]
    return ". ".join(parts) + "." if parts else None


def _shift_to_month(days: list[date], year: int, month: int) -> list[date]:
    """Move an event to another month, keeping the day of month and the length."""
    first = days[0]
    start = date(year, month, min(first.day, calendar.monthrange(year, month)[1]))
    return [start + timedelta(days=(d - first).days) for d in days]


def _scale_budget(cents: int, factor: float) -> int:
    step = 10000 if cents * factor >= 100000 else 1000  # round to $100, or $10 for small budgets
    return max(step, int(round(cents * factor / step)) * step)


def understand(message: str, today: date, previous: Optional[Brief] = None,
               geocode: Geocoder = known_only) -> Understanding:
    """Free text (+ the previous brief, for follow-ups) -> brief + questions."""
    text = " ".join(message.split())
    b = previous.model_copy(deep=True) if previous else Brief()
    notes: list[str] = []

    days, hint, masked = parse_dates(text, today)
    month_hint_text = None
    if days:
        b.dates = [d.isoformat() for d in days]
        b.start_date, b.end_date = b.dates[0], b.dates[-1]
    elif hint:
        year, month, explicit = hint
        prev_days = sorted(d for d in (_iso(x) for x in (previous.dates if previous else [])) if d)
        if prev_days:  # follow-up "what about July instead": same day of month, same length
            shifted = _shift_to_month(prev_days, year if explicit else prev_days[0].year, month)
            if shifted[0] < today and not explicit:
                shifted = _shift_to_month(prev_days, shifted[0].year + 1, month)
            b.dates = [d.isoformat() for d in shifted]
            b.start_date, b.end_date = b.dates[0], b.dates[-1]
        else:
            b.dates, b.start_date, b.end_date = [], None, None
            month_hint_text = f"{calendar.month_name[month]} {year}"
            notes.append(f"Sometime in {month_hint_text}")

    event_type = parse_event_type(masked)
    type_changed = bool(previous and event_type and event_type != previous.event_type)
    if event_type:
        b.event_type = event_type
    elif not previous:
        b.event_type = "other"

    budget = parse_budget(masked)
    if budget:
        b.budget_total_cents = budget
    elif RX_CHEAPER.search(text):
        if b.budget_total_cents:
            b.budget_total_cents = _scale_budget(b.budget_total_cents, 0.8)
        notes.append("Prefers cheaper options")
    elif RX_PRICIER.search(text) and b.budget_total_cents:
        b.budget_total_cents = _scale_budget(b.budget_total_cents, 1.25)

    if (guests := parse_guests(masked)):
        b.guest_count = guests
    if (hours := parse_hours(masked)):
        notes.append(f"{hours:g} hours of coverage")

    if (location := parse_location(masked, geocode)):
        b.location_text = location[0]
        b.location = LatLng(lat=location[1][0], lng=location[1][1]) if location[1] else None

    if (styles := parse_styles(masked)):
        replace = not previous or RX_INSTEAD.search(text)
        b.styles = styles if replace else list(dict.fromkeys(b.styles + styles))

    mentioned = parse_categories(masked)
    if not previous or type_changed:
        if mentioned and not RX_PLANNING.search(text):
            b.services_needed = mentioned  # "photographer for my wedding": just photos
        else:
            b.services_needed = list(dict.fromkeys(default_services(b.event_type) + mentioned))
    elif mentioned:
        if RX_ONLY.search(text) and not RX_ADD.search(text):
            b.services_needed = mentioned
        else:
            b.services_needed = list(dict.fromkeys(b.services_needed + mentioned))

    b.notes = _merge_notes(b.notes, notes, has_dates=bool(b.dates))
    b = finalize(b, today=today, geocode=geocode, previous=previous)
    return Understanding(engine="rules", brief=b, reply=None,
                         questions=missing_questions(b, today, month_hint_text))


def _iso(value: str) -> Optional[date]:
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        return None
