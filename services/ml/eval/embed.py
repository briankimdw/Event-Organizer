"""Embed the evaluation photos with a SigLIP model and cache the result (no database).

    python eval/embed.py <workdir> [--model google/siglip-base-patch16-224] [--manifest ...]

Writes <workdir>/emb_<model>.npz with: ids, embeddings (unit length), bw (black & white
flag from the pixels), seconds_per_image. Re-running reuses the cache.
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

from dataset import MANIFEST, read_manifest  # noqa: E402


def cache_path(workdir: Path, model: str) -> Path:
    import re
    name = Path(model).name if Path(model).exists() else model  # a local model folder or a hub id
    return workdir / f"emb_{re.sub(r'[^A-Za-z0-9._-]+', '__', name)}.npz"


def load_images(workdir: Path, manifest: Path) -> tuple[list[dict], list[Image.Image]]:
    rows, images = [], []
    for r in read_manifest(manifest):
        f = workdir / "img" / f"{r['id']}.jpg"
        if not f.exists():
            continue
        try:
            im = Image.open(f)
            im.load()
        except OSError:
            continue
        rows.append(r)
        images.append(im.convert("RGB"))
    return rows, images


def embed(workdir: Path, model: str, manifest: Path = MANIFEST, batch: int = 32) -> dict:
    out = cache_path(workdir, model)
    rows, images = load_images(workdir, manifest)
    if out.exists():
        z = np.load(out, allow_pickle=False)
        if list(z["ids"]) == [r["id"] for r in rows]:
            return {k: z[k] for k in z.files}
    from app.siglip import SigLIP, is_black_and_white

    engine = SigLIP(model_id=model)
    t0 = time.perf_counter()
    chunks = [engine.embed_images(images[i:i + batch]).float().cpu().numpy() for i in range(0, len(images), batch)]
    secs = (time.perf_counter() - t0) / max(1, len(images))
    emb = np.concatenate(chunks).astype(np.float32)
    bw = np.array([is_black_and_white(im) for im in images])
    data = {"ids": np.array([r["id"] for r in rows]), "embeddings": emb, "bw": bw,
            "seconds_per_image": np.array(secs)}
    np.savez(out, **data)
    return data


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("workdir", type=Path)
    ap.add_argument("--model", default="google/siglip-base-patch16-224")
    ap.add_argument("--manifest", type=Path, default=MANIFEST)
    a = ap.parse_args()
    d = embed(a.workdir, a.model, a.manifest)
    print(a.model, d["embeddings"].shape, f"{float(d['seconds_per_image']) * 1000:.0f} ms/image")


if __name__ == "__main__":
    main()
