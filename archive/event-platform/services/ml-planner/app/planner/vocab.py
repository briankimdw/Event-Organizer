"""Vocabulary shared by both engines: event types, vendor categories, style words.

Vendor category slugs are the vertical slugs of frontend/src/verticals/catalog.js (the
shared source of truth; tests/test_finders.py checks they stay in sync). To add a
vertical: add it to the catalog, then to CATEGORIES / VERTICAL_INFO here, give it a
share in budget.py, and (optionally) a finder in finders/. See docs/VERTICALS.md.
"""
from __future__ import annotations

# Photo-shoot event types (each matches a service slug under Photography), then the
# occasions from catalog.js OCCASIONS. 'event' is a generic party/event.
PHOTO_EVENT_TYPES = ["wedding", "graduation", "portrait", "event", "headshots", "real-estate", "product"]
OCCASION_TYPES = ["birthday", "engagement", "corporate", "baby-shower", "quinceanera", "dinner-party", "bachelor",
                  "holiday-party"]
EVENT_TYPES = PHOTO_EVENT_TYPES + OCCASION_TYPES + ["other"]

# Event type -> Photography service slug for search_providers(); unlisted types search all photographers.
SERVICE_SLUG = {
    "wedding": "wedding", "graduation": "graduation", "portrait": "portrait", "event": "event",
    "headshots": "headshots", "real-estate": "real-estate", "product": "product",
    "birthday": "event", "engagement": "portrait", "corporate": "event", "baby-shower": "event",
    "quinceanera": "event", "dinner-party": "event", "bachelor": "event", "holiday-party": "event",
}

# Photography services that aren't something you hire for an event (classes, meetups).
NON_HIREABLE_SERVICES = {"coaching", "meetups"}

EVENT_LABELS = {
    "wedding": "Wedding",
    "graduation": "Graduation",
    "portrait": "Portrait session",
    "event": "Event",
    "headshots": "Headshots",
    "real-estate": "Real estate shoot",
    "product": "Product shoot",
    "birthday": "Birthday party",
    "engagement": "Proposal",
    "corporate": "Corporate event",
    "baby-shower": "Baby shower",
    "quinceanera": "Quinceañera",
    "dinner-party": "Dinner party",
    "bachelor": "Bachelor/ette party",
    "holiday-party": "Holiday party",
    "other": "Photo shoot",
}

# Typical length of the event in hours: picks photo packages and prices hourly vendors.
TYPICAL_HOURS = {
    "wedding": 8, "event": 4, "graduation": 1.5, "portrait": 1.5, "headshots": 1,
    "real-estate": 2, "product": 3, "other": 2,
    "birthday": 4, "engagement": 2, "corporate": 4, "baby-shower": 3, "quinceanera": 6,
    "dinner-party": 4, "bachelor": 5, "holiday-party": 4,
}

# Guests to assume for per-person prices when the user didn't say.
TYPICAL_GUESTS = {
    "wedding": 100, "event": 50, "graduation": 30, "birthday": 30, "engagement": 2, "corporate": 60,
    "baby-shower": 25, "quinceanera": 120, "dinner-party": 10, "bachelor": 10, "holiday-party": 50,
}

# Event types where the guest count matters (the planner asks for it).
GUEST_EVENT_TYPES = {"wedding", "event", "birthday", "corporate", "baby-shower", "quinceanera", "dinner-party",
                     "bachelor", "holiday-party"}

# Vendor categories = catalog verticals, in catalog order (the display order):
# slug -> (label, bookable on the platform). Every vertical has a finder now.
CATEGORIES: dict[str, tuple[str, bool]] = {
    "photography": ("Photography", True),
    "videography": ("Videography", True),
    "venue": ("Venues", True),
    "catering": ("Catering", True),
    "private-chef": ("Private chefs", True),
    "cakes": ("Cakes & desserts", True),
    "bar": ("Bar & drinks", True),
    "music": ("DJs & live music", True),
    "entertainment": ("Entertainment", True),
    "florals": ("Florals", True),
    "decor": ("Decor & design", True),
    "hair-makeup": ("Hair & makeup", True),
    "rentals": ("Rentals", True),
    "planning": ("Planners", True),
    "officiant": ("Officiants", True),
    "transportation": ("Transportation", True),
    "staffing": ("Event staff", True),
    "wellness": ("Wellness", True),
}

# Per vertical (from catalog.js): (noun, plural noun, budget word, visual).
# visual = has portfolios, so SigLIP style matching applies.
VERTICAL_INFO: dict[str, tuple[str, str, str, bool]] = {
    "photography": ("photographer", "photographers", "photography", True),
    "videography": ("videographer", "videographers", "video", True),
    "venue": ("venue", "venues", "venue", True),
    "catering": ("caterer", "caterers", "catering", True),
    "private-chef": ("private chef", "private chefs", "chef", True),
    "cakes": ("baker", "bakers", "cake & dessert", True),
    "bar": ("bar service", "bar services", "bar", True),
    "music": ("DJ or musician", "DJs and musicians", "music", False),
    "entertainment": ("entertainer", "entertainers", "entertainment", True),
    "florals": ("florist", "florists", "florals", True),
    "decor": ("event designer", "event designers", "decor", True),
    "hair-makeup": ("hair & makeup artist", "hair & makeup artists", "hair & makeup", True),
    "rentals": ("rental company", "rental companies", "rentals", True),
    "planning": ("planner", "planners", "planning", False),
    "officiant": ("officiant", "officiants", "officiant", False),
    "transportation": ("transportation company", "transportation companies", "transportation", True),
    "staffing": ("staffing team", "staffing teams", "staffing", False),
    "wellness": ("wellness pro", "wellness pros", "wellness", True),
}


def category_label(slug: str) -> str:
    return CATEGORIES.get(slug, (slug.replace("-", " ").capitalize(), False))[0]


def is_bookable(slug: str) -> bool:
    return CATEGORIES.get(slug, ("", False))[1]


def vendor_noun(slug: str, plural: bool = False) -> str:
    info = VERTICAL_INFO.get(slug)
    if not info:
        return category_label(slug).lower()
    return info[1] if plural else info[0]


def budget_word(slug: str) -> str:
    return VERTICAL_INFO.get(slug, ("", "", category_label(slug).lower(), False))[2]


def is_visual(slug: str) -> bool:
    return VERTICAL_INFO.get(slug, ("", "", "", False))[3]


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
