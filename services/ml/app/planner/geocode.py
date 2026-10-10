"""Place name -> (display name, lat, lng).

Known LA-area places resolve instantly and offline. Anything else goes to
OpenStreetMap Nominatim, following its usage policy: a real User-Agent, at most one
request per second, and results cached.
"""
from __future__ import annotations

import re
import threading
import time
from typing import Callable, Optional

import httpx

Place = tuple[str, float, float]  # (display name, lat, lng)
Geocoder = Callable[[str], Optional[Place]]

# name/alias regex -> (display name, lat, lng). Longer, more specific names first.
KNOWN_PLACES: list[tuple[str, Place]] = [
    (r"griffith (?:park|observatory)", ("Griffith Park, Los Angeles, CA", 34.1184, -118.3004)),
    (r"west hollywood|weho", ("West Hollywood, CA", 34.0900, -118.3617)),
    (r"north hollywood|noho", ("North Hollywood, CA", 34.1870, -118.3813)),
    (r"hollywood", ("Hollywood, Los Angeles, CA", 34.0928, -118.3287)),
    (r"downtown (?:la|los angeles)|dtla", ("Downtown Los Angeles, CA", 34.0407, -118.2468)),
    (r"arts district", ("Arts District, Los Angeles, CA", 34.0403, -118.2324)),
    (r"koreatown|k-town|ktown", ("Koreatown, Los Angeles, CA", 34.0618, -118.3004)),
    (r"silver lake|silverlake", ("Silver Lake, Los Angeles, CA", 34.0869, -118.2702)),
    (r"echo park", ("Echo Park, Los Angeles, CA", 34.0782, -118.2606)),
    (r"los feliz", ("Los Feliz, Los Angeles, CA", 34.1063, -118.2848)),
    (r"ucla|westwood", ("UCLA, Los Angeles, CA", 34.0689, -118.4452)),
    (r"usc|university of southern california", ("USC, Los Angeles, CA", 34.0224, -118.2851)),
    (r"santa monica", ("Santa Monica, CA", 34.0195, -118.4912)),
    (r"venice beach|venice", ("Venice, Los Angeles, CA", 33.9850, -118.4695)),
    (r"marina del rey", ("Marina del Rey, CA", 33.9803, -118.4517)),
    (r"malibu", ("Malibu, CA", 34.0259, -118.7798)),
    (r"topanga", ("Topanga, CA", 34.0937, -118.6015)),
    (r"calabasas", ("Calabasas, CA", 34.1367, -118.6615)),
    (r"beverly hills", ("Beverly Hills, CA", 34.0736, -118.4004)),
    (r"culver city", ("Culver City, CA", 34.0211, -118.3965)),
    (r"manhattan beach", ("Manhattan Beach, CA", 33.8847, -118.4109)),
    (r"hermosa beach", ("Hermosa Beach, CA", 33.8622, -118.3995)),
    (r"redondo beach", ("Redondo Beach, CA", 33.8492, -118.3884)),
    (r"palos verdes", ("Palos Verdes, CA", 33.7866, -118.3896)),
    (r"long beach", ("Long Beach, CA", 33.7701, -118.1937)),
    (r"pasadena", ("Pasadena, CA", 34.1478, -118.1445)),
    (r"glendale", ("Glendale, CA", 34.1425, -118.2551)),
    (r"burbank", ("Burbank, CA", 34.1808, -118.3090)),
    (r"thousand oaks", ("Thousand Oaks, CA", 34.1706, -118.8376)),
    (r"irvine", ("Irvine, CA", 33.6846, -117.8265)),
    (r"anaheim", ("Anaheim, CA", 33.8366, -117.9143)),
    (r"newport beach", ("Newport Beach, CA", 33.6189, -117.9289)),
    (r"laguna beach", ("Laguna Beach, CA", 33.5427, -117.7854)),
    (r"orange county", ("Orange County, CA", 33.7175, -117.8311)),
    (r"san diego", ("San Diego, CA", 32.7157, -117.1611)),
    (r"santa barbara", ("Santa Barbara, CA", 34.4208, -119.6982)),
    (r"palm springs", ("Palm Springs, CA", 33.8303, -116.5453)),
    (r"joshua tree", ("Joshua Tree, CA", 34.1347, -116.3131)),
    (r"big bear", ("Big Bear Lake, CA", 34.2439, -116.9114)),
    (r"temecula", ("Temecula, CA", 33.4936, -117.1484)),
    (r"san francisco", ("San Francisco, CA", 37.7749, -122.4194)),
    (r"los angeles", ("Los Angeles, CA", 34.0522, -118.2437)),
]
# "LA" only counts in capitals ("in LA"), so the word "la" in other text doesn't match.
LA_CAPS = re.compile(r"\b(?:L\.A\.|LA)(?![\w.])")
LA_PLACE: Place = ("Los Angeles, CA", 34.0522, -118.2437)

_KNOWN = [(re.compile(rf"\b(?:{pattern})\b", re.I), place) for pattern, place in KNOWN_PLACES]


def find_known_place(text: str) -> Optional[tuple[int, Place]]:
    """Earliest known place mentioned in text, as (position, place)."""
    hits = [(m.start(), -len(m.group(0)), place) for rx, place in _KNOWN if (m := rx.search(text))]
    if (m := LA_CAPS.search(text)):
        hits.append((m.start(), -2, LA_PLACE))
    if not hits:
        return None
    pos, _, place = min(hits)
    return pos, place


def known_only(name: str) -> Optional[Place]:
    """Geocoder that never touches the network (tests, or when Nominatim is disabled)."""
    hit = find_known_place(name)
    return hit[1] if hit else None


class Nominatim:
    """Known places first, then OpenStreetMap Nominatim (rate-limited, cached)."""

    URL = "https://nominatim.openstreetmap.org/search"
    USER_AGENT = "photomatch-dev/0.1 (contact: dev)"

    def __init__(self, timeout: float = 6.0):
        self._http = httpx.Client(timeout=timeout, headers={"User-Agent": self.USER_AGENT})
        self._cache: dict[str, Optional[Place]] = {}
        self._lock = threading.Lock()
        self._last = 0.0

    def __call__(self, name: str) -> Optional[Place]:
        if (known := known_only(name)) is not None:
            return known
        key = " ".join(name.lower().split())
        if not key:
            return None
        with self._lock:  # one request at a time, at most one per second
            if key in self._cache:
                return self._cache[key]
            wait = 1.0 - (time.monotonic() - self._last)
            if wait > 0:
                time.sleep(wait)
            try:
                r = self._http.get(self.URL, params={"q": name, "format": "jsonv2", "limit": 1})
                r.raise_for_status()
                rows = r.json()
                place = (_short_name(rows[0]["display_name"]), float(rows[0]["lat"]), float(rows[0]["lon"])) if rows else None
            except (httpx.HTTPError, ValueError, KeyError, IndexError):
                place = None  # don't cache failures: may be a temporary network problem
                self._last = time.monotonic()
                return None
            self._last = time.monotonic()
            self._cache[key] = place
            return place


def _short_name(display_name: str) -> str:
    """'Sacramento, Sacramento County, California, United States' -> 'Sacramento, California'."""
    parts = [p.strip() for p in display_name.split(",")]
    parts = [p for p in parts if p and not p.endswith("County") and p != "United States" and not p.isdigit()]
    return ", ".join(parts[:1] + parts[-1:]) if len(parts) > 1 else (parts[0] if parts else display_name)
