import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from core.travel import distance_km, parse_point, travel_fee_cents
from dependencies.auth import CurrentUser, SupabaseDep

router = APIRouter(prefix="/providers", tags=["providers"])


@router.get("/{provider_id}/travel-quote")
async def read_travel_quote(
    provider_id: uuid.UUID,
    lat: Annotated[float, Query(ge=-90, le=90)],
    lng: Annotated[float, Query(ge=-180, le=180)],
    user: CurrentUser,
    db: SupabaseDep,
):
    # Runs as the signed-in user, so RLS hides inactive providers (404).
    result = (
        await db.table("providers")
        .select("id, base_location, service_radius_km, travel_fee_per_km_cents")
        .eq("id", str(provider_id))
        .maybe_single()
        .execute()
    )
    if result is None or not isinstance(result.data, dict):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Provider not found")
    row = result.data

    base = parse_point(row["base_location"])
    if base is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "Provider has no base location set"
        )

    base_lat, base_lng = base
    radius = row["service_radius_km"]
    rate = row["travel_fee_per_km_cents"]
    distance = distance_km(base_lat, base_lng, lat, lng)
    return {
        "provider_id": str(provider_id),
        "distance_km": round(distance, 2),
        "service_radius_km": radius,
        "billable_km": round(max(0.0, distance - radius), 2),
        "travel_fee_per_km_cents": rate,
        # From the full-precision distance, never the rounded display values.
        "travel_fee_cents": travel_fee_cents(distance, radius, rate),
    }
