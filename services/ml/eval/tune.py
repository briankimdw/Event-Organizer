"""Compare ranking variants on the simulated users (the search behind REPORT.md).

    python eval/tune.py <workdir> [--users 100] [--set main|cold|clusters|...]

Prints, per variant and scenario, the average P@10 over the learning window
(after 10/20/30/40 swipes; for "change", 10/20/30/40 swipes after the switch) and the
like rate of the whole session. Different catalog seed than simulate.py's default
report, so the final numbers aren't the ones the knobs were tuned on.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

from feeds import FeedV1, FeedV2, Oracle  # noqa: E402
from simulate import build_catalog, evaluate, load  # noqa: E402

SCENARIOS = ["single", "double", "noisy", "change", "cross"]

SETS = {
    "main": [
        ("v1 (current)", None),
        ("v2 defaults", {}),
        ("v2 no centring", dict(center=False)),
        ("v2 min_likes=3", dict(min_likes=3)),
        ("v2 min_likes=2", dict(min_likes=2)),
        ("v2 no decay", dict(half_life=None)),
        ("v2 single centroid", dict(mode="centroid")),
        ("v2 knn", dict(mode="knn")),
        ("v2 cold diverse", dict(cold="diverse")),
        ("v2 explore novel", dict(explore_mode="novel")),
        ("v2 mmr 0.3", dict(mmr=0.3)),
    ],
    "next": [
        ("v1 (current)", None),
        ("centroid", dict(mode="centroid")),
        ("centroid sep-pass", dict(mode="centroid", pass_mode="separate")),
        ("clusters", dict(mode="clusters")),
        ("clusters sep-pass", dict(mode="clusters", pass_mode="separate")),
        ("knn", dict(mode="knn")),
        ("kernel tau=.05", dict(mode="kernel", tau=0.05)),
        ("kernel tau=.1", dict(mode="kernel", tau=0.1)),
        ("kernel tau=.1 g=1", dict(mode="kernel", tau=0.1, gamma=1.0)),
        ("kernel tau=.2", dict(mode="kernel", tau=0.2)),
    ],
    "scope": [("not scoped", {}), ("scoped to category", dict(scope_category=True)),
              ("centroid not scoped", dict(mode="centroid")), ("centroid scoped", dict(mode="centroid", scope_category=True))],
    "change": [("v2", {})] + [(f"hl={h} stale={st}", dict(half_life=h, stale=st)) for h in (40, 20, 10) for st in (None, 1.0, 2.0)],
    "ablation": [
        ("v1 (current)", None),
        ("v2 (shipped)", {}),
        ("v2 without centring", dict(center=False)),
        ("v2 waiting for 3 likes", dict(min_likes=3)),
        ("v2 without decay", dict(half_life=None)),
        ("v2 one taste (centroid)", dict(mode="centroid")),
        ("v2 cold start = newest", dict(cold="newest")),
        ("v2 without stale rule", dict(stale=None)),
        ("v2 without category scope", dict(scope_category=False)),
        ("v2 provider penalty 0.05", dict(penalty=0.05)),
        ("v2 kernel scoring (not shipped)", dict(mode="kernel", tau=0.1)),
    ],
    "batch": [("v1 (current)", None), ("v2", {})],
    "gamma": [(f"gamma={g}", dict(gamma=g)) for g in (0.0, 0.25, 0.5, 0.75, 1.0)],
    "decay": [(f"half_life={h}", dict(half_life=h)) for h in (None, 80, 40, 20, 10)],
    "clusters": [(f"join={j} k={k}", dict(join_cos=j, max_clusters=k)) for k in (2, 3, 4) for j in (0.2, 0.3, 0.35, 0.45)],
    "penalty": [(f"penalty={p}", dict(penalty=p)) for p in (0.0, 0.02, 0.05, 0.1)],
    "explore": [(f"explore={e} {m}", dict(explore=e, explore_mode=m)) for e in (0.1, 0.15, 0.25) for m in ("tail", "novel")],
    "cold": [(f"cold={c} min_likes={m}", dict(cold=c, min_likes=m)) for c in ("newest", "diverse") for m in (1, 2, 3)],
}


def window(s: dict, scenario: str, metric: str = "auc") -> float:
    ks = [50, 60, 70, 80] if scenario == "change" else [6, 10, 20, 30, 40]
    return float(np.mean([s[k].get(metric, np.nan) for k in ks if k in s]))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("workdir", type=Path)
    ap.add_argument("--model", default="google/siglip-base-patch16-224")
    ap.add_argument("--users", type=int, default=100)
    ap.add_argument("--set", default="main")
    ap.add_argument("--seed", type=int, default=11)
    ap.add_argument("--base", default="", help="extra v2 params for every variant, e.g. gamma=0.75,half_life=20")
    a = ap.parse_args()
    rows, E = load(a.workdir, a.model)
    cat, groups = build_catalog(rows, E, a.seed)
    base = {}
    for kv in filter(None, a.base.split(",")):
        k, v = kv.split("=")
        base[k] = None if v == "None" else (float(v) if v.replace(".", "").isdigit() else v)
        if k in ("min_likes", "max_clusters", "knn_m", "pool", "window"):
            base[k] = int(float(v))
    print("AUC over the learning window | P@10 over the same window | like rate")
    print(f"{'variant':24} " + " ".join(f"{s[:6]:>6}" for s in SCENARIOS) + "   mean |" + " ".join(f"{s[:6]:>6}" for s in SCENARIOS) + "   mean | like% learn")
    variants = [("oracle", "oracle")] + SETS[a.set]
    for name, params in variants:
        algo = Oracle(cat) if params == "oracle" else FeedV1(cat) if params is None else FeedV2(cat, {**base, **params}, name)
        vals, p10, likes, learn = [], [], [], []
        for sc in SCENARIOS:
            s = evaluate(algo, cat, groups, sc, a.users, seed=a.seed + 1)
            vals.append(window(s, sc))
            p10.append(window(s, sc, "p10"))
            learn.append(s["learn_median"])
            likes.append(np.nanmean([x for x in (s["like_rate_1_20"], s["like_rate_21_40"], s["like_rate_41_60"]) if x is not None]))
        print(f"{name:24} " + " ".join(f"{v:6.3f}" for v in vals) + f"  {np.nanmean(vals):.3f} |"
              + " ".join(f"{v:6.3f}" for v in p10) + f"  {np.mean(p10):.3f} | {100 * np.mean(likes):4.1f}  {np.mean(learn):4.1f}", flush=True)


if __name__ == "__main__":
    main()
