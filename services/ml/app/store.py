"""Talks to Supabase with the service role key: finds photos to analyse, downloads them,
and saves results through the ml_* database functions (service role only)."""
from __future__ import annotations

from io import BytesIO
from urllib.parse import quote

import httpx
from PIL import Image

from . import config


class Store:
    def __init__(self, url: str = config.SUPABASE_URL, key: str = config.SUPABASE_SERVICE_ROLE_KEY):
        if not url or not key:
            raise RuntimeError("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see services/ml/.env.example).")
        self.url = url
        self.http = httpx.Client(
            timeout=60,
            headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        )

    def pending_photos(self, limit: int) -> list[dict]:
        """[{photo_id, display_path}] for photos without an embedding yet."""
        r = self.http.post(f"{self.url}/rest/v1/rpc/ml_pending_photos", json={"p_limit": limit})
        r.raise_for_status()
        return r.json()

    def download(self, display_path: str) -> Image.Image:
        path = quote(display_path, safe="/")
        r = self.http.get(f"{self.url}/storage/v1/object/public/{config.PORTFOLIO_BUCKET}/{path}")
        r.raise_for_status()
        image = Image.open(BytesIO(r.content))
        image.load()
        return image

    def save(self, photo_id: str, embedding: str, tags: list[str], model: str) -> None:
        r = self.http.post(
            f"{self.url}/rest/v1/rpc/ml_save_photo_analysis",
            json={"p_photo_id": photo_id, "p_embedding": embedding, "p_auto_tags": tags, "p_model": model},
        )
        r.raise_for_status()
