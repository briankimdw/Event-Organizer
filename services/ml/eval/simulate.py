"""Simulated users swiping through Discover, to measure how well the feed learns taste.

    python eval/simulate.py <workdir> [--model ...] [--users 200] [--algos v1,v2] [--small]

The catalog is built from the labeled photos (eval/manifest.csv): photos from the same
Flickr creator in the same group form an album (max 5 photos), albums are given to
simulated providers (2-4 albums each, mostly one group, sometimes a second group of the
same vertical). Each user has 1 or 2 target groups and likes ~90% of target photos and
~3% of the rest (25% of likes are saves); the deck is consumed the way the app does it
(batches of 20, refetch when fewer than 3 cards are left).

Scenarios
  single   one target group
  double   two target groups (any verticals)
  noisy    one target group, sloppy swiper (75% / 8%)
  change   likes group A for 40 swipes, then switches to group B
  cross    likes a photography style AND a non-photo group; measured on the
           photography-only feed (category filter) against the photography style

Metrics (averaged over users, after k swipes, on a freshly requested feed of 20)
  P@10      share of the first 10 cards (as shown, with exploration) from a target group
  main P@10 the same without the exploration cards (what the model ranks first)
  nDCG@20   rank-weighted version of the same
  AUC       whole ranking: share of (target album, other album) pairs in the right order
            (0.5 = random; unaffected by the target group running out)
  learn     swipes until AUC >= 0.9 (median; censored at the end)
  like rate share of cards actually liked during the session (the app's batching included)
  both@10   double users: share of feeds with both target groups in the first 10
  providers distinct providers in the first 20; ILS = mean pairwise cosine (lower = more varied)
  prov nDCG provider "% match" ranking vs the share of each provider's photos in the target
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

from dataset import MANIFEST, read_manifest  # noqa: E402
from embed import cache_path  # noqa: E402
from feeds import Catalog, FeedV1, FeedV2, Oracle  # noqa: E402

BATCH, LOW_WATER = 20, 3
CURVE = list(range(0, 61, 2))


# --------------------------------------------------------------------------- catalog
def build_catalog(rows, E, seed=0, keep=None) -> tuple[Catalog, list[str]]:
    rng = np.random.default_rng(seed)
    groups = sorted({r["group"] for r in rows})
    gidx = {g: k for k, g in enumerate(groups)}
    vert_of = {r["group"]: r["vertical"] for r in rows}
    idx = np.arange(len(rows)) if keep is None else np.asarray(keep)
    albums: dict[str, list[int]] = defaultdict(list)
    for i in idx:
        albums[rows[i]["album"]].append(int(i))
    # split big albums into chunks of at most 5
    album_list: list[tuple[str, list[int]]] = []
    for key, members in albums.items():
        members = list(rng.permutation(members))
        for s in range(0, len(members), 5):
            album_list.append((rows[members[0]]["group"], members[s:s + 5]))
    by_group: dict[str, list[int]] = defaultdict(list)
    for a, (g, _) in enumerate(album_list):
        by_group[g].append(a)
    for g in by_group:
        by_group[g] = list(rng.permutation(by_group[g]))
    owner = np.full(len(album_list), -1)
    n_prov = 0
    for g in groups:
        while by_group[g]:
            take = int(rng.integers(2, 5))
            mine = [by_group[g].pop() for _ in range(min(take, len(by_group[g])))]
            same_vertical = [h for h in groups if h != g and vert_of[h] == vert_of[g] and by_group[h]]
            if same_vertical and rng.random() < 0.35:
                h = same_vertical[int(rng.integers(len(same_vertical)))]
                mine.append(by_group[h].pop())
            owner[mine] = n_prov
            n_prov += 1
    N = len(rows)
    album = np.full(N, -1)
    for a, (_, members) in enumerate(album_list):
        album[members] = a
    sel = idx
    cat = Catalog(
        E=E[sel], album=album[sel], provider=owner[album[sel]], created=rng.random(len(sel)),
        vertical=np.array([vert_of[rows[i]["group"]] for i in sel]),
        group=np.array([gidx[rows[i]["group"]] for i in sel]),
    )
    return cat, groups


# --------------------------------------------------------------------------- users
class User:
    def __init__(self, targets, rng, p_hit=0.9, p_miss=0.03, p_save=0.25):
        self.targets, self.rng, self.p_hit, self.p_miss, self.p_save = set(targets), rng, p_hit, p_miss, p_save

    def swipe(self, group: int) -> str:
        p = self.p_hit if group in self.targets else self.p_miss
        if self.rng.random() < p:
            return "save" if self.rng.random() < self.p_save else "like"
        return "pass"


def ndcg(rel: list[float], k: int) -> float:
    rel = rel[:k]
    dcg = sum(r / np.log2(i + 2) for i, r in enumerate(rel))
    ideal = sum(1 / np.log2(i + 2) for i in range(min(k, len(rel))))
    return dcg / ideal if ideal else 0.0


def feed_metrics(algo, cat: Catalog, swipes, targets, rng, category=None, both=None):
    f = algo.feed(swipes, 20, category, rng)
    if not f:
        return None
    rel = [1.0 if cat.group[p] in targets else 0.0 for p, _ in f]
    main = [r for (p, e), r in zip(f, rel) if not e]
    top = [p for p, _ in f[:20]]
    En = cat.E[top]
    S = En @ En.T
    m = len(top)
    out = {
        "p10": float(np.mean(rel[:10])),
        "main_p10": float(np.mean(main[:10])) if main else 0.0,
        "ndcg20": ndcg(rel, 20),
        "providers": len({int(cat.provider[p]) for p in top}),
        "ils": float((S.sum() - m) / (m * (m - 1))) if m > 1 else 1.0,
        "groups": len({int(cat.group[p]) for p in top}),
    }
    ranked = getattr(algo, "last_ranked", None)
    if ranked is not None and len(ranked):
        y = np.isin(cat.group[ranked], list(targets))
        npos, nneg = y.sum(), (~y).sum()
        if npos and nneg:
            # share of (target, other) album pairs ranked the right way round
            out["auc"] = float(((~y)[::-1].cumsum()[::-1][y]).sum() / (npos * nneg))
    if both:
        g10 = {int(cat.group[p]) for p, _ in f[:10]}
        out["both10"] = float(all(t in g10 for t in both))
    return out


def provider_ndcg(algo, cat: Catalog, swipes, targets) -> float | None:
    s = algo.provider_scores(swipes)
    if not s:
        return None
    provs = sorted(s, key=lambda p: -s[p])
    rel = {p: float(np.isin(cat.group[cat.provider == p], list(targets)).mean()) for p in s}
    dcg = sum(rel[p] / np.log2(i + 2) for i, p in enumerate(provs[:5]))
    ideal = sum(r / np.log2(i + 2) for i, r in enumerate(sorted(rel.values(), reverse=True)[:5]))
    return dcg / ideal if ideal else None


def run_session(algo, cat, user, n_swipes, rng, category=None, switch=None, eval_targets=None,
                eval_category="same", both=None):
    """Swipe like the app does; record the learning curve on fresh feeds."""
    swipes: list[tuple[int, str]] = []
    deck: list[int] = []
    known: set[int] = set()
    liked_flags = []
    curve = {}
    shown_first20 = []
    done = False
    ecat = category if eval_category == "same" else eval_category
    if hasattr(algo, "targets"):
        algo.targets = set(eval_targets if eval_targets is not None else user.targets)
    for k in range(n_swipes + 1):
        if switch and k == switch[0]:
            user.targets = set(switch[1])
            if hasattr(algo, "targets"):
                algo.targets = set(user.targets)
        if k in CURVE or (switch and (k - switch[0]) in CURVE and k >= switch[0]):
            tg = eval_targets if eval_targets is not None else user.targets
            curve[k] = feed_metrics(algo, cat, swipes, tg, rng, ecat, both)
            if k == 0:
                curve["prov"] = None
        if k == n_swipes:
            break
        deck = [c for c in deck if c not in {i for i, _ in swipes}]
        if len(deck) < LOW_WATER and not done:
            rows = [p for p, _ in algo.feed(swipes, BATCH, category, rng)]
            fresh = [p for p in rows if p not in known]
            known.update(fresh)
            deck += fresh
            done = not fresh
        if not deck:
            break
        c = deck.pop(0)
        a = user.swipe(int(cat.group[c]))
        swipes.append((c, a))
        liked_flags.append(a != "pass")
        if len(shown_first20) < 20:
            shown_first20.append(c)
    tg = eval_targets if eval_targets is not None else user.targets
    return {"curve": curve, "likes": liked_flags, "swipes": swipes,
            "first20_groups": len({int(cat.group[c]) for c in shown_first20}),
            "prov_ndcg": provider_ndcg(algo, cat, swipes[:40], tg) if len(swipes) >= 40 and not switch else None}


# --------------------------------------------------------------------------- scenarios
def scenario_users(cat: Catalog, groups, scenario, n, seed):
    rng = np.random.default_rng(seed)
    G = len(groups)
    gvert = {}
    for g in range(G):
        gvert[g] = cat.vertical[cat.group == g][0]
    photo = [g for g in range(G) if gvert[g] == "photography"]
    other = [g for g in range(G) if gvert[g] != "photography"]
    out = []
    for _ in range(n):
        if scenario in ("single", "noisy"):
            out.append(([int(rng.integers(G))], None))
        elif scenario == "double":
            out.append((list(map(int, rng.choice(G, 2, replace=False))), None))
        elif scenario == "change":
            a, b = map(int, rng.choice(G, 2, replace=False))
            out.append(([a], [b]))
        elif scenario == "cross":
            out.append(([int(rng.choice(photo)), int(rng.choice(other))], None))
    return out


def evaluate(algo, cat, groups, scenario, n_users, seed=1, n_swipes=60):
    users = scenario_users(cat, groups, scenario, n_users, seed)
    res = []
    for u, (targets, later) in enumerate(users):
        rng = np.random.default_rng(seed * 100003 + u)
        kw = {}
        if scenario == "noisy":
            user = User(targets, rng, 0.75, 0.08)
        else:
            user = User(targets, rng)
        if scenario == "change":
            kw = dict(switch=(40, later))
            n = 80
        elif scenario == "cross":
            kw = dict(eval_targets={targets[0]}, eval_category="photography")
            n = n_swipes
        else:
            n = n_swipes
        if scenario == "double":
            kw["both"] = targets
        res.append(run_session(algo, cat, user, n, rng, **kw))
    return summarise(res, scenario)


def summarise(res, scenario):
    out = {}
    keys = ["p10", "main_p10", "ndcg20", "providers", "ils", "groups", "both10", "auc"]
    curves = [r["curve"] for r in res]
    for k in sorted({k for c in curves for k in c if isinstance(k, int)}):
        vals = [c[k] for c in curves if c.get(k)]
        if vals:
            out[k] = {m: float(np.mean([v[m] for v in vals if m in v])) for m in keys if any(m in v for v in vals)}
    # time to learn: first curve point with main P@10 >= 0.8 (censored at the end)
    start = 40 if scenario == "change" else 0
    end = max(k for c in curves for k in c if isinstance(k, int))
    t = []
    for c in curves:
        hit = [k - start for k in sorted(x for x in c if isinstance(x, int)) if k >= start and c[k] and c[k].get("auc", 0) >= 0.9]
        t.append(hit[0] if hit else end - start + 2)
    out["learn_median"] = float(np.median(t))
    out["learn_mean"] = float(np.mean(t))
    likes = [r["likes"] for r in res]
    def rate(a, b):
        v = [np.mean(l[a:b]) for l in likes if len(l) > a]
        return float(np.mean(v)) if v else None
    out["like_rate_1_20"] = rate(0, 20)
    out["like_rate_21_40"] = rate(20, 40)
    out["like_rate_41_60"] = rate(40, 60)
    if scenario == "change":
        out["like_rate_after_switch_1_20"] = rate(40, 60)
        out["like_rate_after_switch_21_40"] = rate(60, 80)
    first_like = [next((i for i, x in enumerate(l) if x), len(l)) + 1 for l in likes]
    out["first_like_median"] = float(np.median(first_like))
    out["first20_groups"] = float(np.mean([r["first20_groups"] for r in res]))
    pv = [r["prov_ndcg"] for r in res if r["prov_ndcg"] is not None]
    out["prov_ndcg5"] = float(np.mean(pv)) if pv else None
    return out


def load(workdir: Path, model: str, manifest: Path = MANIFEST):
    rows_all = read_manifest(manifest)
    z = np.load(cache_path(workdir, model), allow_pickle=False)
    by_id = {r["id"]: r for r in rows_all}
    rows = [by_id[i] for i in z["ids"]]
    return rows, z["embeddings"].astype(np.float32)


ALGOS = {
    "v1": lambda cat: FeedV1(cat),
    "v2": lambda cat: FeedV2(cat, {}, "v2"),
    "oracle": lambda cat: Oracle(cat),
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("workdir", type=Path)
    ap.add_argument("--model", default="google/siglip-base-patch16-224")
    ap.add_argument("--users", type=int, default=200)
    ap.add_argument("--algos", default="v1,v2")
    ap.add_argument("--scenarios", default="single,double,noisy,change,cross")
    ap.add_argument("--small", action="store_true", help="a ~150-photo catalog (today's scale)")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", type=Path)
    ap.add_argument("--batch", type=int, default=BATCH, help="cards per feed request (the app uses 20)")
    a = ap.parse_args()
    globals()["BATCH"] = a.batch
    rows, E = load(a.workdir, a.model)
    keep = None
    if a.small:
        r = np.random.default_rng(7)
        keep = np.sort(r.choice(len(rows), 150, replace=False))
    cat, groups = build_catalog(rows, E, a.seed, keep)
    print(f"catalog: {cat.n} photos, {len(set(cat.album))} albums, {len(set(cat.provider))} providers, {len(groups)} groups")
    results = {}
    for name in a.algos.split(","):
        algo = ALGOS[name](cat)
        for sc in a.scenarios.split(","):
            results[(name, sc)] = evaluate(algo, cat, groups, sc, a.users, seed=a.seed + 1)
            s = results[(name, sc)]
            pts = [k for k in (0, 10, 20, 40, 60) if k in s] if sc != "change" else [40, 50, 60, 80]
            print(f"{name:4} {sc:7} P@10 " + " ".join(f"{k}:{s[k]['p10']:.2f}" for k in pts if k in s)
                  + f" | learn {s['learn_median']:.0f} | like {s['like_rate_1_20']:.2f}/{s['like_rate_21_40']:.2f}/{(s['like_rate_41_60'] or 0):.2f}"
                  + f" | prov {s['prov_ndcg5'] or 0:.2f}")
    if a.out:
        a.out.write_text(json.dumps({f"{k[0]}|{k[1]}": v for k, v in results.items()}, indent=1, default=str))


if __name__ == "__main__":
    main()
