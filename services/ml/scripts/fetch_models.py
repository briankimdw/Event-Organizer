"""Download the AI photo tool models into services/ml/models/ (git-ignored).

    .venv/Scripts/python scripts/fetch_models.py            # all tools (~440 MB)
    .venv/Scripts/python scripts/fetch_models.py --only lama
    .venv/Scripts/python scripts/fetch_models.py --list

Every file is downloaded from a pinned URL (fixed Hugging Face revision or GitHub release) and its
SHA-256 is checked before it is kept; a mismatch deletes the download. Files are written to
services/ml/models/ only and are never executed: ONNX files are data for ONNX Runtime.

Real-ESRGAN is published only as PyTorch weights (.pth). The script loads them with
torch.load(weights_only=True), which reads tensors and refuses to run code, then exports the
small network (app/ai/srvgg.py) to ONNX. Needs PyTorch, which the SigLIP service already uses.

All models here have permissive licenses (MIT / Apache-2.0 / BSD-3-Clause), see
services/ml/README.md ("AI photo tools") and THIRD_PARTY_NOTICES.md.
"""
from __future__ import annotations

import argparse
import hashlib
import os
import sys
import urllib.request
import warnings
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODELS_DIR = ROOT / "models"
sys.path.insert(0, str(ROOT))

# name -> what to download. Keep in sync with app/ai/models.py (file names).
MODELS: dict[str, dict] = {
    "birefnet-lite": {
        "tool": "remove_background",
        "file": "birefnet-lite.onnx",
        "url": "https://huggingface.co/onnx-community/BiRefNet_lite-ONNX/resolve/"
               "de15b22ba131738a16dff04aab8bdf8dc32e3ac1/onnx/model.onnx",
        "sha256": "5600024376f572a557870a5eb0afb1e5961636bef4e1e22132025467d0f03333",
        "size": 224005088,
        "license": "MIT (ZhengPeng7/BiRefNet code and weights; ONNX export by onnx-community, MIT)",
    },
    "lama": {
        "tool": "erase",
        "file": "lama.onnx",
        "url": "https://huggingface.co/Carve/LaMa-ONNX/resolve/"
               "c3c0c9e468934d62e79c329e35d82dd09ff8c444/lama_fp32.onnx",
        "sha256": "1faef5301d78db7dda502fe59966957ec4b79dd64e16f03ed96913c7a4eb68d6",
        "size": 208044816,
        "license": "Apache-2.0 (advimman/lama big-lama; ONNX port by Carve, Apache-2.0)",
    },
    "realesr-general-x4v3": {
        "tool": "upscale",
        "file": "realesr-general-x4v3.pth",
        "url": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-general-x4v3.pth",
        "sha256": "8dc7edb9ac80ccdc30c3a5dca6616509367f05fbc184ad95b731f05bece96292",
        "size": 4885111,
        "license": "BSD-3-Clause (xinntao/Real-ESRGAN code and released weights)",
        "convert_to": "realesr-general-x4v3.onnx",
    },
}


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def download(name: str, spec: dict) -> Path:
    dest = MODELS_DIR / spec["file"]
    if dest.exists() and dest.stat().st_size == spec["size"] and sha256_of(dest) == spec["sha256"]:
        print(f"[{name}] already present, checksum OK")
        return dest
    tmp = dest.with_name(dest.name + ".part")
    print(f"[{name}] downloading {spec['size'] / 1e6:.0f} MB from {spec['url']}")
    req = urllib.request.Request(spec["url"], headers={"User-Agent": "photomatch-fetch-models/1"})
    h = hashlib.sha256()
    done = 0
    try:
        with urllib.request.urlopen(req, timeout=60) as r, tmp.open("wb") as f:
            while chunk := r.read(1 << 20):
                f.write(chunk)
                h.update(chunk)
                done += len(chunk)
                if done > spec["size"] * 1.01:
                    raise RuntimeError("download is larger than expected")
                print(f"\r  {done / 1e6:7.1f} / {spec['size'] / 1e6:.1f} MB", end="", flush=True)
        print()
        if h.hexdigest() != spec["sha256"]:
            raise RuntimeError(f"SHA-256 mismatch: got {h.hexdigest()}, expected {spec['sha256']}")
        os.replace(tmp, dest)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise
    print(f"[{name}] saved {dest.relative_to(ROOT)} (checksum OK)")
    return dest


def convert_srvgg(src: Path, dest: Path) -> None:
    """Real-ESRGAN compact .pth -> ONNX with dynamic height/width."""
    import torch

    from app.ai.srvgg import SRVGGNetCompact

    state = torch.load(src, map_location="cpu", weights_only=True)  # tensors only, no code
    state = state.get("params_ema", state.get("params", state))
    net = SRVGGNetCompact(num_feat=64, num_conv=32, upscale=4)
    net.load_state_dict(state, strict=True)
    net.eval()
    dummy = torch.rand(1, 3, 64, 64)
    tmp = dest.with_name(dest.name + ".part")
    with torch.no_grad(), warnings.catch_warnings():
        warnings.simplefilter("ignore", DeprecationWarning)  # the legacy exporter is the one that handles this net simply
        torch.onnx.export(
            net, dummy, str(tmp), input_names=["input"], output_names=["output"],
            dynamic_axes={"input": {2: "h", 3: "w"}, "output": {2: "H", 3: "W"}},
            opset_version=17, dynamo=False,
        )
    os.replace(tmp, dest)
    print(f"  exported {dest.relative_to(ROOT)}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", action="append", choices=sorted(MODELS), help="fetch just this model (repeatable)")
    ap.add_argument("--list", action="store_true", help="show the models and exit")
    args = ap.parse_args()
    if args.list:
        for name, spec in MODELS.items():
            print(f"{name:22} {spec['tool']:18} {spec['size'] / 1e6:6.0f} MB  {spec['license']}")
        return 0
    MODELS_DIR.mkdir(exist_ok=True)
    failed = []
    for name in args.only or list(MODELS):
        spec = MODELS[name]
        try:
            path = download(name, spec)
            if spec.get("convert_to"):
                onnx_path = MODELS_DIR / spec["convert_to"]
                if not onnx_path.exists() or onnx_path.stat().st_mtime < path.stat().st_mtime:
                    convert_srvgg(path, onnx_path)
        except Exception as e:  # keep going with the other models
            print(f"[{name}] FAILED: {e}", file=sys.stderr)
            failed.append(name)
    if failed:
        print("Failed: " + ", ".join(failed), file=sys.stderr)
        return 1
    print("Done. Restart the ML service to pick the models up (GET /ai/capabilities shows them).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
