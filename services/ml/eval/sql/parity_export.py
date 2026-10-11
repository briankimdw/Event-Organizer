"""SQL parity check, step 1: export a catalog, swipe scenarios and what the Python port
(eval/feeds.py FeedV2) ranks for each, for parity.mjs to replay against the SQL.

    python eval/sql/parity_export.py <workdir> <fixture.json>
"""
import sys, json, uuid, pathlib
HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent)); sys.path.insert(0, str(HERE.parent.parent))
import numpy as np
from simulate import load, build_catalog, User, run_session
from feeds import FeedV2, LIKE
W = pathlib.Path(sys.argv[1]); out = pathlib.Path(sys.argv[2])
rows, E = load(W, "google/siglip-base-patch16-224")
cat, groups = build_catalog(rows, E, 3, keep=np.sort(np.random.default_rng(5).choice(len(rows), 260, replace=False)))
ns = uuid.UUID("12345678-1234-5678-1234-567812345678")
U = lambda kind, i: str(uuid.uuid5(ns, f"{kind}{i}"))
photos = [{"id": U("p", i), "album": U("a", int(cat.album[i])), "provider": U("v", int(cat.provider[i])),
           "vertical": str(cat.vertical[i]), "created": float(cat.created[i]),
           "emb": "[" + ",".join(f"{x:.7f}" for x in cat.E[i]) + "]"} for i in range(cat.n)]
algo = FeedV2(cat, {})
scen = []
def add(name, swipes, category=None):
    f = algo.feed(swipes, 20, category, np.random.default_rng(0))
    main = [U("p", p) for p, e in f if not e]
    ps = algo.provider_scores(swipes)
    n_likes = sum(a in LIKE for _, a in swipes)
    scen.append({"name": name, "user": U("u", len(scen)), "category": category,
                 "swipes": [[U("p", i), a] for i, a in swipes], "main": main,
                 "providers": sorted(((U("v", p), s) for p, s in ps.items()), key=lambda t: -t[1]) if algo.tastes(swipes)[2] >= 3 else []})
rng = np.random.default_rng(1)
add("no swipes", [])
G = len(groups)
for t in range(6):
    tg = [int(rng.integers(G))] if t % 2 == 0 else list(map(int, rng.choice(G, 2, replace=False)))
    r = run_session(algo, cat, User(tg, np.random.default_rng(t)), 12 + 8 * t, np.random.default_rng(t))
    add(f"user{t} {len(r['swipes'])} swipes", r["swipes"])
    if t == 1:
        add("passes only", [(i, "pass") for i, _ in r["swipes"][:8]])
        add("one like", [(i, "pass") for i, _ in r["swipes"][:5]] + [(int(np.flatnonzero(cat.group == tg[0])[0]), "like")])
    if t == 0:
        # taste change: likes of one group, then passes on more of it (the taste goes stale)
        def went_stale(g):
            m = np.flatnonzero(cat.group == g)
            sw = [(int(i), "like") for i in m[:3]] + [(int(i), "pass") for i in m[3:12]]
            return len(m) >= 12 and not algo.tastes(sw)[0]
        g0 = next(g for g in range(G) if went_stale(g))  # a group where every taste goes stale
        grp = np.flatnonzero(cat.group == g0)
        others = np.flatnonzero(cat.group != g0)[:6]
        add("taste went stale", [(int(i), "like") for i in grp[:3]] + [(int(i), "pass") for i in grp[3:12]]
            + [(int(i), "pass") for i in others])
        add("stale + new like", [(int(i), "like") for i in grp[:3]] + [(int(i), "pass") for i in grp[3:12]]
            + [(int(others[0]), "like")])
    if t == 3:
        add(f"user{t} photography only", r["swipes"], "photography")
        add(f"user{t} catering only", r["swipes"], "catering")
json.dump({"photos": photos, "verticals": sorted(set(cat.vertical.tolist())), "scenarios": scen}, open(out, "w"))
print(len(photos), "photos", len(scen), "scenarios")
