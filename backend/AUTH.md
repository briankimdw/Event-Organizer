# Backend auth

How the FastAPI backend checks who is calling, and what logout does and doesn't do.

## ⚠️ Top priority: move the session denylist to Redis

The Postgres denylist (`public.revoked_sessions`) is a stopgap until Redis is set up. Moving it to Redis is the most important follow-up for auth.

What the move fixes:

- **No 30-second delay across processes.** Every worker reads the same Redis, so a logout applies everywhere immediately. The per-process "not revoked" cache in `core/sessions.py` can go.
- **Less load on the database.** A Redis lookup takes well under a millisecond, while the current check makes an HTTP round trip to the database through PostgREST on every cache miss.
- **Nothing to purge.** Store each session as `SET revoked:<session_id> 1 EX <seconds until token exp>`. Redis deletes it when the token would have expired anyway.

What it doesn't fix (see Limits):

- A signed-out token still works directly against Supabase.
- A sign-out that skips `POST /auth/logout` still isn't seen.

Steps:

1. Add Redis to local dev (Docker) and to deployment.
2. Add `REDIS_URL` to settings.
3. Swap the two database calls for Redis calls:
   - `revoke_my_session()` → `SET ... EX`
   - `is_my_session_revoked()` → `EXISTS`
4. Remove the 30-second cache.
5. Drop `public.revoked_sessions` and its functions in a new migration.
6. Decide how to behave when Redis is down. Today that returns 503.
7. Update this doc.

## How a request is authenticated

1. The frontend sends the Supabase access token: `Authorization: Bearer <access_token>`.
2. `get_current_user` (`dependencies/auth.py`) verifies the token **locally** with PyJWT. It checks the signature against the project's public keys (`/auth/v1/.well-known/jwks.json`, ES256, cached), plus expiry, audience (`authenticated`) and issuer. Tokens signed with the older HS256 secret are verified with `SUPABASE_JWT_SECRET`.
3. It then checks the token's `session_id` against `public.revoked_sessions` (see Logout below). The answer is cached in each process (`core/sessions.py`).
4. Database queries go through `SupabaseDep`, a client that sends the user's token, so Row-Level Security applies as that user.

Use in a route:

```python
async def my_route(user: CurrentUser, db: SupabaseDep): ...
```

## Logout

`POST /auth/logout`:

1. Records the session in `public.revoked_sessions` (via `revoke_my_session()`). From then on this API answers 401 "Session has been signed out" for that token.
2. Signs the session out at Supabase (scope `local`), which revokes its refresh token, so the token can't be renewed.

The frontend should call it first, then `supabase.auth.signOut({ scope: 'local' })` to clear the stored session.

Access tokens last **10 minutes** (`jwt_expiry = 600`), and supabase-js refreshes them in the background.

## Limits

- **A signed-out token still works against Supabase directly.** Supabase only checks the JWT signature, so a copied token can still query the database through supabase-js / PostgREST, within RLS, until it expires (at most 10 minutes). The short token lifetime is the only protection there.
- **Only logouts through `POST /auth/logout` are seen by the backend.** If the frontend calls `supabase.auth.signOut()` without calling our endpoint, the token keeps working on this API until it expires. The same applies to sessions ended any other way, including:
  - password reset
  - "sign out everywhere"
  - deleting or banning a user in the dashboard
- **Logout only covers the current device.** We only know the `session_id` of the token making the call. Signing out other devices would end their sessions at Supabase, but their access tokens would keep working here until they expire.
- **Up to 30 seconds' delay across processes** *(fixed by the Redis move)*. Each process caches "not revoked" answers for 30 seconds (`RevokedSessions.recheck_seconds`). A logout handled by one worker reaches the others within that window. The worker that handled the logout rejects the token immediately.
- **If the database can't be reached, signed-in requests fail with 503.** The revocation check is a database call (cached as above), so this happens on any cache miss, and on every request until the `revoked_sessions` migration is applied.
- **Deleting a user doesn't kill their token here.** Verification is local, so a deleted user's token keeps working here until it expires, unless that session was already logged out through our endpoint.

## Possible later improvements

(The Redis move is at the top of this doc.)

- **Close the dashboard and "sign out everywhere" gap.** Check `auth.sessions` instead of a denylist. This catches every way a session can end, but needs server-side database or service-role access.

## Setup

- `backend/.env`:
  - `SUPABASE_URL`
  - `SUPABASE_KEY`: the **publishable/anon** key, never service_role.
  - `SUPABASE_JWT_SECRET`: only needed for legacy HS256 tokens.
- Migration `supabase/migrations/20261008220000_revoked_sessions.sql` must be applied (`npx supabase db push`).
- Access token expiry is set to 600s in `supabase/config.toml`; on the hosted project, set it in the dashboard (Authentication settings) or run `npx supabase config push`.
- Run: `cd backend && .venv/bin/uvicorn main:app --reload`
