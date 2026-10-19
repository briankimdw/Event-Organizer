"""Who is calling /plan? Verifies the Supabase access token (Claude calls cost money)."""
from __future__ import annotations

import hashlib
import threading
import time
from typing import Optional

import httpx

from .. import config

CACHE_SECONDS = 60


class TokenVerifier:
    """Asks Supabase Auth (GET /auth/v1/user) whether a bearer token is valid.
    Valid results are cached briefly so a burst of requests costs one round trip."""

    def __init__(self, url: str = config.SUPABASE_URL,
                 apikey: str = config.SUPABASE_ANON_KEY or config.SUPABASE_SERVICE_ROLE_KEY,
                 http: Optional[httpx.Client] = None):
        self.url = url
        self.apikey = apikey
        self.http = http or httpx.Client(timeout=10)
        self._cache: dict[str, tuple[float, str]] = {}
        self._lock = threading.Lock()

    def user_id(self, token: str) -> Optional[str]:
        """The user's id, or None if the token is missing, expired or invalid."""
        if not token or not self.url or not self.apikey:
            return None
        key = hashlib.sha256(token.encode()).hexdigest()
        now = time.monotonic()
        with self._lock:
            hit = self._cache.get(key)
            if hit and hit[0] > now:
                return hit[1]
        try:
            r = self.http.get(f"{self.url}/auth/v1/user",
                              headers={"Authorization": f"Bearer {token}", "apikey": self.apikey})
        except httpx.HTTPError:
            return None
        if r.status_code != 200:
            return None
        uid = (r.json() or {}).get("id")
        if not uid:
            return None
        with self._lock:
            if len(self._cache) > 1000:
                self._cache.clear()
            self._cache[key] = (now + CACHE_SECONDS, uid)
        return uid
