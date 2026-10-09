"""Supabase auth dependencies.

Usage in a route:

    @router.get("/thing")
    async def thing(user: CurrentUser, db: SupabaseDep): ...

- AccessTokenDep: the raw bearer token from `Authorization: Bearer <jwt>`
- CurrentUser:    the verified user from the JWT claims (401 if missing/invalid)
- SupabaseDep:    a Supabase client that sends the user's token, so queries run
                  under RLS as that user
"""
from functools import lru_cache
from typing import Annotated, Any

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from supabase import AsyncClient, AsyncClientOptions, acreate_client

from config import Settings, get_settings
from core.sessions import revoked_sessions

SettingsDep = Annotated[Settings, Depends(get_settings)]

_bearer = HTTPBearer(auto_error=False)


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_access_token(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> str:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _unauthorized("Not authenticated")
    return credentials.credentials


AccessTokenDep = Annotated[str, Depends(get_access_token)]


async def get_supabase(token: AccessTokenDep, settings: SettingsDep) -> AsyncClient:
    # A fresh client per request: the Authorization header is per-user, and
    # sharing one client across requests would leak sessions between users.
    return await acreate_client(
        settings.supabase_url,
        settings.supabase_key,
        options=AsyncClientOptions(
            headers={"Authorization": f"Bearer {token}"},
            persist_session=False,
            auto_refresh_token=False,
        ),
    )


SupabaseDep = Annotated[AsyncClient, Depends(get_supabase)]


class AuthUser(BaseModel):
    id: str
    email: str | None = None
    role: str | None = None
    session_id: str | None = None
    claims: dict[str, Any]


@lru_cache
def _jwks_client(supabase_url: str) -> jwt.PyJWKClient:
    # Public signing keys, fetched once and cached (refetched on unknown kid).
    return jwt.PyJWKClient(f"{supabase_url}/auth/v1/.well-known/jwks.json", lifespan=600)


_http = httpx.Client(timeout=5)


def _is_session_revoked_in_db(token: str, settings: Settings) -> bool:
    try:
        r = _http.post(
            f"{settings.supabase_url}/rest/v1/rpc/is_my_session_revoked",
            headers={"apikey": settings.supabase_key, "Authorization": f"Bearer {token}"},
            json={},
        )
        r.raise_for_status()
    except httpx.HTTPError:
        # Fail closed, but as an outage rather than signing everyone out.
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Could not verify session")
    return r.json() is True


def get_current_user(token: AccessTokenDep, settings: SettingsDep) -> AuthUser:
    # Signature, expiry, audience and issuer are verified locally; revocation
    # (POST /auth/logout) is checked against public.revoked_sessions, cached in
    # core.sessions. A sign-out that skips our endpoint (e.g. supabase-js
    # signOut() alone) is not seen here; the token then lives until it expires.
    # Plain `def` so FastAPI runs it in a thread; the JWKS fetch and the
    # revocation lookup are blocking.
    try:
        alg = jwt.get_unverified_header(token).get("alg")
        if alg == "HS256":
            # Legacy shared-secret tokens.
            if not settings.supabase_jwt_secret:
                raise _unauthorized("Invalid or expired token")
            key: Any = settings.supabase_jwt_secret
        else:
            key = _jwks_client(settings.supabase_url).get_signing_key_from_jwt(token).key
        claims = jwt.decode(
            token,
            key,
            algorithms=["HS256"] if alg == "HS256" else ["ES256", "RS256"],
            audience="authenticated",
            issuer=f"{settings.supabase_url}/auth/v1",
            options={"require": ["exp", "sub", "aud", "iss"]},
        )
    except (jwt.PyJWTError, jwt.PyJWKClientError):
        raise _unauthorized("Invalid or expired token")

    session_id = claims.get("session_id")
    if session_id and revoked_sessions.is_revoked(
        session_id, lambda: _is_session_revoked_in_db(token, settings)
    ):
        raise _unauthorized("Session has been signed out")

    return AuthUser(
        id=claims["sub"],
        email=claims.get("email"),
        role=claims.get("role"),
        session_id=session_id,
        claims=claims,
    )


CurrentUser = Annotated[AuthUser, Depends(get_current_user)]
