"""How accurate are the auto-tags (app/tags.py) on the labeled photos?

    python eval/tags_eval.py <workdir> [--model ...]

For every content tag we know which groups it is right for (TRUTH): precision = share of
photos given the tag that are in one of those groups; recall = share of the groups'
photos that got it. Style tags (light/mood/color) are judged only on the group that
defines them (recall) and on groups where they are clearly wrong (false-tag rate).
Also prints the tags-per-photo average and the share of photos with no content tag.
"""
from __future__ import annotations

import argparse
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

from simulate import load  # noqa: E402

# tag -> groups where it is correct (content tags: precision and recall)
TRUTH: dict[str, set[str]] = {
    "wedding": {"wedding_couple", "ceremony", "cake", "tablescape", "venue_interior"},
    "couple": {"wedding_couple", "ceremony", "golden_hour"},
    "portrait": {"bw_portrait", "golden_hour", "low_key", "high_key", "studio_headshot", "wedding_couple"},
    "group": {"dance_floor", "live_band", "kids_party", "ceremony", "buffet", "wedding_couple"},
    "family": {"kids_party"},
    "food": {"plated_food", "buffet", "cake"},
    "party": {"dance_floor", "live_band", "kids_party"},
    "flowers": {"floral", "tablescape", "ceremony"},
    "interior": {"venue_interior", "tablescape"},
    "city": {"night_city"},
    "street": {"night_city", "bw_portrait"},  # the B&W set is mostly street photography
    "architecture": {"night_city", "venue_interior"},
    "landscape": {"landscape", "golden_hour", "ceremony"},
    "mountains": {"landscape"},
    "beach": {"landscape"},
    "forest": {"landscape", "ceremony"},
    # tags added for the event verticals
    "plated dish": {"plated_food"},
    "buffet": {"buffet"},
    "cake": {"cake"},
    "cocktails": {"cocktails"},
    "floral arrangement": {"floral", "tablescape"},
    "table setting": {"tablescape", "venue_interior", "plated_food"},
    "event venue": {"venue_interior", "tablescape", "ceremony"},
    "dance floor": {"dance_floor"},
    "live music": {"live_band"},
    "kids party": {"kids_party"},
    "ceremony": {"ceremony", "wedding_couple"},
}
# style tag -> (group that defines it, groups where it is clearly wrong)
STYLE: dict[str, tuple[str, set[str]]] = {
    "black and white": ("bw_portrait", {"golden_hour", "high_key", "floral", "cocktails", "cake"}),
    "golden hour": ("golden_hour", {"studio_headshot", "night_city", "venue_interior", "bw_portrait", "low_key", "dance_floor"}),
    "night": ("night_city", {"golden_hour", "high_key", "studio_headshot", "landscape", "ceremony",
                             "plated_food", "buffet", "cake", "tablescape", "floral"}),
    "moody": ("low_key", {"high_key", "kids_party", "ceremony"}),
    "bright and airy": ("high_key", {"low_key", "night_city", "dance_floor", "live_band", "bw_portrait"}),
    "studio lighting": ("studio_headshot", {"landscape", "ceremony", "night_city"}),
}


def tags_for(engine, emb: np.ndarray, bw: np.ndarray, vocab) -> list[list[str]]:
    """Auto-tags for cached image embeddings with a tag vocabulary module (app.tags or
    an older copy), the same way SigLIP.analyze() does it."""
    import torch
    prompts = vocab.all_prompts()
    T = engine.embed_texts([p for _, _, p in prompts]).float().cpu()
    scale, bias = engine.model.logit_scale.exp().item(), engine.model.logit_bias.item()
    L = torch.tensor(emb) @ T.T * scale + bias
    out = []
    for row, b in zip(L, bw):
        groups = {}
        for group in vocab.TAG_GROUPS:
            idx = [k for k, (g, _, _) in enumerate(prompts) if g == group]
            pr = torch.softmax(row[idx], dim=0)
            groups[group] = {prompts[k][1]: float(p) for k, p in zip(idx, pr)}
        out.append(vocab.select_tags(groups, black_and_white=bool(b)))
    return out


def report(rows, tags: list[list[str]]) -> dict:
    groups = np.array([r["group"] for r in rows])
    res = {"content": {}, "style": {}}
    for tag, good in TRUTH.items():
        has = np.array([tag in t for t in tags])
        in_good = np.isin(groups, list(good))
        if not has.any() and not in_good.any():
            continue
        prec = float((has & in_good).sum() / has.sum()) if has.any() else None
        # recall on the group(s) the tag is *named* after (first-choice group)
        main = [g for g in good if g.replace("_", " ").startswith(tag.split()[0])] or list(good)
        in_main = np.isin(groups, main)
        rec = float((has & in_main).sum() / in_main.sum()) if in_main.any() else None
        res["content"][tag] = {"n": int(has.sum()), "precision": prec, "recall": rec}
    for tag, (g, wrong) in STYLE.items():
        has = np.array([tag in t for t in tags])
        res["style"][tag] = {
            "n": int(has.sum()),
            "recall": float(has[groups == g].mean()) if (groups == g).any() else None,
            "false_rate": float(has[np.isin(groups, list(wrong))].mean()),
            "precision_vs_defining_group": float((has & (groups == g)).sum() / has.sum()) if has.any() else None,
        }
    content_tags = set(TRUTH)
    res["tags_per_photo"] = float(np.mean([len(t) for t in tags]))
    res["no_content_tag"] = float(np.mean([not (set(t) & content_tags) for t in tags]))
    # per group: share of photos with at least one correct content tag
    per_group = {}
    for g in sorted(set(groups)):
        ok = [any(g in TRUTH.get(x, ()) for x in t) for t, gg in zip(tags, groups) if gg == g]
        per_group[g] = float(np.mean(ok))
    res["group_has_correct_content_tag"] = per_group
    res["top_tags_by_group"] = {g: Counter(x for t, gg in zip(tags, groups) if gg == g for x in t).most_common(4)
                                for g in sorted(set(groups))}
    prec = [v["precision"] for v in res["content"].values() if v["precision"] is not None and v["n"] >= 3]
    res["mean_content_precision"] = float(np.mean(prec)) if prec else None
    res["mean_group_coverage"] = float(np.mean(list(per_group.values())))
    return res


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("workdir", type=Path)
    ap.add_argument("--model", default="google/siglip-base-patch16-224")
    ap.add_argument("--tags-file", type=Path, help="evaluate another copy of app/tags.py (e.g. the old one)")
    a = ap.parse_args()
    import importlib.util
    from app.siglip import SigLIP
    from app import tags as vocab
    if a.tags_file:
        spec = importlib.util.spec_from_file_location("old_tags", a.tags_file)
        vocab = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(vocab)
    from embed import cache_path
    rows, E = load(a.workdir, a.model)
    bw = np.load(cache_path(a.workdir, a.model))["bw"]
    engine = SigLIP(model_id=a.model)
    tags = tags_for(engine, E, bw, vocab)
    r = report(rows, tags)
    print(f"tags/photo {r['tags_per_photo']:.2f}  no content tag {r['no_content_tag']:.0%}  "
          f"mean content precision {r['mean_content_precision']:.2f}  groups with a correct content tag {r['mean_group_coverage']:.2f}")
    print("\ncontent tag        n   prec  recall")
    for t, v in sorted(r["content"].items()):
        p = "  -  " if v["precision"] is None else f"{v['precision']:.2f}"
        rc = "  -  " if v["recall"] is None else f"{v['recall']:.2f}"
        print(f"{t:18} {v['n']:4}  {p}  {rc}")
    print("\nstyle tag          n   recall  false-rate")
    for t, v in r["style"].items():
        print(f"{t:18} {v['n']:4}  {v['recall']:.2f}    {v['false_rate']:.2f}")
    print("\ngroup coverage / top tags")
    for g, v in r["group_has_correct_content_tag"].items():
        print(f"{g:17} {v:.2f}  {r['top_tags_by_group'][g]}")


if __name__ == "__main__":
    main()
