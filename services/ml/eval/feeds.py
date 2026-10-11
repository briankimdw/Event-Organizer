"""Python ports of the Discover ranking, for offline evaluation.

`FeedV1` is a line-by-line port of the CURRENT SQL (discover_feed in
20261008214116_discover_feed_soft_diversity.sql, provider_matches in
20261009023242_provider_matches.sql). `FeedV2` is the tunable candidate; with the
defaults in V2_DEFAULTS it mirrors 20261012000100_feed_v2.sql (checked against the SQL
in PGlite by eval/sql/parity.mjs).

Catalog arrays (numpy, one row per photo): E (unit embeddings), album, provider,
created (bigger = newer), vertical (category slug). Swipes: [(photo index, action)]
in time order, action in {"like", "save", "pass"}.
"""
from __future__ import annotations

from dataclasses import dataclass, field, replace

import numpy as np

LIKE = ("like", "save")


@dataclass
class Catalog:
    E: np.ndarray
    album: np.ndarray
    provider: np.ndarray
    created: np.ndarray
    vertical: np.ndarray
    group: np.ndarray            # eval label (never used by the ranking)

    @property
    def n(self) -> int:
        return len(self.E)

    def candidates(self, swipes, category):
        swiped = np.zeros(self.n, bool)
        for i, _ in swipes:
            swiped[i] = True
        ok = ~swiped
        if category is not None:
            ok &= self.vertical == category
        return np.flatnonzero(ok)


def _cos(M: np.ndarray, v: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(v)
    if n < 1e-12:
        return np.zeros(len(M))
    return (M @ v) / (np.linalg.norm(M, axis=1) * n + 1e-12)


def _diversify(cat: Catalog, idx: np.ndarray, sim, penalty: float):
    """discover_feed's per-album + per-provider step. Returns candidate indices in
    rank order. sim None = cold start (newest, photographers interleaved)."""
    created = cat.created[idx]
    if sim is None:
        order = np.lexsort((-created,))  # newest first
    else:
        order = np.lexsort((-created, -sim))  # sim desc, then newest
    # distinct on (album): the first photo of each album in that order
    alb = cat.album[idx[order]]
    _, first = np.unique(alb, return_index=True)
    keep = order[np.sort(first)]
    # row_number() over (partition by provider) in the same order
    prov = cat.provider[idx[keep]]
    srt = np.lexsort((np.arange(len(keep)), prov))
    ps = prov[srt]
    start = np.r_[0, np.flatnonzero(ps[1:] != ps[:-1]) + 1]
    run = np.arange(len(ps)) - np.repeat(start, np.diff(np.r_[start, len(ps)]))
    per_provider = np.empty(len(keep), int)
    per_provider[srt] = run + 1
    if sim is None:
        key = -per_provider.astype(float)
    else:
        key = sim[keep] - penalty * (per_provider - 1)
    final = np.lexsort((-created[keep], -key))
    return idx[keep[final]], (None if sim is None else sim[keep[final]])


def _layout(ranked: np.ndarray, limit: int, rng: np.random.Generator, explore_frac=0.15, explore_pool=None):
    """Reserve the exploration slots, take the main picks, then put the exploration
    cards at positions 3.5, 9.5, 15.5... (main pick k sits at position k)."""
    n_explore = max(1, round(limit * explore_frac)) if limit >= 4 else 0
    total = len(ranked)
    n_main = max(min(limit, total) - n_explore, 0)
    main = list(ranked[:n_main])
    rest = ranked[n_main:] if explore_pool is None else explore_pool(ranked[n_main:])
    pick = list(rng.permutation(rest)[:n_explore]) if len(rest) else []
    items = [(k + 1.0, int(p), False) for k, p in enumerate(main)]
    items += [(j * 6 + 3.5, int(p), True) for j, p in enumerate(pick)]
    items.sort()
    return [(p, e) for _, p, e in items]


class FeedV1:
    """The current discover_feed + provider_matches."""
    name = "v1 (current)"

    def __init__(self, cat: Catalog):
        self.cat = cat

    def taste(self, swipes):
        recent = swipes[-300:]
        likes = [i for i, a in recent if a in LIKE]
        passes = [i for i, a in recent if a == "pass"]
        if len(likes) < 3:
            return None
        t = self.cat.E[likes].mean(0)
        if passes:
            t = t - 0.3 * self.cat.E[passes].mean(0)
        return t

    def scores(self, swipes, idx):
        t = self.taste(swipes)
        return None if t is None else _cos(self.cat.E[idx], t)

    def feed(self, swipes, limit=20, category=None, rng=None):
        rng = rng or np.random.default_rng()
        idx = self.cat.candidates(swipes, category)
        if not len(idx):
            return []
        ranked, _ = _diversify(self.cat, idx, self.scores(swipes, idx), 0.05)
        self.last_ranked = ranked
        return _layout(ranked, limit, rng)

    def provider_scores(self, swipes):
        """{provider: raw average similarity} (provider_matches before the 60..98 scaling)."""
        t = self.taste(swipes)
        if t is None:
            return {}
        sims = _cos(self.cat.E, t)
        return {int(p): float(sims[self.cat.provider == p].mean()) for p in np.unique(self.cat.provider)}


V2_DEFAULTS = dict(
    center=True,          # subtract the catalog's mean embedding (SigLIP vectors share a big common part)
    min_likes=1,          # personalise from the first like
    half_life=40.0,       # swipe weight halves every N swipes (taste can change)
    save_weight=2.0,      # a save counts as two likes
    gamma=0.5,            # how hard passes push away (Rocchio beta=1, gamma)
    max_clusters=3,       # up to 3 separate tastes (users who like two styles)
    join_cos=0.35,        # a like joins a taste cluster when its centred cosine >= this
    stale=2.0,            # drop a taste when the passes next to it outweigh its likes 2:1
    mode="clusters",      # "centroid" | "clusters" | "knn" | "kernel"
    knn_m=3,
    penalty=0.03,         # per extra album from the same provider (in centred-similarity units)
    mmr=0.0,              # 0 = off; else weight of "too similar to a card above"
    pool=200,             # rerank pool size
    explore=0.15,
    explore_mode="tail",  # "tail" (random from the rest) | "novel" (far from anything swiped)
    cold="diverse",       # "newest" | "diverse" (first cards cover many looks)
    scope_category=True,  # with a category filter, taste from that category's swipes once it has a like
    window=300,
)


@dataclass
class FeedV2:
    cat: Catalog
    params: dict = field(default_factory=dict)
    name: str = "v2"

    def __post_init__(self):
        self.p = {**V2_DEFAULTS, **self.params}
        self.mu = self.cat.E.mean(0) if self.p["center"] else np.zeros(self.cat.E.shape[1], np.float32)
        self.X = self.cat.E - self.mu
        self.Xn = self.X / np.linalg.norm(self.X, axis=1, keepdims=True)

    def with_params(self, name=None, **kw):
        return FeedV2(self.cat, {**self.params, **kw}, name or self.name)

    # -- taste --------------------------------------------------------------
    def _weights(self, swipes):
        recent = swipes[-self.p["window"]:]
        n = len(recent)
        out = []
        for r, (i, a) in enumerate(reversed(recent)):  # r = 0 is the newest
            w = 1.0 if not self.p["half_life"] else 0.5 ** (r / self.p["half_life"])
            if a == "save":
                w *= self.p["save_weight"]
            out.append((i, a, w))
        assert len(out) == n
        return out  # newest first

    def tastes(self, swipes):
        """(list of (centroid, mass), pass centroid or None, n_likes)."""
        ws = self._weights(swipes)
        likes = [(i, w) for i, a, w in ws if a in LIKE]
        passes = [(i, w) for i, a, w in ws if a == "pass"]
        neg = None
        if passes:
            W = np.array([w for _, w in passes])
            neg = (self.X[[i for i, _ in passes]] * W[:, None]).sum(0) / W.sum()
        if not likes:
            return [], neg, 0
        if self.p["mode"] == "centroid" or self.p["max_clusters"] <= 1:
            W = np.array([w for _, w in likes])
            c = (self.X[[i for i, _ in likes]] * W[:, None]).sum(0) / W.sum()
            return [(c, 1.0)], neg, len(likes)
        # Leader clustering, newest like first: join the closest cluster if close enough,
        # else start a new one (at most max_clusters; then join the closest anyway).
        cents: list[np.ndarray] = []   # weighted sums
        mass: list[float] = []
        for i, w in likes:
            x = self.X[i]
            if cents:
                xn = self.Xn[i]
                sims = [float(xn @ self._unit(c)) for c in cents]
                k = int(np.argmax(sims))
                if sims[k] >= self.p["join_cos"] or len(cents) >= self.p["max_clusters"]:
                    cents[k] = cents[k] + w * x
                    mass[k] += w
                    continue
            cents.append(w * x)
            mass.append(w)
        # Stale tastes: a taste whose recent swipes are mostly passes (the user moved on)
        # is dropped once its pass weight exceeds stale x its like weight.
        if self.p.get("stale") and passes:
            units = [self._unit(c) for c in cents]
            pmass = [0.0] * len(cents)
            for i, w in passes:
                sims = [float(self.Xn[i] @ u) for u in units]
                k = int(np.argmax(sims))
                if sims[k] >= self.p["join_cos"]:
                    pmass[k] += w
            keep = [k for k in range(len(cents)) if pmass[k] <= self.p["stale"] * mass[k]]
            if not keep:
                return [], neg, 0  # every taste went stale: behave like "passes only"
            cents, mass = [cents[k] for k in keep], [mass[k] for k in keep]
        total = sum(mass)
        return [(c / m, m / total) for c, m in zip(cents, mass)], neg, len(likes)

    def _unit(self, v):
        n = np.linalg.norm(v)
        return v / n if n > 1e-12 else v

    def scores(self, swipes, idx):
        cents, neg, n_likes = self.tastes(swipes)
        Xn = self.Xn[idx]
        g = self.p["gamma"]
        if n_likes < self.p["min_likes"]:
            if neg is not None and self.p["min_likes"] <= 1 and self.p.get("pass_only", True):
                return Xn @ self._unit(-neg)  # only passes so far: steer away from them
            return None
        mode = self.p["mode"]
        if mode == "kernel":
            # Kernel classifier: soft-max similarity to recent likes minus to recent passes.
            ws = self._weights(swipes)[:self.p.get("kernel_window", 100)]
            tau = self.p.get("tau", 0.1)
            def ksum(items):
                if not items:
                    return np.zeros(len(idx))
                S = Xn @ self.Xn[[i for i, _ in items]].T
                w = np.array([w for _, w in items])
                return np.log((np.exp((S - 1) / tau) * w).sum(1) + 1e-9) * tau + 1
            likes = [(i, w) for i, a, w in ws if a in LIKE]
            passes = [(i, w) for i, a, w in ws if a == "pass"]
            s = ksum(likes)
            if passes:
                s = s - g * ksum(passes)
            return s
        if mode == "knn":
            ws = [(i, w) for i, a, w in self._weights(swipes) if a in LIKE][:50]
            S = Xn @ self.Xn[[i for i, _ in ws]].T
            m = min(self.p["knn_m"], S.shape[1])
            s = np.sort(S, axis=1)[:, -m:].mean(1)
            return s - g * (Xn @ self._unit(neg)) if neg is not None else s
        nz = neg if neg is not None else 0
        if self.p.get("pass_mode", "rocchio") == "separate":
            pen = g * (Xn @ self._unit(neg)) if neg is not None else 0
            return np.max(np.stack([Xn @ self._unit(c) for c, _ in cents]), axis=0) - pen
        return np.max(np.stack([Xn @ self._unit(c - g * nz) for c, _ in cents]), axis=0)

    # -- feed ---------------------------------------------------------------
    def feed(self, swipes, limit=20, category=None, rng=None):
        rng = rng or np.random.default_rng()
        idx = self.cat.candidates(swipes, category)
        if not len(idx):
            return []
        taste_swipes = swipes
        if category is not None and self.p.get("scope_category"):
            mine = [(i, a) for i, a in swipes if self.cat.vertical[i] == category]
            if any(a in LIKE for _, a in mine):
                taste_swipes = mine  # taste from this vertical's swipes once there are likes in it
        s = self.scores(taste_swipes, idx)
        if s is None and self.p["cold"] == "diverse":
            ranked = self._cold_diverse(idx, limit)
        else:
            ranked, sims = _diversify(self.cat, idx, s, self.p["penalty"])
            if s is not None and self.p["mmr"] > 0:
                ranked = self._mmr(ranked, sims, limit)
        self.last_ranked = ranked
        pool = None
        if self.p["explore_mode"] == "novel" and swipes:
            seen = np.array([i for i, _ in swipes[-100:]])
            S = self.X[seen] / np.linalg.norm(self.X[seen], axis=1, keepdims=True)

            def pool(rest):
                if len(rest) <= 3:
                    return rest
                R = self.X[rest] / np.linalg.norm(self.X[rest], axis=1, keepdims=True)
                near = (R @ S.T).max(1)
                return rest[np.argsort(near)[: max(3, len(rest) // 4)]]
        return _layout(ranked, limit, rng, self.p["explore"], pool)

    def _mmr(self, ranked, sims, limit):
        n = min(len(ranked), self.p["pool"])
        head, sims = ranked[:n], sims[:n]
        Xn = self.X[head] / np.linalg.norm(self.X[head], axis=1, keepdims=True)
        chosen, left = [], list(range(n))
        maxsim = np.full(n, -1.0)
        while left and len(chosen) < limit:
            vals = [sims[j] - self.p["mmr"] * max(0.0, maxsim[j]) for j in left]
            j = left.pop(int(np.argmax(vals)))
            chosen.append(j)
            maxsim = np.maximum(maxsim, Xn @ Xn[j])
        rest = [j for j in range(n) if j not in chosen]
        return np.concatenate([head[chosen], head[rest], ranked[n:]]).astype(int)

    def _cold_diverse(self, idx, limit):
        """No signal yet: newest-first pool, then farthest-point picks so the first
        cards cover many different looks (one per album/provider)."""
        ranked, _ = _diversify(self.cat, idx, None, 0)
        n = min(len(ranked), self.p["pool"])
        head = ranked[:n]
        Xn = self.X[head] / np.linalg.norm(self.X[head], axis=1, keepdims=True)
        chosen = [0]
        maxsim = Xn @ Xn[0]
        while len(chosen) < min(n, limit):
            maxsim[chosen] = 9
            j = int(np.argmin(maxsim))
            chosen.append(j)
            maxsim = np.maximum(maxsim, Xn @ Xn[j])
        rest = [j for j in range(n) if j not in set(chosen)]
        return np.concatenate([head[chosen], head[rest], ranked[n:]]).astype(int)

    def provider_scores(self, swipes):
        idx = np.arange(self.cat.n)
        s = self.scores(swipes, idx)
        if s is None:
            return {}
        return {int(p): float(s[self.cat.provider == p].mean()) for p in np.unique(self.cat.provider)}


class Oracle:
    """Ceiling: knows the user's target groups (set .targets), ranks them first.
    Same album/provider/exploration layout as the real feed."""
    name = "oracle"

    def __init__(self, cat: Catalog):
        self.cat, self.targets = cat, set()

    def scores(self, swipes, idx):
        return np.isin(self.cat.group[idx], list(self.targets)).astype(float) + 0.01 * self.cat.created[idx]

    def feed(self, swipes, limit=20, category=None, rng=None):
        rng = rng or np.random.default_rng()
        idx = self.cat.candidates(swipes, category)
        if not len(idx):
            return []
        ranked, _ = _diversify(self.cat, idx, self.scores(swipes, idx), 0.0)
        self.last_ranked = ranked
        return _layout(ranked, limit, rng)

    def provider_scores(self, swipes):
        return {}


def variant(base: FeedV2, name: str, **kw) -> FeedV2:
    return replace(base, params={**base.params, **kw}, name=name)
