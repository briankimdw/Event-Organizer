"""Travel fee math, mirroring frontend/src/api/locations.js (parsePoint, distanceKm)."""

import math
import re
import struct
from decimal import ROUND_HALF_UP, Decimal

EARTH_RADIUS_KM = 6371

_WKT_POINT = re.compile(r"POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)", re.IGNORECASE)
_HEX = re.compile(r"[0-9a-fA-F]+")


def _number(v: object) -> float | None:
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    return float(v) if math.isfinite(v) else None


def _valid(lat: object, lng: object) -> tuple[float, float] | None:
    lat_f, lng_f = _number(lat), _number(lng)
    if lat_f is None or lng_f is None or abs(lat_f) > 90 or abs(lng_f) > 180:
        return None
    return lat_f, lng_f


def parse_point(value: object) -> tuple[float, float] | None:
    """A PostGIS point (EWKB/WKB hex, GeoJSON dict or WKT) as (lat, lng), or None."""
    if not value:
        return None
    if isinstance(value, dict):
        coords = value.get("coordinates")
        if not isinstance(coords, (list, tuple)) or len(coords) < 2:
            return None
        return _valid(coords[1], coords[0])
    if not isinstance(value, str):
        return None

    wkt = _WKT_POINT.search(value)
    if wkt:
        try:
            lng, lat = float(wkt.group(1)), float(wkt.group(2))
        except ValueError:
            return None
        return _valid(lat, lng)

    if not _HEX.fullmatch(value) or len(value) < 42:
        return None
    data = bytes.fromhex(value[: len(value) // 2 * 2])
    order = "<" if data[0] == 1 else ">"
    (geom_type,) = struct.unpack_from(f"{order}I", data, 1)
    if geom_type & 0xFF != 1:  # not a point
        return None
    offset = 9 if geom_type & 0x20000000 else 5  # skip the SRID when present
    if len(data) < offset + 16:
        return None
    lng, lat = struct.unpack_from(f"{order}dd", data, offset)
    return _valid(lat, lng)


def distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle (haversine) distance in km."""
    rad = math.pi / 180
    d_lat = (lat2 - lat1) * rad
    d_lng = (lng2 - lng1) * rad
    h = (
        math.sin(d_lat / 2) ** 2
        + math.cos(lat1 * rad) * math.cos(lat2 * rad) * math.sin(d_lng / 2) ** 2
    )
    return EARTH_RADIUS_KM * 2 * math.asin(min(1.0, math.sqrt(h)))


def travel_fee_cents(distance_km: float, service_radius_km: int, rate_cents_per_km: int) -> int:
    """Fee for the km beyond the service radius, rounded half-up to a whole cent."""
    product = max(0.0, distance_km - service_radius_km) * rate_cents_per_km
    return int(Decimal(str(product)).quantize(Decimal("1"), ROUND_HALF_UP))
