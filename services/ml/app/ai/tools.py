"""The AI photo tools: image in, image out. Pure functions around an ONNX Runtime session
(anything with .run(None, {name: array}) works, which keeps them testable without models).

- remove_background: BiRefNet (lite), 1024x1024 input, returns a soft mask.
- erase: LaMa (big-lama), fixed 512x512 input; works on a crop around the painted area.
- upscale: Real-ESRGAN compact (realesr-general-x4v3), x4; x2 is x4 then a Lanczos downscale
  (as Real-ESRGAN's own "outscale" does).
"""
from __future__ import annotations

import numpy as np
from PIL import Image, ImageFilter

_IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(3, 1, 1)
_IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(3, 1, 1)

BIREFNET_SIZE = 1024
LAMA_SIZE = 512


def _input_name(session, i: int = 0) -> str:
    return session.get_inputs()[i].name


def _to_chw(img: Image.Image) -> np.ndarray:
    """RGB PIL image -> (1, 3, H, W) float32 in 0..1."""
    a = np.asarray(img.convert("RGB"), dtype=np.float32) / 255.0
    return a.transpose(2, 0, 1)[None]


# ---------------------------------------------------------------------------
# Remove background
# ---------------------------------------------------------------------------
def background_mask(session, img: Image.Image) -> Image.Image:
    """Soft subject mask ('L', same size as img): 255 = subject, 0 = background."""
    small = img.convert("RGB").resize((BIREFNET_SIZE, BIREFNET_SIZE), Image.BILINEAR)
    x = (_to_chw(small)[0] - _IMAGENET_MEAN) / _IMAGENET_STD
    logits = session.run(None, {_input_name(session): x[None].astype(np.float32)})[0]
    prob = 1.0 / (1.0 + np.exp(-np.clip(logits[0, 0], -30, 30)))
    mask = Image.fromarray(np.round(prob * 255).astype(np.uint8), "L")
    return mask.resize(img.size, Image.BILINEAR)


def cutout(img: Image.Image, mask: Image.Image) -> Image.Image:
    out = img.convert("RGB")
    out.putalpha(mask)
    return out


# ---------------------------------------------------------------------------
# Erase (inpaint)
# ---------------------------------------------------------------------------
def mask_to_binary(mask: Image.Image, size: tuple[int, int]) -> np.ndarray:
    """User mask -> bool array (H, W) at `size`. White = remove; black or transparent = keep."""
    if mask.mode in ("RGBA", "LA", "PA") or (mask.mode == "P" and "transparency" in mask.info):
        rgba = mask.convert("RGBA")
        black = Image.new("RGBA", rgba.size, (0, 0, 0, 255))
        mask = Image.alpha_composite(black, rgba)
    gray = mask.convert("L")
    if gray.size != size:
        gray = gray.resize(size, Image.BILINEAR)
    return np.asarray(gray) >= 128


def crop_box(bbox: tuple[int, int, int, int], size: tuple[int, int],
             min_side: int = LAMA_SIZE, context: float = 2.0) -> tuple[int, int, int, int]:
    """Square-ish region around the painted bbox with room for context, clamped to the image."""
    W, H = size
    x0, y0, x1, y1 = bbox
    side = max(min_side, int(round(max(x1 - x0, y1 - y0) * context)))
    cw, ch = min(side, W), min(side, H)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    left = int(round(min(max(cx - cw / 2, 0), W - cw)))
    top = int(round(min(max(cy - ch / 2, 0), H - ch)))
    return left, top, left + cw, top + ch


def erase(session, img: Image.Image, remove: np.ndarray, grow_px: int = 3) -> Image.Image:
    """Fill the `remove` pixels (bool H x W) of img from their surroundings."""
    img = img.convert("RGB")
    ys, xs = np.nonzero(remove)
    if len(xs) == 0:
        return img
    box = crop_box((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1), img.size)
    crop = img.crop(box)
    crop_remove = Image.fromarray(remove[box[1]:box[3], box[0]:box[2]].astype(np.uint8) * 255, "L")

    # Model input at 512x512: grow the mask a little so object edges and halos are covered.
    small = crop.resize((LAMA_SIZE, LAMA_SIZE), Image.LANCZOS)
    small_mask = crop_remove.resize((LAMA_SIZE, LAMA_SIZE), Image.BILINEAR).point(lambda v: 255 if v > 0 else 0)
    if grow_px > 0:
        small_mask = small_mask.filter(ImageFilter.MaxFilter(2 * grow_px + 1))
    m = (np.asarray(small_mask, dtype=np.float32) / 255.0)[None, None]
    inputs = session.get_inputs()
    feeds = {inputs[0].name: _to_chw(small).astype(np.float32), inputs[1].name: m.astype(np.float32)}
    out = session.run(None, feeds)[0][0]                       # (3, 512, 512), 0..255
    filled = Image.fromarray(np.clip(out.transpose(1, 2, 0), 0, 255).round().astype(np.uint8), "RGB")
    filled = filled.resize(crop.size, Image.LANCZOS)

    # Blend: the grown mask, softened, back at crop size; always fully replace the painted pixels.
    alpha_img = small_mask.filter(ImageFilter.GaussianBlur(1.0)).resize(crop.size, Image.BILINEAR)
    alpha = np.maximum(np.asarray(alpha_img, dtype=np.float32) / 255.0,
                       np.asarray(crop_remove, dtype=np.float32) / 255.0)[..., None]
    merged = np.asarray(crop, dtype=np.float32) * (1 - alpha) + np.asarray(filled, dtype=np.float32) * alpha
    result = img.copy()
    result.paste(Image.fromarray(np.clip(merged, 0, 255).round().astype(np.uint8), "RGB"), box[:2])
    return result


# ---------------------------------------------------------------------------
# Upscale
# ---------------------------------------------------------------------------
def upscale(session, img: Image.Image, scale: int) -> Image.Image:
    """x2 or x4 (the model is x4; x2 downsamples its output with Lanczos)."""
    img = img.convert("RGB")
    out = session.run(None, {_input_name(session): _to_chw(img)})[0][0]   # (3, 4H, 4W), 0..1
    big = Image.fromarray((np.clip(out.transpose(1, 2, 0), 0, 1) * 255).round().astype(np.uint8), "RGB")
    if scale == 4:
        return big
    return big.resize((img.width * scale, img.height * scale), Image.LANCZOS)
