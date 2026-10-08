"""Auto-tag vocabulary and selection.

SigLIP scores how well an image matches a sentence. Tags are grouped (color, light,
mood, style, subject). Within a group the scores are compared against each other
(softmax), and a tag is applied only when it clearly beats the alternatives, so
every photo gets a few readable tags ("Because you liked moody shots").

Each group has a neutral option (name starting with "_") that soaks up photos where
nothing special applies, e.g. ordinary daylight, so they don't get a wrong tag.

Black & white is measured from the pixels instead (see siglip.py): the model is
unreliable at it, and "no color" is trivial to detect directly.

Thresholds were tuned on a small sample set; re-check with scripts/try_images.py
after changing prompts.
"""

# group -> (max tags from this group, min within-group probability, {tag: prompt})
TAG_GROUPS: dict[str, tuple[int, float, dict[str, str]]] = {
    "color": (1, 0.6, {
        "warm tones": "a photo with warm golden orange tones",
        "cool tones": "a photo with cool blue tones",
        "vibrant colors": "a photo with vibrant saturated colors",
        "muted film look": "a photo with muted faded film colors",
        "_natural": "a photo with natural everyday colors",
    }),
    "light": (1, 0.6, {
        "golden hour": "a photo taken at golden hour sunset light",
        "blue hour": "a photo taken at blue hour twilight after sunset",
        "night": "a photo taken at night",
        "soft natural light": "a photo in soft natural window light",
        "studio lighting": "a studio photo with professional lighting",
        "backlit": "a backlit photo with the sun behind the subject",
        "_daylight": "a photo taken in ordinary bright daylight",
    }),
    "mood": (1, 0.85, {
        "moody": "a dark moody photo",
        "bright and airy": "a bright and airy photo",
        "dramatic": "a dramatic photo",
        "romantic": "a romantic photo",
        "playful": "a playful fun photo",
        "_calm": "an ordinary calm photo",
    }),
    "style": (1, 0.75, {
        "candid": "a candid photo of people not posing",
        "posed portrait": "a posed portrait photo",
        "documentary": "a documentary style photo",
        "editorial": "an editorial fashion photo",
        "minimalist": "a minimalist photo with lots of empty space",
        "aerial": "an aerial photo taken from high above",
        "_snapshot": "an ordinary photo",
    }),
    "subject": (2, 0.25, {
        "couple": "a photo of a couple",
        "wedding": "a wedding photo",
        "group": "a photo of a group of people",
        "family": "a family photo with children",
        "graduation": "a graduation photo",
        "portrait": "a portrait photo of a person",
        "street": "a street photography scene",
        "city": "a photo of a city",
        "architecture": "a photo of architecture and buildings",
        "interior": "a photo of a home interior",
        "product": "a product photo",
        "food": "a photo of food",
        "landscape": "a landscape photo",
        "beach": "a photo of a beach and the ocean",
        "forest": "a photo of a forest",
        "mountains": "a photo of mountains",
        "party": "a photo of a party or concert",
        "animals": "a photo of an animal",
        "flowers": "a photo of flowers",
    }),
}

BLACK_AND_WHITE = "black and white"

# At most this many tags per photo, strongest first.
MAX_TAGS = 6


def all_prompts() -> list[tuple[str, str, str]]:
    """[(group, tag, prompt), ...] in a stable order."""
    return [(group, tag, prompt) for group, (_, _, tags) in TAG_GROUPS.items() for tag, prompt in tags.items()]


def select_tags(group_probs: dict[str, dict[str, float]], black_and_white: bool = False) -> list[str]:
    """Pick tags from {group: {tag: within-group probability}}. Neutral options are never emitted."""
    picked: list[tuple[float, str]] = [(1.0, BLACK_AND_WHITE)] if black_and_white else []
    for group, (limit, minimum, _tags) in TAG_GROUPS.items():
        if black_and_white and group == "color":
            continue  # color tones don't apply to a black and white photo
        ranked = sorted(((p, t) for t, p in group_probs.get(group, {}).items()), reverse=True)
        picked += [(p, t) for p, t in ranked[:limit] if p >= minimum and not t.startswith("_")]
    picked.sort(reverse=True)
    return [t for _, t in picked[:MAX_TAGS]]
