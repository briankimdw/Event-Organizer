"""Compatibility shim: the vendor search moved to app/planner/finders/ (one finder per
vertical). Old imports keep working:

    from app.planner.search import PhotographerFinder, SupabaseCatalog, choose_package
"""
from __future__ import annotations

from .finders.base import (  # noqa: F401
    MAX_EMBEDDINGS, MAX_OPTIONS, WEIGHTS, Candidate, SupabaseCatalog, haversine_km, normalise_style,
    parse_ewkb_point, parse_vector,
)
from .finders.photography import RELATED_SERVICES, PhotographerFinder, choose_package, package_price  # noqa: F401
