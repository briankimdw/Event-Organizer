from fastapi import APIRouter, HTTPException, status

from dependencies.auth import CurrentUser, SupabaseDep

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me")
async def read_me(user: CurrentUser):
    return {"id": user.id, "email": user.email}


@router.get("/me/profile")
async def read_my_profile(user: CurrentUser, db: SupabaseDep):
    # Runs as the signed-in user, so the profiles RLS policies apply.
    result = (
        await db.table("profiles")
        .select("id, username, display_name, avatar_path, bio, city")
        .eq("id", user.id)
        .maybe_single()
        .execute()
    )
    if result is None or result.data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found")
    return result.data
