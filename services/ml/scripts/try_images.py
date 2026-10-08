"""Try SigLIP on local photos (no database needed).

    python scripts/try_images.py path/to/photos            # a folder
    python scripts/try_images.py a.jpg b.jpg c.jpg         # files
    python scripts/try_images.py photos --query "moody wedding at night"

Prints each photo's auto-tags, which photos look most alike, and (with --query)
how well each photo matches a text description.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.siglip import SigLIP  # noqa: E402

EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def collect(paths: list[str]) -> list[Path]:
    files: list[Path] = []
    for p in map(Path, paths):
        files += sorted(f for f in p.iterdir() if f.suffix.lower() in EXTENSIONS) if p.is_dir() else [p]
    return files


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("paths", nargs="+")
    parser.add_argument("--query", help="rank photos by how well they match this text")
    args = parser.parse_args()

    files = collect(args.paths)
    if not files:
        sys.exit("No photos found.")
    engine = SigLIP()
    print(f"model {engine.model_id} on {engine.device}\n")

    images = [Image.open(f) for f in files]
    embeddings = engine.embed_images(images)
    for f, (_, tags) in zip(files, engine.analyze(images)):
        print(f"{f.name:32} {', '.join(tags) or '(no tags)'}")

    if len(files) > 1:
        sims = (embeddings @ embeddings.T).cpu()
        print("\nMost similar photo:")
        for i, f in enumerate(files):
            row = sims[i].clone()
            row[i] = -1
            j = int(row.argmax())
            print(f"{f.name:32} -> {files[j].name}  ({row[j]:.2f})")

    if args.query:
        text = engine.embed_texts([args.query])
        probs = engine.match_probabilities(embeddings, text).squeeze(1).cpu()
        print(f'\nBest matches for "{args.query}":')
        for i in probs.argsort(descending=True).tolist():
            print(f"{files[i].name:32} {probs[i]:.3f}")


if __name__ == "__main__":
    main()
