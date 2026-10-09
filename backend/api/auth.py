from fastapi import APIRouter, HTTPException, status
from postgrest.exceptions import APIError
from supabase_auth.errors import AuthError

from core.sessions import revoked_sessions
from dependencies.auth import AccessTokenDep, CurrentUser, SupabaseDep

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(user: CurrentUser, token: AccessTokenDep, db: SupabaseDep):
    """Sign out this session. The access token stops working on this API
    immediately, and the refresh token is revoked at Supabase.

    The frontend should still call `supabase.auth.signOut({ scope: 'local' })`
    afterwards to clear its stored session.
    """
    if not user.session_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Token has no session")

    # Denylist first: if the Supabase call below fails, the token is still dead here.
    try:
        await db.rpc("revoke_my_session").execute()
    except APIError:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Could not sign out")
    revoked_sessions.mark_revoked(user.session_id, user.claims["exp"])

    # "local" only: with "global", other devices' sessions would end at Supabase
    # but their access tokens (whose session_ids we don't know) would keep
    # working here until they expire.
    try:
        await db.auth.admin.sign_out(token, "local")
    except AuthError:
        pass  # session already gone at Supabase; the denylist entry still applies
