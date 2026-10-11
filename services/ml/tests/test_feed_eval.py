"""The Python ports of the Discover ranking (eval/feeds.py) on synthetic data.

FeedV2 mirrors supabase/migrations/20261012000100_feed_v2.sql (checked position by
position in PGlite by eval/sql/parity.mjs), so these pin the SQL's behaviour too.
"""
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "eval"))

from feeds import Catalog, FeedV1, FeedV2, _diversify  # noqa: E402


def make_catalog(groups=4, per_group=24, dim=32, seed=0):
    """Clustered unit vectors with a big shared component (like SigLIP), 3 photos per
    album, 2 albums per provider; vertical = 'photography' for groups 0-1, else 'catering'."""
    rng = np.random.default_rng(seed)
    common = rng.normal(size=dim) * 3
    centres = rng.normal(size=(groups, dim))
    E, group = [], []
    for g in range(groups):
        for _ in range(per_group):
            E.append(common + centres[g] + 0.35 * rng.normal(size=dim))
            group.append(g)
    E = np.array(E)
    E /= np.linalg.norm(E, axis=1, keepdims=True)
    n = len(E)
    album = np.arange(n) // 3
    return Catalog(E=E.astype(np.float32), album=album, provider=album // 2, created=rng.random(n),
                   vertical=np.array(["photography" if g < 2 else "catering" for g in group]),
                   group=np.array(group))


def top_groups(cat, feed, k=10):
    return [int(cat.group[p]) for p, explore in feed[:k] if not explore]


def likes_of(cat, g, n, action="like"):
    return [(int(i), action) for i in np.flatnonzero(cat.group == g)[:n]]


def test_v1_waits_for_three_likes():
    cat = make_catalog()
    v1 = FeedV1(cat)
    assert v1.taste(likes_of(cat, 1, 2)) is None
    assert v1.taste(likes_of(cat, 1, 3)) is not None


def test_v2_learns_from_one_like():
    cat = make_catalog()
    feed = FeedV2(cat).feed(likes_of(cat, 2, 1), 20, None, np.random.default_rng(0))
    groups = top_groups(cat, feed)
    assert groups.count(2) >= 6


def test_v2_two_tastes_both_shown():
    cat = make_catalog()
    swipes = likes_of(cat, 0, 3) + likes_of(cat, 3, 3)
    algo = FeedV2(cat)
    assert len(algo.tastes(swipes)[0]) == 2
    groups = top_groups(cat, algo.feed(swipes, 20, None, np.random.default_rng(0)))
    assert 0 in groups and 3 in groups


def test_v2_passes_only_steers_away():
    cat = make_catalog()
    swipes = likes_of(cat, 1, 8, "pass")
    groups = top_groups(cat, FeedV2(cat).feed(swipes, 20, None, np.random.default_rng(0)))
    assert 1 not in groups


def test_v2_stale_taste_is_dropped():
    cat = make_catalog()
    g1 = np.flatnonzero(cat.group == 1)
    swipes = [(int(i), "like") for i in g1[:3]] + [(int(i), "pass") for i in g1[3:12]]
    tastes, _, n_likes = FeedV2(cat).tastes(swipes)
    assert tastes == [] and n_likes == 0
    assert FeedV2(cat, {"stale": None}).tastes(swipes)[2] == 3


def test_v2_category_scoped_taste():
    cat = make_catalog()
    # Mostly catering likes, one photography like: the photography feed follows the latter.
    swipes = likes_of(cat, 2, 6) + likes_of(cat, 0, 1)
    groups = top_groups(cat, FeedV2(cat).feed(swipes, 20, "photography", np.random.default_rng(0)))
    assert groups.count(0) >= 5


def test_v2_cold_start_covers_many_groups():
    cat = make_catalog(groups=6, per_group=15)
    feed = FeedV2(cat).feed([], 12, None, np.random.default_rng(0))
    assert len({int(cat.group[p]) for p, _ in feed}) >= 5


def test_diversify_matches_reference():
    """One photo per album and the per-provider penalty, as in discover_feed's SQL."""
    cat = make_catalog()
    rng = np.random.default_rng(3)
    idx = np.arange(cat.n)
    sim = rng.random(cat.n)
    ranked, _ = _diversify(cat, idx, sim, 0.05)
    order = sorted(range(cat.n), key=lambda k: (-sim[k], -cat.created[k]))
    best = {}
    for k in order:
        best.setdefault(int(cat.album[k]), k)
    keep = sorted(best.values(), key=order.index)
    counts, key = {}, {}
    for k in keep:
        p = int(cat.provider[k])
        counts[p] = counts.get(p, 0) + 1
        key[k] = sim[k] - 0.05 * (counts[p] - 1)
    assert list(ranked) == sorted(keep, key=lambda k: (-key[k], -cat.created[k]))
