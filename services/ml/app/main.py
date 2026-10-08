"""Small HTTP API around the model.

    uvicorn app.main:app --port 8000

GET  /health           model + device (no secret needed)
POST /analyze          upload an image, get its auto-tags (for trying the model)
POST /process-pending  analyse waiting photos now (for a database webhook or cron)
POST /embed-text       text -> embedding, for future "search by description"
All POSTs require the X-ML-Secret header to equal ML_WEBHOOK_SECRET.
"""
from __future__ import annotations

import hmac
from contextlib import asynccontextmanager
from io import BytesIO

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from PIL import Image
from pydantic import BaseModel

from . import config
from .siglip import SigLIP
from .store import Store
from .worker import run_once

state: dict = {}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    state["engine"] = SigLIP()  # load once at startup (a few seconds)
    yield


app = FastAPI(title="photomatch ML", lifespan=lifespan)


def require_secret(x_ml_secret: str = Header(default="")) -> None:
    if not config.ML_WEBHOOK_SECRET or not hmac.compare_digest(x_ml_secret, config.ML_WEBHOOK_SECRET):
        raise HTTPException(status_code=401, detail="Missing or wrong X-ML-Secret")


@app.get("/health")
def health() -> dict:
    engine: SigLIP = state["engine"]
    return {"ok": True, "model": engine.model_id, "device": engine.device}


@app.post("/analyze", dependencies=[Depends(require_secret)])
async def analyze(image: UploadFile = File(...)) -> dict:
    engine: SigLIP = state["engine"]
    try:
        img = Image.open(BytesIO(await image.read()))
    except Exception:
        raise HTTPException(status_code=400, detail="Not an image")
    embedding, tags = engine.analyze([img])[0]
    return {"tags": tags, "dimensions": len(embedding)}


@app.post("/process-pending", dependencies=[Depends(require_secret)])
def process_pending() -> dict:
    engine: SigLIP = state["engine"]
    store = state.setdefault("store", Store())
    total = 0
    while (n := run_once(engine, store)) > 0:
        total += n
    return {"analysed": total}


class TextIn(BaseModel):
    text: str


@app.post("/embed-text", dependencies=[Depends(require_secret)])
def embed_text(body: TextIn) -> dict:
    engine: SigLIP = state["engine"]
    return {"embedding": engine.embed_texts([body.text])[0].cpu().tolist()}
