"""Decoding uploads safely (size limits, EXIF orientation) and encoding results."""
from __future__ import annotations

import math
import warnings
from io import BytesIO

from PIL import Image, ImageOps

# We check the pixel count ourselves before decoding; keep Pillow's bomb guard as a backstop.
Image.MAX_IMAGE_PIXELS = 100_000_000


class ImageError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def open_image(data: bytes, max_pixels: int, max_edge: int | None = None,
               field: str = "image", reject_over_edge: int | None = None) -> tuple[Image.Image, bool]:
    """Bytes -> upright RGB image (EXIF orientation applied, transparency flattened onto white),
    shrunk to max_edge on its long side if given. Returns (image, downscaled).
    reject_over_edge (upscale): refuse, before decoding, images whose long edge is larger."""
    bad = ("bad_mask", "Mask is not a readable image.") if field == "mask" else \
          ("bad_image", "Not a readable image (use JPEG, PNG or WebP).")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            im = Image.open(BytesIO(data))
            w, h = im.size
            if w * h > max_pixels:
                raise ImageError(413, "too_many_pixels", f"Image is larger than {max_pixels / 1e6:.0f} megapixels.")
            if reject_over_edge and max(w, h) > reject_over_edge:
                raise ImageError(413, "upscale_input_too_large",
                                 f"Upscaling works on images up to {reject_over_edge} px on the long edge.")
            if max_edge and max(w, h) > max_edge and im.format == "JPEG":
                s = max_edge / max(w, h)
                im.draft("RGB", (math.ceil(w * s), math.ceil(h * s)))  # faster JPEG decode at reduced size
            im.load()
            im = ImageOps.exif_transpose(im)
    except ImageError:
        raise
    except Exception:
        raise ImageError(400, *bad)
    if field == "mask":
        return im, False  # keep alpha: transparent = keep
    im = _flatten(im)
    downscaled = False
    if max_edge and max(im.size) > max_edge:
        s = max_edge / max(im.size)
        im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS, reducing_gap=3.0)
        downscaled = True
    return im, downscaled


def _flatten(im: Image.Image) -> Image.Image:
    if im.mode in ("RGBA", "LA", "PA") or (im.mode == "P" and "transparency" in im.info):
        rgba = im.convert("RGBA")
        bg = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
        return Image.alpha_composite(bg, rgba).convert("RGB")
    return im.convert("RGB")


def encode(im: Image.Image, fmt: str, jpeg_quality: int = 92) -> tuple[bytes, str]:
    buf = BytesIO()
    if fmt == "png":
        im.save(buf, "PNG", compress_level=3)  # level 3: much faster than the default, files ~10% bigger
        return buf.getvalue(), "image/png"
    im.convert("RGB").save(buf, "JPEG", quality=jpeg_quality, optimize=False)
    return buf.getvalue(), "image/jpeg"
