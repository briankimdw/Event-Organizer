"""Labeled image set for the offline taste evaluation.

The images are Creative Commons photos (CC0 / public domain / CC BY) found through the
Openverse API, grouped by a style or a content type that matches our verticals
("black & white portrait", "plated food", "floral arrangement", "dance floor"...).
Only the small manifest (eval/manifest.csv: id, group, url, license, creator) lives
in the repo; the photos are downloaded into a folder OUTSIDE the repo:

    python eval/dataset.py search  <workdir>   # Openverse -> <workdir>/candidates.csv
    python eval/dataset.py search-extra <workdir>   # more queries for thin groups (appends)
    python eval/dataset.py fetch   <workdir> [--manifest eval/manifest.csv]
    python eval/dataset.py sheets  <workdir> [--manifest ...]   # contact sheets to check labels by eye

`search` was used once to build the manifest (labels then checked by eye with the
contact sheets; wrong-group photos removed). Everyone else only needs `fetch`.
Downloaded files are data: nothing in <workdir> is ever executed.
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
import time
from pathlib import Path

import httpx

HERE = Path(__file__).resolve().parent
MANIFEST = HERE / "manifest.csv"
FIELDS = ["id", "group", "vertical", "album", "url", "license", "creator", "landing"]

# group -> (vertical slug it belongs to, Openverse queries)
GROUPS: dict[str, tuple[str, list[str]]] = {
    # photography styles
    "bw_portrait":     ("photography", ["black and white portrait", "monochrome portrait"]),
    "golden_hour":     ("photography", ["golden hour portrait", "sunset backlit portrait"]),
    "low_key":         ("photography", ["low key portrait", "dark moody portrait"]),
    "high_key":        ("photography", ["high key portrait", "bright white portrait"]),
    "wedding_couple":  ("photography", ["wedding couple", "bride and groom"]),
    "studio_headshot": ("photography", ["studio headshot", "professional headshot"]),
    "night_city":      ("photography", ["city lights at night", "neon street night"]),
    "landscape":       ("photography", ["mountain landscape", "seascape"]),
    # catering / bakery / bar
    "plated_food":     ("catering", ["fine dining plating", "gourmet dish plate"]),
    "buffet":          ("catering", ["buffet catering", "catering buffet table"]),
    "cake":            ("bakery", ["wedding cake", "tiered cake"]),
    "cocktails":       ("bartending", ["cocktail drink", "cocktail glass bar"]),
    # florist / decor / venue
    "floral":          ("florist", ["flower arrangement", "floral centerpiece"]),
    "tablescape":      ("decor", ["wedding table setting", "reception table decor"]),
    "venue_interior":  ("venues", ["ballroom interior", "banquet hall"]),
    # entertainment
    "dance_floor":     ("dj", ["dance floor party", "nightclub dancing crowd"]),
    "live_band":       ("live-music", ["live band on stage", "band concert stage"]),
    # beauty / kids
    "makeup":          ("hair-makeup", ["makeup look eyeshadow", "bridal makeup"]),
    "kids_party":      ("kids-entertainment", ["children birthday party", "kids party balloons"]),
    "outdoor_ceremony": ("venues", ["outdoor wedding ceremony", "garden wedding ceremony"]),
}

# Second round of queries for groups the first round left thin.
EXTRA_QUERIES: dict[str, list[str]] = {
    "golden_hour": ["sunset portrait", "golden hour", "backlit sunset girl"],
    "low_key": ["chiaroscuro portrait", "dark portrait", "low key"],
    "high_key": ["high key", "white background portrait"],
    "buffet": ["buffet food", "catering food table", "buffet"],
    "outdoor_ceremony": ["wedding ceremony", "wedding aisle outdoor"],
    "tablescape": ["table setting", "place setting wedding"],
    "plated_food": ["restaurant dish", "plated dessert"],
}

API = "https://api.openverse.org/v1/images/"
FLICKR = re.compile(r"^(https://live\.staticflickr\.com/\d+/\d+_[0-9a-f]+)(?:_[a-z])?\.jpg$")


def read_manifest(path: Path) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def write_manifest(path: Path, rows: list[dict]) -> None:
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in FIELDS})


def search(workdir: Path, pages: int = 2, extra: bool = False) -> None:
    """Query Openverse (anonymous: 20 requests/min, 200/day) for every group.
    extra=True runs EXTRA_QUERIES (one page each) and appends to candidates.csv."""
    http = httpx.Client(timeout=30, headers={"User-Agent": "photomatch-eval/0.1"})
    rows: list[dict] = read_manifest(workdir / "candidates.csv") if extra else []
    seen: set[str] = {r["id"] for r in rows}
    plan = {g: (GROUPS[g][0], q) for g, q in EXTRA_QUERIES.items()} if extra else GROUPS
    pages = 1 if extra else pages
    for group, (vertical, queries) in plan.items():
        for q in queries:
            for page in range(1, pages + 1):
                params = {"q": q, "license": "cc0,pdm,by", "source": "flickr", "page_size": 20, "page": page}
                if not extra:
                    params["category"] = "photograph"
                r = http.get(API, params=params)
                time.sleep(3.2)
                if r.status_code != 200:
                    print("skip", group, q, page, r.status_code, file=sys.stderr)
                    continue
                for it in r.json().get("results", []):
                    m = FLICKR.match(it.get("url") or "")
                    if not m or it["id"] in seen:
                        continue
                    seen.add(it["id"])
                    rows.append({"id": it["id"], "group": group, "vertical": vertical,
                                 "album": f"{group}:{it.get('creator') or it['id']}",
                                 "url": m.group(1) + "_n.jpg",  # 320 px is plenty for a 224 px model
                                 "license": f"{it['license']} {it.get('license_version') or ''}".strip(),
                                 "creator": it.get("creator") or "", "landing": it.get("foreign_landing_url") or ""})
        print(group, sum(r["group"] == group for r in rows))
    write_manifest(workdir / "candidates.csv", rows)


def fetch(workdir: Path, manifest: Path) -> None:
    out = workdir / "img"
    out.mkdir(parents=True, exist_ok=True)
    http = httpx.Client(timeout=30, follow_redirects=True, headers={"User-Agent": "photomatch-eval/0.1"})
    missing = 0
    for r in read_manifest(manifest):
        dest = out / f"{r['id']}.jpg"
        if dest.exists():
            continue
        try:
            resp = http.get(r["url"])
            if resp.status_code == 200 and resp.headers.get("content-type", "").startswith("image/"):
                dest.write_bytes(resp.content)
                continue
        except httpx.HTTPError:
            pass
        missing += 1
    print(f"done; {missing} could not be downloaded")


def sheets(workdir: Path, manifest: Path, per_sheet: int = 48) -> None:
    """One contact sheet per group (numbered tiles) to check labels by eye."""
    from PIL import Image, ImageDraw

    rows = read_manifest(manifest)
    out = workdir / "sheets"
    out.mkdir(parents=True, exist_ok=True)
    for group in GROUPS:
        items = [r for r in rows if r["group"] == group and (workdir / "img" / f"{r['id']}.jpg").exists()]
        for start in range(0, len(items), per_sheet):
            chunk = items[start:start + per_sheet]
            cols, tile = 8, 160
            sheet = Image.new("RGB", (cols * tile, ((len(chunk) + cols - 1) // cols) * tile), "white")
            draw = ImageDraw.Draw(sheet)
            for k, r in enumerate(chunk):
                try:
                    im = Image.open(workdir / "img" / f"{r['id']}.jpg").convert("RGB")
                except OSError:
                    continue
                im.thumbnail((tile - 4, tile - 4))
                x, y = (k % cols) * tile, (k // cols) * tile
                sheet.paste(im, (x + 2, y + 2))
                draw.rectangle([x + 2, y + 2, x + 30, y + 16], fill="black")
                draw.text((x + 4, y + 3), str(start + k), fill="yellow")
            sheet.save(out / f"{group}_{start // per_sheet}.jpg", quality=80)
    print("sheets in", out)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["search", "search-extra", "fetch", "sheets"])
    ap.add_argument("workdir", type=Path)
    ap.add_argument("--manifest", type=Path, default=MANIFEST)
    a = ap.parse_args()
    a.workdir.mkdir(parents=True, exist_ok=True)
    if a.cmd in ("search", "search-extra"):
        search(a.workdir, extra=a.cmd == "search-extra")
    elif a.cmd == "fetch":
        fetch(a.workdir, a.manifest)
    else:
        sheets(a.workdir, a.manifest)


if __name__ == "__main__":
    main()
