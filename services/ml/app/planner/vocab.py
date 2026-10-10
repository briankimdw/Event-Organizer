"""Vocabulary shared by both engines: event types, vendor categories, style words.

To add a vendor category later (e.g. when caterers can sign up): add it to CATEGORIES,
give it a share in budget.py, and flip `bookable` once search.py can find those vendors.
"""
from __future__ import annotations

# Event types the planner understands. Each photography-style type matches a service
# slug under the Photography vertical (service_categories), so search can use it directly.
EVENT_TYPES = ["wedding", "graduation", "portrait", "event", "headshots", "real-estate", "product", "other"]

# Event type -> service slug for search_providers(); 'other' searches all photographers.
SERVICE_SLUG = {t: t for t in EVENT_TYPES if t != "other"}

# Photography services that aren't something you hire for an event (classes, meetups).
NON_HIREABLE_SERVICES = {"coaching", "meetups"}

EVENT_LABELS = {
    "wedding": "Wedding",
    "graduation": "Graduation photos",
    "portrait": "Portrait session",
    "event": "Event",
    "headshots": "Headshots",
    "real-estate": "Real estate shoot",
    "product": "Product shoot",
    "other": "Photo shoot",
}

# Typical hours of photo coverage, used to pick a package when the user didn't say.
TYPICAL_HOURS = {
    "wedding": 8, "event": 4, "graduation": 1.5, "portrait": 1.5, "headshots": 1,
    "real-estate": 2, "product": 3, "other": 2,
}

# Vendor categories: slug -> (label, bookable on the platform today).
# Order here is the display order.
CATEGORIES: dict[str, tuple[str, bool]] = {
    "photography": ("Photography", True),
    "videography": ("Videography", False),
    "venue": ("Venue", False),
    "catering": ("Catering", False),
    "florals": ("Florals", False),
    "music": ("Music & DJ", False),
    "attire": ("Attire", False),
    "hair-makeup": ("Hair & makeup", False),
    "decor": ("Decor & rentals", False),
    "extras": ("Cake, stationery & extras", False),
}


def category_label(slug: str) -> str:
    return CATEGORIES.get(slug, (slug.replace("-", " ").capitalize(), False))[0]


def is_bookable(slug: str) -> bool:
    return CATEGORIES.get(slug, ("", False))[1]


# Style words people use -> the SigLIP auto-tag names in app/tags.py (plus black and white).
# Keys are regexes (matched case-insensitively on word boundaries); first match wins per tag.
STYLE_SYNONYMS: dict[str, str] = {
    r"golden[\s-]?hour|sunset light|sunset": "golden hour",
    r"blue[\s-]?hour|twilight": "blue hour",
    r"black[\s-]?(?:and|&|n)[\s-]?white|b\s?&\s?w|b/w|monochrome": "black and white",
    r"candid|unposed|natural moments": "candid",
    r"moody|dark and moody": "moody",
    r"bright and airy|light and airy|airy": "bright and airy",
    r"romantic": "romantic",
    r"dramatic": "dramatic",
    r"playful|fun|whimsical": "playful",
    r"documentary|photojournalistic|photojournalism|storytelling": "documentary",
    r"editorial|fashion|magazine": "editorial",
    r"minimalist|minimal": "minimalist",
    r"film look|filmic|film photography|film photos|analog|vintage|muted": "muted film look",
    r"warm tones|warm": "warm tones",
    r"cool tones|cool blue": "cool tones",
    r"vibrant|colou?rful|saturated|bold colou?rs": "vibrant colors",
    r"natural light|soft light|window light": "soft natural light",
    r"studio": "studio lighting",
    r"night(?:time)?": "night",
    r"backlit": "backlit",
    r"posed|traditional": "posed portrait",
    r"aerial|drone": "aerial",
}

# All style names the planner may output (shown to Claude as the preferred vocabulary).
STYLE_TAGS = sorted(set(STYLE_SYNONYMS.values()))
