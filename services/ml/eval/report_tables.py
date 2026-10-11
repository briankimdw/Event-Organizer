"""Markdown tables for REPORT.md from simulate.py --out JSON files.

    python eval/report_tables.py final.json [--label "632 photos"]
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def f(x, d=2, pct=False):
    if x is None:
        return "-"
    return f"{100 * x:.0f}%" if pct else f"{x:.{d}f}"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+", type=Path)
    a = ap.parse_args()
    for path in a.files:
        data = json.loads(path.read_text())
        algos = sorted({k.split("|")[0] for k in data}, key=lambda s: {"oracle": 0, "v1": 1, "v2": 2}.get(s, 3))
        scen = [s for s in ("single", "double", "noisy", "cross", "change") if any(k.endswith("|" + s) for k in data)]
        print(f"\n### {path.name}\n")
        print("| scenario | algo | AUC @5 / 10 / 20 / 40 swipes | P@10 @10 / 20 / 40 | like rate 1-20 / 21-40 / 41-60 | swipes to learn (AUC>=0.9) |")
        print("|---|---|---|---|---|---|")
        for s in scen:
            if s == "change":
                continue
            for al in algos:
                r = data.get(f"{al}|{s}")
                if not r:
                    continue
                auc = " / ".join(f(r.get(str(k), {}).get("auc")) for k in (6, 10, 20, 40))
                p10 = " / ".join(f(r.get(str(k), {}).get("p10")) for k in (10, 20, 40))
                like = " / ".join(f(r[x], pct=True) for x in ("like_rate_1_20", "like_rate_21_40", "like_rate_41_60"))
                learn = "-" if al == "oracle" else (f"{r['learn_median']:.0f}" if r["learn_median"] <= 60 else "> 60")
                print(f"| {s} | {al} | {auc} | {p10} | {like} | {learn} |")
        if any(k.endswith("|change") for k in data):
            print("\nTaste change (likes group A for 40 swipes, then group B):\n")
            print("| algo | P@10 for B: +0 / +10 / +20 / +40 swipes | AUC for B: +10 / +20 / +40 | like rate after switch 1-20 / 21-40 |")
            print("|---|---|---|---|")
            for al in algos:
                r = data.get(f"{al}|change")
                if r:
                    p = " / ".join(f(r.get(str(k), {}).get("p10")) for k in (40, 50, 60, 80))
                    au = " / ".join(f(r.get(str(k), {}).get("auc")) for k in (50, 60, 80))
                    lk = " / ".join(f(r.get(x), pct=True) for x in ("like_rate_after_switch_1_20", "like_rate_after_switch_21_40"))
                    print(f"| {al} | {p} | {au} | {lk} |")
        print("\nCold start, diversity and % match:\n")
        print("| scenario | algo | first like (median swipe) | groups in first 20 cards | providers in a feed of 20 (@20) | ILS @20 | both styles in top 10 (double) | % match nDCG@5 |")
        print("|---|---|---|---|---|---|---|---|")
        for s in scen:
            if s in ("noisy", "change"):
                continue
            for al in algos:
                r = data.get(f"{al}|{s}")
                if not r:
                    continue
                k20 = r.get("20", {})
                both = f(k20.get("both10"), pct=True) if s == "double" else "-"
                print(f"| {s} | {al} | {r['first_like_median']:.0f} | {r['first20_groups']:.1f} | {f(k20.get('providers'), 1)} "
                      f"| {f(k20.get('ils'))} | {both} | {f(r.get('prov_ndcg5'))} |")


if __name__ == "__main__":
    main()
