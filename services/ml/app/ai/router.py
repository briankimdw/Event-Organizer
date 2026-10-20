"""HTTP endpoints for the AI photo tools (contract: docs/AI_TOOLS.md).

GET  /ai/capabilities       which tools have their model installed, and the limits
POST /ai/remove-background  image -> PNG cutout (alpha) or mask
POST /ai/erase              image + mask (white = remove) -> inpainted JPEG/PNG
POST /ai/upscale            image (<= 1024 px) + scale 2|4 -> JPEG/PNG

All need 'Authorization: Bearer <Supabase access token>'. Each tool runs one request at a time
per process (others wait up to AI_QUEUE_TIMEOUT_S), in a worker thread so the event loop stays free.
"""
from __future__ import annotations

import logging
import threading
import time
from collections import deque
from typing import Callable, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import UploadFile

from .. import config
from ..auth import TokenVerifier, bearer_token
from . import tools
from .imaging import ImageError, encode, open_image
from .models import MODELS, ModelRegistry

log = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])

EXPOSED_HEADERS = ["X-Image-Width", "X-Image-Height", "X-Input-Downscaled", "X-Processing-Ms", "Retry-After"]


class RateLimiter:
    """At most `limit` requests per user in any `window` seconds (in memory, per process)."""

    def __init__(self, limit: int, window: float):
        self.limit, self.window = limit, window
        self._hits: dict[str, deque] = {}
        self._lock = threading.Lock()

    def hit(self, key: str) -> Optional[int]:
        """Records a request. Returns None if allowed, else seconds until the next one is."""
        now = time.monotonic()
        with self._lock:
            q = self._hits.setdefault(key, deque())
            while q and q[0] <= now - self.window:
                q.popleft()
            if len(q) >= self.limit:
                return max(1, int(q[0] + self.window - now) + 1)
            q.append(now)
            if len(self._hits) > 10_000:  # drop idle users
                for k in [k for k, v in self._hits.items() if not v]:
                    del self._hits[k]
            return None


class AIServices:
    def __init__(self, registry: Optional[ModelRegistry] = None, verifier: Optional[TokenVerifier] = None,
                 limiter: Optional[RateLimiter] = None):
        self.registry = registry or ModelRegistry()
        self._verifier = verifier
        self.limiter = limiter or RateLimiter(config.AI_RATE_LIMIT, config.AI_RATE_WINDOW_S)
        self.semaphores = {tool: threading.BoundedSemaphore(1) for tool in MODELS}

    @property
    def verifier(self) -> TokenVerifier:
        if self._verifier is None:
            self._verifier = TokenVerifier()
        return self._verifier


_services: Optional[AIServices] = None


def get_services() -> AIServices:
    global _services
    if _services is None:
        _services = AIServices()
    return _services


def fail(status: int, code: str, message: str, headers: Optional[dict] = None) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message}, headers=headers)


def require_user(authorization: str = Header(default=""), svc: AIServices = Depends(get_services)) -> str:
    """The caller's user id from 'Authorization: Bearer <Supabase access token>'."""
    user_id = svc.verifier.user_id(bearer_token(authorization))
    if not user_id:
        raise fail(401, "unauthorized", "Sign in to use AI tools.", {"WWW-Authenticate": "Bearer"})
    return user_id


# ---------------------------------------------------------------------------
# Capabilities
# ---------------------------------------------------------------------------
@router.get("/capabilities")
def capabilities(_user: str = Depends(require_user), svc: AIServices = Depends(get_services)) -> dict:
    extra = {
        "remove_background": {"max_input_edge": config.AI_MAX_EDGE, "outputs": ["cutout", "mask"]},
        "erase": {"max_input_edge": config.AI_MAX_EDGE, "formats": ["jpeg", "png"]},
        "upscale": {"max_input_edge": config.AI_UPSCALE_MAX_EDGE, "scales": [2, 4], "formats": ["jpeg", "png"]},
    }
    out = {}
    for tool, info in MODELS.items():
        entry = {"available": svc.registry.available(tool), "model": info.name, **extra[tool]}
        if not entry["available"]:
            entry["reason"] = svc.registry.reason(tool)
        out[tool] = entry
    return {
        "tools": out,
        "limits": {
            "max_upload_bytes": config.AI_MAX_UPLOAD_BYTES,
            "max_pixels": config.AI_MAX_PIXELS,
            "rate_limit": {"requests": config.AI_RATE_LIMIT, "window_seconds": config.AI_RATE_WINDOW_S},
        },
    }


# ---------------------------------------------------------------------------
# Shared request handling
# ---------------------------------------------------------------------------
async def _prepare(request: Request, tool: str, user_id: str, svc: AIServices,
                   files: tuple[str, ...], options: tuple[str, ...]) -> tuple[dict[str, bytes], dict[str, str]]:
    """Availability, rate limit, size limits, then the multipart form (read only after auth)."""
    if not svc.registry.available(tool):
        raise fail(503, "tool_unavailable", svc.registry.reason(tool) or "This AI tool is not available.")
    retry = svc.limiter.hit(user_id)
    if retry is not None:
        raise fail(429, "rate_limited", "Too many AI requests. Try again in a few minutes.",
                   {"Retry-After": str(retry)})
    max_bytes = config.AI_MAX_UPLOAD_BYTES
    length = request.headers.get("content-length")
    if length and length.isdigit() and int(length) > max_bytes * len(files) + 1024 * 1024:
        raise fail(413, "file_too_large", f"Upload is larger than {max_bytes // (1024 * 1024)} MB.")
    try:
        form = await request.form(max_files=len(files), max_fields=len(options) + len(files) + 2)
    except Exception:
        raise fail(400, "bad_request", "Send the image as multipart/form-data.")
    try:
        blobs: dict[str, bytes] = {}
        for name in files:
            f = form.get(name)
            if not isinstance(f, UploadFile):
                raise fail(400, f"missing_{name}", f"Add the {name} file (form field '{name}').")
            data = await f.read(max_bytes + 1)
            if len(data) > max_bytes:
                raise fail(413, "file_too_large", f"The {name} is larger than {max_bytes // (1024 * 1024)} MB.")
            if not data:
                raise fail(400, "bad_mask" if name == "mask" else "bad_image", f"The {name} file is empty.")
            blobs[name] = data
        opts = {k: str(form.get(k)).strip().lower() for k in options if isinstance(form.get(k), str) and form.get(k).strip()}
    finally:
        await form.close()
    return blobs, opts


async def _run(svc: AIServices, tool: str, work: Callable[[], tuple[bytes, str, tuple[int, int], bool]]) -> Response:
    """Runs `work` in a worker thread, one at a time per tool; returns the image response."""
    started = time.perf_counter()

    def guarded():
        sem = svc.semaphores[tool]
        if not sem.acquire(timeout=config.AI_QUEUE_TIMEOUT_S):
            raise ImageError(503, "busy", "This AI tool is busy. Try again in a moment.")
        try:
            return work()
        finally:
            sem.release()

    try:
        body, media_type, (w, h), downscaled = await run_in_threadpool(guarded)
    except ImageError as e:
        headers = {"Retry-After": "10"} if e.code == "busy" else None
        raise fail(e.status, e.code, e.message, headers)
    except FileNotFoundError:
        raise fail(503, "tool_unavailable", "Model not installed (run scripts/fetch_models.py)")
    except Exception:
        log.exception("AI tool %s failed", tool)
        raise fail(500, "inference_failed", "The AI tool failed on this image.")
    return Response(content=body, media_type=media_type, headers={
        "X-Image-Width": str(w), "X-Image-Height": str(h),
        "X-Input-Downscaled": "true" if downscaled else "false",
        "X-Processing-Ms": str(round((time.perf_counter() - started) * 1000)),
        "Cache-Control": "no-store",
    })


def _choice(opts: dict, key: str, allowed: tuple[str, ...], default: str) -> str:
    value = opts.get(key, default)
    if value not in allowed:
        raise fail(400, "bad_option", f"'{key}' must be one of: {', '.join(allowed)}.")
    return value


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------
@router.post("/remove-background")
async def remove_background(request: Request, user_id: str = Depends(require_user),
                            svc: AIServices = Depends(get_services)) -> Response:
    tool = "remove_background"
    blobs, opts = await _prepare(request, tool, user_id, svc, ("image",), ("output",))
    output = _choice(opts, "output", ("cutout", "mask"), "cutout")

    def work():
        img, downscaled = open_image(blobs["image"], config.AI_MAX_PIXELS, config.AI_MAX_EDGE)
        mask = tools.background_mask(svc.registry.session(tool), img)
        result = mask if output == "mask" else tools.cutout(img, mask)
        body, media = encode(result, "png")
        return body, media, result.size, downscaled

    return await _run(svc, tool, work)


@router.post("/erase")
async def erase(request: Request, user_id: str = Depends(require_user),
                svc: AIServices = Depends(get_services)) -> Response:
    tool = "erase"
    blobs, opts = await _prepare(request, tool, user_id, svc, ("image", "mask"), ("format",))
    fmt = _choice(opts, "format", ("jpeg", "png"), "jpeg")

    def work():
        img, downscaled = open_image(blobs["image"], config.AI_MAX_PIXELS, config.AI_MAX_EDGE)
        mask, _ = open_image(blobs["mask"], config.AI_MAX_PIXELS, field="mask")
        if abs(mask.width / mask.height - img.width / img.height) > 0.02 * (img.width / img.height):
            raise ImageError(400, "mask_size_mismatch", "The mask must have the same shape as the image.")
        remove = tools.mask_to_binary(mask, img.size)
        if not remove.any():
            raise ImageError(400, "empty_mask", "Paint over what you want to remove first.")
        result = tools.erase(svc.registry.session(tool), img, remove)
        body, media = encode(result, fmt, config.AI_JPEG_QUALITY)
        return body, media, result.size, downscaled

    return await _run(svc, tool, work)


@router.post("/upscale")
async def upscale(request: Request, user_id: str = Depends(require_user),
                  svc: AIServices = Depends(get_services)) -> Response:
    tool = "upscale"
    blobs, opts = await _prepare(request, tool, user_id, svc, ("image",), ("scale", "format"))
    scale = int(_choice(opts, "scale", ("2", "4"), "2"))
    fmt = _choice(opts, "format", ("jpeg", "png"), "jpeg")

    def work():
        img, _ = open_image(blobs["image"], config.AI_MAX_PIXELS, reject_over_edge=config.AI_UPSCALE_MAX_EDGE)
        result = tools.upscale(svc.registry.session(tool), img, scale)
        body, media = encode(result, fmt, config.AI_JPEG_QUALITY)
        return body, media, result.size, False

    return await _run(svc, tool, work)
