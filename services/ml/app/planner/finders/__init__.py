"""Vendor finders: one per vertical (catalog.js slugs), the generic one by default.

    base.py         shared search + scoring (dates, budget, distance, rating, style) and the Supabase reads
    photography.py  photo packages per shoot type (wedding / event / headshots...)
    generic.py      any other vertical: per-person, per-item, daily and hourly prices

A vertical that needs special rules gets its own BaseFinder subclass in this folder and
an entry in FINDER_CLASSES. Every finder is called as finder(brief, budget_cents) -> options.
"""
from __future__ import annotations

from typing import Callable, Optional

from ..schema import Brief
from ..vocab import CATEGORIES
from .base import BaseFinder, Candidate, Choice, SupabaseCatalog
from .generic import VendorFinder
from .photography import PhotographerFinder

Finder = Callable[[Brief, Optional[int]], list[dict]]

# Verticals with their own finder; everything else in CATEGORIES uses VendorFinder.
FINDER_CLASSES: dict[str, type[BaseFinder]] = {
    "photography": PhotographerFinder,
}


def build_finders(catalog: SupabaseCatalog, siglip=None) -> dict[str, Finder]:
    """A finder for every vertical in vocab.CATEGORIES."""
    finders: dict[str, Finder] = {}
    for slug in CATEGORIES:
        cls = FINDER_CLASSES.get(slug)
        finders[slug] = cls(catalog, siglip=siglip) if cls else VendorFinder(catalog, siglip=siglip, vertical=slug)
    return finders


__all__ = ["BaseFinder", "Candidate", "Choice", "Finder", "FINDER_CLASSES", "PhotographerFinder",
           "SupabaseCatalog", "VendorFinder", "build_finders"]
