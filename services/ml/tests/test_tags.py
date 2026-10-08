"""Fast tests that don't load the model: python -m pytest tests"""
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.tags import BLACK_AND_WHITE, MAX_TAGS, TAG_GROUPS, all_prompts, select_tags  # noqa: E402


def test_clear_winner_per_group():
    probs = {"color": {"warm tones": 0.8, "cool tones": 0.1, "_natural": 0.1},
             "mood": {"moody": 0.5, "dramatic": 0.4, "_calm": 0.1}}
    tags = select_tags(probs)
    assert "warm tones" in tags      # 0.8 clears the color threshold
    assert "moody" not in tags       # 0.5 isn't a clear winner for mood


def test_neutral_options_never_emitted():
    assert select_tags({"light": {"_daylight": 0.95, "golden hour": 0.05}}) == []


def test_two_subjects_strongest_first():
    probs = {"subject": {"landscape": 0.38, "mountains": 0.35, "forest": 0.2, "beach": 0.07}}
    assert select_tags(probs) == ["landscape", "mountains"]


def test_black_and_white_replaces_color_tags():
    probs = {"color": {"warm tones": 0.9, "_natural": 0.1}}
    assert select_tags(probs, black_and_white=True) == [BLACK_AND_WHITE]


def test_max_tags_and_unique_prompts():
    probs = {g: {t: 1.0 for t in tags} for g, (_, _, tags) in TAG_GROUPS.items()}
    assert len(select_tags(probs, black_and_white=True)) <= MAX_TAGS
    names = [t for _, t, _ in all_prompts()]
    assert len(names) == len(set(names))


def test_black_and_white_detection():
    pytest = __import__("pytest")
    siglip = pytest.importorskip("app.siglip")  # needs torch installed
    gray = Image.new("RGB", (100, 100), (120, 120, 120))
    red = Image.new("RGB", (100, 100), (200, 40, 40))
    assert siglip.is_black_and_white(gray) and not siglip.is_black_and_white(red)
    assert siglip.to_pgvector([0.5, -0.25]) == "[0.500000,-0.250000]"
