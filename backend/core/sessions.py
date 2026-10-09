"""Per-process cache in front of the revoked_sessions table.

A revoked session stays revoked, so a "revoked" answer is cached until the
token expires. A "not revoked" answer is rechecked every `recheck_seconds`:
that is how long a logout handled by another worker/process can take to reach
this one. Logouts handled by this process apply immediately.
"""
import threading
import time
from collections.abc import Callable


class RevokedSessions:
    def __init__(self, recheck_seconds: float = 30) -> None:
        self.recheck_seconds = recheck_seconds
        self._revoked: dict[str, float] = {}  # session_id -> token exp (epoch)
        self._ok_until: dict[str, float] = {}  # session_id -> recheck after
        self._lock = threading.Lock()

    def mark_revoked(self, session_id: str, expires_at: float) -> None:
        with self._lock:
            self._revoked[session_id] = expires_at
            self._ok_until.pop(session_id, None)
            self._purge(time.time())

    def is_revoked(self, session_id: str, lookup: Callable[[], bool]) -> bool:
        """`lookup` asks the database; it is only called on a cache miss."""
        now = time.time()
        with self._lock:
            if session_id in self._revoked:
                return True
            if self._ok_until.get(session_id, 0) > now:
                return False

        revoked = lookup()

        with self._lock:
            if revoked:
                # Exact expiry isn't known here; the token is rejected anyway
                # once it expires, so keeping the entry a while is harmless.
                self._revoked[session_id] = now + 3600
            else:
                self._ok_until[session_id] = now + self.recheck_seconds
            if len(self._ok_until) > 10_000:
                self._purge(now)
        return revoked

    def _purge(self, now: float) -> None:
        self._revoked = {k: v for k, v in self._revoked.items() if v > now}
        self._ok_until = {k: v for k, v in self._ok_until.items() if v > now}


revoked_sessions = RevokedSessions()
