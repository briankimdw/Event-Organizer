"""AI photo tools (/ai/*): auth, limits, capabilities, and (when the models are installed) a smoke
test per tool on tiny generated images. No network: the token check is faked.

    .venv/Scripts/python -m pytest -q tests/test_ai_tools.py
"""
import sys
import threading
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace

import httpx
import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import config  # noqa: E402
from app.ai import router as ai  # noqa: E402
from app.ai.models import ModelRegistry  # noqa: E402
from app.auth import TokenVerifier  # noqa: E402
from app.main import app  # noqa: E402

GOOD = {"Authorization": "Bearer good-token"}
MODELS_DIR = Path(config.AI_MODELS_DIR)


class FakeVerifier:
    def user_id(self, token):
        return "user-1" if token == "good-token" else None


class FakeSession:
    """Stands in for an ONNX Runtime session: shapes like the real models, trivial math."""

    def __init__(self, tool):
        self.tool = tool

    def get_inputs(self):
        names = {"remove_background": ["input_image"], "erase": ["image", "mask"], "upscale": ["input"]}[self.tool]
        return [SimpleNamespace(name=n) for n in names]

    def run(self, _outputs, feeds):
        if self.tool == "remove_background":
            return [np.zeros((1, 1, 1024, 1024), np.float32)]
        if self.tool == "erase":
            return [feeds["image"] * 255.0]
        x = feeds["input"]
        return [x.repeat(4, axis=2).repeat(4, axis=3)]


class FakeRegistry(ModelRegistry):
    def __init__(self):
        super().__init__(models_dir=Path("does-not-exist"))

    def available(self, tool):
        return True

    def session(self, tool):
        return FakeSession(tool)


def make_client(registry=None, limiter=None):
    svc = ai.AIServices(registry=registry or FakeRegistry(), verifier=FakeVerifier(), limiter=limiter)
    app.dependency_overrides[ai.get_services] = lambda: svc
    return TestClient(app), svc  # no `with`: the SigLIP lifespan is not started


@pytest.fixture(autouse=True)
def _reset_overrides():
    yield
    app.dependency_overrides.clear()


def png(w, h, color=(120, 160, 200), mode="RGB") -> bytes:
    buf = BytesIO()
    Image.new(mode, (w, h), color).save(buf, "PNG")
    return buf.getvalue()


def jpeg(w, h) -> bytes:
    buf = BytesIO()
    Image.new("RGB", (w, h), (90, 120, 30)).save(buf, "JPEG")
    return buf.getvalue()


def mask_png(w, h, box=None) -> bytes:
    m = Image.new("L", (w, h), 0)
    if box:
        ImageDraw.Draw(m).rectangle(box, fill=255)
    buf = BytesIO()
    m.save(buf, "PNG")
    return buf.getvalue()


def code(r):
    return r.json()["detail"]["code"]


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("method,path", [("get", "/ai/capabilities"), ("post", "/ai/remove-background"),
                                         ("post", "/ai/erase"), ("post", "/ai/upscale")])
@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer nope"}, {"Authorization": "good-token"}])
def test_auth_required(method, path, headers):
    client, _ = make_client()
    kwargs = {} if method == "get" else {"files": {"image": ("a.png", png(8, 8), "image/png")}}
    r = getattr(client, method)(path, headers=headers, **kwargs)
    assert r.status_code == 401
    assert code(r) == "unauthorized"
    assert r.headers["www-authenticate"] == "Bearer"


def test_token_verifier_asks_supabase_and_caches():
    calls = []

    def handler(request):
        calls.append(request)
        if request.headers["authorization"] == "Bearer ok":
            return httpx.Response(200, json={"id": "u-42"})
        return httpx.Response(401, json={"msg": "bad jwt"})

    v = TokenVerifier(url="https://x.supabase.co", apikey="anon", http=httpx.Client(transport=httpx.MockTransport(handler)))
    assert v.user_id("ok") == "u-42"
    assert v.user_id("ok") == "u-42"
    assert len(calls) == 1  # cached
    assert calls[0].url.path == "/auth/v1/user" and calls[0].headers["apikey"] == "anon"
    assert v.user_id("bad") is None
    assert v.user_id("") is None
    assert TokenVerifier(url="", apikey="anon").user_id("ok") is None  # not configured: nobody gets in


# ---------------------------------------------------------------------------
# Capabilities, models absent
# ---------------------------------------------------------------------------
def test_capabilities_without_models(tmp_path):
    client, _ = make_client(registry=ModelRegistry(models_dir=tmp_path))
    r = client.get("/ai/capabilities", headers=GOOD)
    assert r.status_code == 200
    body = r.json()
    assert set(body["tools"]) == {"remove_background", "erase", "upscale"}
    for t in body["tools"].values():
        assert t["available"] is False and "fetch_models" in t["reason"]
    assert body["tools"]["upscale"]["scales"] == [2, 4]
    assert body["tools"]["upscale"]["max_input_edge"] == config.AI_UPSCALE_MAX_EDGE
    assert body["tools"]["erase"]["max_input_edge"] == config.AI_MAX_EDGE
    assert body["limits"]["max_upload_bytes"] == config.AI_MAX_UPLOAD_BYTES


@pytest.mark.parametrize("path", ["/ai/remove-background", "/ai/erase", "/ai/upscale"])
def test_tools_unavailable_without_models(tmp_path, path):
    client, _ = make_client(registry=ModelRegistry(models_dir=tmp_path))
    r = client.post(path, headers=GOOD, files={"image": ("a.png", png(8, 8), "image/png")})
    assert r.status_code == 503 and code(r) == "tool_unavailable"


# ---------------------------------------------------------------------------
# Limits and validation (fake models)
# ---------------------------------------------------------------------------
def test_remove_background_downscales_big_input():
    client, _ = make_client()
    r = client.post("/ai/remove-background", headers=GOOD, files={"image": ("a.jpg", jpeg(3000, 1500), "image/jpeg")})
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "image/png"
    assert r.headers["x-input-downscaled"] == "true"
    assert (r.headers["x-image-width"], r.headers["x-image-height"]) == ("2048", "1024")
    out = Image.open(BytesIO(r.content))
    assert out.mode == "RGBA" and out.size == (2048, 1024)


def test_remove_background_mask_output():
    client, _ = make_client()
    r = client.post("/ai/remove-background", headers=GOOD, data={"output": "mask"},
                    files={"image": ("a.png", png(40, 30), "image/png")})
    assert r.status_code == 200
    out = Image.open(BytesIO(r.content))
    assert out.mode == "L" and out.size == (40, 30)
    assert r.headers["x-input-downscaled"] == "false"


def test_bad_option_and_bad_image():
    client, _ = make_client()
    r = client.post("/ai/remove-background", headers=GOOD, data={"output": "sticker"},
                    files={"image": ("a.png", png(8, 8), "image/png")})
    assert r.status_code == 400 and code(r) == "bad_option"
    r = client.post("/ai/upscale", headers=GOOD, data={"scale": "3"}, files={"image": ("a.png", png(8, 8), "image/png")})
    assert r.status_code == 400 and code(r) == "bad_option"
    r = client.post("/ai/remove-background", headers=GOOD, files={"image": ("a.png", b"not an image", "image/png")})
    assert r.status_code == 400 and code(r) == "bad_image"
    r = client.post("/ai/remove-background", headers=GOOD, data={"output": "mask"})
    assert r.status_code == 400 and code(r) == "missing_image"


def test_file_too_large(monkeypatch):
    monkeypatch.setattr(config, "AI_MAX_UPLOAD_BYTES", 1000)
    client, _ = make_client()
    r = client.post("/ai/remove-background", headers=GOOD, files={"image": ("a.png", png(300, 300, mode="RGB") + b"\0" * 2000, "image/png")})
    assert r.status_code == 413 and code(r) == "file_too_large"


def test_too_many_pixels(monkeypatch):
    monkeypatch.setattr(config, "AI_MAX_PIXELS", 10_000)
    client, _ = make_client()
    r = client.post("/ai/erase", headers=GOOD, files={"image": ("a.png", png(200, 200), "image/png"),
                                                     "mask": ("m.png", mask_png(200, 200, (5, 5, 20, 20)), "image/png")})
    assert r.status_code == 413 and code(r) == "too_many_pixels"


def test_upscale_rejects_large_input_and_scales():
    client, _ = make_client()
    edge = config.AI_UPSCALE_MAX_EDGE
    r = client.post("/ai/upscale", headers=GOOD, files={"image": ("a.png", png(edge + 1, 10), "image/png")})
    assert r.status_code == 413 and code(r) == "upscale_input_too_large"
    for scale, fmt, media in (("2", None, "image/jpeg"), ("4", "png", "image/png")):
        data = {"scale": scale} | ({"format": fmt} if fmt else {})
        r = client.post("/ai/upscale", headers=GOOD, data=data, files={"image": ("a.png", png(30, 20), "image/png")})
        assert r.status_code == 200, r.text
        assert r.headers["content-type"] == media
        assert Image.open(BytesIO(r.content)).size == (30 * int(scale), 20 * int(scale))


def test_erase_validation():
    client, _ = make_client()
    img = ("a.png", png(64, 48), "image/png")
    r = client.post("/ai/erase", headers=GOOD, files={"image": img})
    assert r.status_code == 400 and code(r) == "missing_mask"
    r = client.post("/ai/erase", headers=GOOD, files={"image": img, "mask": ("m.png", mask_png(64, 48), "image/png")})
    assert r.status_code == 400 and code(r) == "empty_mask"
    r = client.post("/ai/erase", headers=GOOD, files={"image": img, "mask": ("m.png", mask_png(48, 48, (5, 5, 10, 10)), "image/png")})
    assert r.status_code == 400 and code(r) == "mask_size_mismatch"
    r = client.post("/ai/erase", headers=GOOD, files={"image": img, "mask": ("m.png", b"junk", "image/png")})
    assert r.status_code == 400 and code(r) == "bad_mask"
    # A half-size mask with the same shape is fine; transparent = keep.
    m = Image.new("RGBA", (32, 24), (0, 0, 0, 0))
    ImageDraw.Draw(m).rectangle((4, 4, 10, 10), fill=(255, 255, 255, 255))
    buf = BytesIO()
    m.save(buf, "PNG")
    r = client.post("/ai/erase", headers=GOOD, files={"image": img, "mask": ("m.png", buf.getvalue(), "image/png")})
    assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
    assert Image.open(BytesIO(r.content)).size == (64, 48)


def test_rate_limit():
    client, _ = make_client(limiter=ai.RateLimiter(limit=2, window=600))
    files = {"image": ("a.png", png(8, 8), "image/png")}
    assert client.post("/ai/upscale", headers=GOOD, files=files).status_code == 200
    assert client.post("/ai/remove-background", headers=GOOD, files=files).status_code == 200
    r = client.post("/ai/upscale", headers=GOOD, files=files)
    assert r.status_code == 429 and code(r) == "rate_limited"
    assert int(r.headers["retry-after"]) > 0


def test_busy_tool_times_out(monkeypatch):
    monkeypatch.setattr(config, "AI_QUEUE_TIMEOUT_S", 0.05)
    client, svc = make_client()
    sem = svc.semaphores["upscale"]
    assert sem.acquire(timeout=1)  # another request is "running"
    try:
        r = client.post("/ai/upscale", headers=GOOD, files={"image": ("a.png", png(8, 8), "image/png")})
    finally:
        sem.release()
    assert r.status_code == 503 and code(r) == "busy" and "retry-after" in r.headers
    # Other tools are not blocked by it.
    assert client.post("/ai/remove-background", headers=GOOD, files={"image": ("a.png", png(8, 8), "image/png")}).status_code == 200


def test_one_request_per_tool_at_a_time():
    client, svc = make_client()
    running, peak, lock = [0], [0], threading.Lock()
    real = FakeSession.run

    def slow_run(self, outputs, feeds):
        with lock:
            running[0] += 1
            peak[0] = max(peak[0], running[0])
        threading.Event().wait(0.1)
        with lock:
            running[0] -= 1
        return real(self, outputs, feeds)

    FakeSession.run = slow_run
    try:
        threads = [threading.Thread(target=lambda: client.post(
            "/ai/upscale", headers=GOOD, files={"image": ("a.png", png(8, 8), "image/png")})) for _ in range(3)]
        [t.start() for t in threads]
        [t.join() for t in threads]
    finally:
        FakeSession.run = real
    assert peak[0] == 1


def test_cors_for_web_app_origins():
    client, _ = make_client()
    for origin, ok in (("http://localhost:5173", True), ("http://192.168.1.23:5173", True),
                       ("https://evil.example", False), ("http://8.8.8.8:5173", False)):
        r = client.options("/ai/erase", headers={"Origin": origin, "Access-Control-Request-Method": "POST",
                                                  "Access-Control-Request-Headers": "authorization"})
        assert (r.headers.get("access-control-allow-origin") == origin) is ok, origin
    r = client.get("/ai/capabilities", headers={**GOOD, "Origin": "http://localhost:5173"})
    assert "X-Processing-Ms" in r.headers["access-control-expose-headers"]


# ---------------------------------------------------------------------------
# Real models (skipped when scripts/fetch_models.py has not been run)
# ---------------------------------------------------------------------------
def _needs(tool):
    return pytest.mark.skipif(not ModelRegistry().available(tool), reason=f"{tool} model not installed")


@_needs("remove_background")
def test_smoke_remove_background():
    client, _ = make_client(registry=ModelRegistry())
    im = Image.new("RGB", (96, 64), (230, 230, 230))
    ImageDraw.Draw(im).ellipse((30, 12, 66, 52), fill=(200, 40, 40))
    buf = BytesIO()
    im.save(buf, "PNG")
    r = client.post("/ai/remove-background", headers=GOOD, files={"image": ("a.png", buf.getvalue(), "image/png")})
    assert r.status_code == 200, r.text
    out = Image.open(BytesIO(r.content))
    assert out.mode == "RGBA" and out.size == (96, 64)


@_needs("erase")
def test_smoke_erase():
    client, _ = make_client(registry=ModelRegistry())
    im = Image.new("RGB", (96, 64), (40, 120, 200))
    ImageDraw.Draw(im).rectangle((40, 20, 55, 40), fill=(250, 250, 0))
    buf = BytesIO()
    im.save(buf, "PNG")
    r = client.post("/ai/erase", headers=GOOD, data={"format": "png"},
                    files={"image": ("a.png", buf.getvalue(), "image/png"),
                           "mask": ("m.png", mask_png(96, 64, (38, 18, 57, 42)), "image/png")})
    assert r.status_code == 200, r.text
    out = np.asarray(Image.open(BytesIO(r.content)).convert("RGB"), dtype=np.int16)
    # The yellow box is gone: the filled area looks like the blue around it.
    assert np.abs(out[25:35, 44:52] - np.array([40, 120, 200])).mean() < 40


@_needs("upscale")
def test_smoke_upscale():
    client, _ = make_client(registry=ModelRegistry())
    r = client.post("/ai/upscale", headers=GOOD, data={"scale": "4"}, files={"image": ("a.png", png(24, 16), "image/png")})
    assert r.status_code == 200, r.text
    assert Image.open(BytesIO(r.content)).size == (96, 64)
