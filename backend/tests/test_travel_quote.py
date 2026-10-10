from collections.abc import Iterator
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from core.travel import distance_km, parse_point, travel_fee_cents
from dependencies.auth import AuthUser, get_current_user, get_supabase
from main import app

PROVIDER_ID = "00000000-0000-0000-0000-000000000001"
URL = f"/providers/{PROVIDER_ID}/travel-quote"
# Downtown LA (34.0522, -118.2437) as PostgREST returns it: EWKB hex with SRID 4326.
LA_EWKB = "0101000020E61000004182E2C7988F5DC0F46C567DAE064140"
SANTA_BARBARA = {"lat": 34.4208, "lng": -119.6982}


class FakeQuery:
    """Stands in for the Supabase query builder: every builder call returns itself."""

    def __init__(self, data: Any) -> None:
        self.data = data
        self.calls: list[str] = []

    def __getattr__(self, name: str) -> Any:
        def call(*args: Any, **kwargs: Any) -> "FakeQuery":
            self.calls.append(name)
            return self

        return call

    async def execute(self) -> SimpleNamespace:
        self.calls.append("execute")
        return SimpleNamespace(data=self.data)


def provider_row(**overrides: Any) -> dict[str, Any]:
    row = {
        "id": PROVIDER_ID,
        "base_location": LA_EWKB,
        "service_radius_km": 40,
        "travel_fee_per_km_cents": 150,
    }
    row.update(overrides)
    return row


@pytest.fixture
def client() -> Iterator[TestClient]:
    yield TestClient(app)
    app.dependency_overrides.clear()


def sign_in_with(data: Any) -> FakeQuery:
    db = FakeQuery(data)
    app.dependency_overrides[get_current_user] = lambda: AuthUser(id="u", claims={})
    app.dependency_overrides[get_supabase] = lambda: db
    return db


# Fee rule


def test_fee_inside_radius_is_zero() -> None:
    assert travel_fee_cents(39.9, 40, 150) == 0


def test_fee_at_radius_is_zero() -> None:
    assert travel_fee_cents(40, 40, 150) == 0


def test_fee_beyond_radius() -> None:
    assert travel_fee_cents(41, 40, 150) == 150
    assert travel_fee_cents(139.8475864827785, 40, 150) == 14977


def test_fee_rounds_half_up() -> None:
    # round(20.5) would give 20 (banker's rounding).
    assert travel_fee_cents(10.25, 0, 2) == 21


def test_fee_zero_rate() -> None:
    assert travel_fee_cents(500, 40, 0) == 0


# Distance


def test_distance_matches_frontend_haversine() -> None:
    assert abs(distance_km(0, 0, 0, 1) - 111.19492664455873) < 1e-6
    assert distance_km(34.0522, -118.2437, 34.0522, -118.2437) == 0
    assert abs(distance_km(34.0522, -118.2437, 34.4208, -119.6982) - 139.8475864827785) < 1e-6


# parse_point


def test_parse_point_ewkb_hex() -> None:
    point = parse_point(LA_EWKB)
    assert point is not None
    assert point == pytest.approx((34.0522, -118.2437), abs=1e-9)


def test_parse_point_wkb_hex_big_endian_without_srid() -> None:
    # Byte order 0 (big-endian), type 1, then lng, lat.
    wkb = "00" + "00000001" + "C05D8F98C7E28241" + "404106AE7D566CF4"
    point = parse_point(wkb)
    assert point is not None
    assert point == pytest.approx((34.0522, -118.2437), abs=1e-9)


def test_parse_point_geojson() -> None:
    assert parse_point({"type": "Point", "coordinates": [-118.2437, 34.0522]}) == (
        34.0522,
        -118.2437,
    )
    assert parse_point({"coordinates": [1, 2]}) == (2.0, 1.0)


def test_parse_point_wkt() -> None:
    assert parse_point("SRID=4326;POINT(-118.2437 34.0522)") == (34.0522, -118.2437)
    assert parse_point("point ( -118.2437   34.0522 )") == (34.0522, -118.2437)


@pytest.mark.parametrize(
    "value",
    [
        None,
        "",
        "zz",
        "0101000020E6100000",  # too short
        "0102000020E61000004182E2C7988F5DC0F46C567DAE064140",  # a linestring, not a point
        {"coordinates": [0, 95]},
        {"coordinates": [181, 0]},
        {"coordinates": ["1", "2"]},
        {"coordinates": [True, False]},
        {"coordinates": [float("nan"), 0]},
        {"coordinates": [1]},
        {},
        '{"type": "Point", "coordinates": [1, 2]}',
        "POINT(1.2.3 4)",
        42,
    ],
)
def test_parse_point_invalid(value: object) -> None:
    assert parse_point(value) is None


# Endpoint


def test_quote_example(client: TestClient) -> None:
    db = sign_in_with(provider_row())
    response = client.get(URL, params=SANTA_BARBARA)
    assert response.status_code == 200, response.text
    assert response.json() == {
        "provider_id": PROVIDER_ID,
        "distance_km": 139.85,
        "service_radius_km": 40,
        "billable_km": 99.85,
        "travel_fee_per_km_cents": 150,
        "travel_fee_cents": 14977,
    }
    assert db.calls.count("execute") == 1


def test_quote_inside_radius_is_free(client: TestClient) -> None:
    sign_in_with(provider_row(service_radius_km=200))
    response = client.get(URL, params=SANTA_BARBARA)
    assert response.status_code == 200, response.text
    assert response.json()["billable_km"] == 0
    assert response.json()["travel_fee_cents"] == 0


def test_quote_requires_sign_in(client: TestClient) -> None:
    response = client.get(URL, params=SANTA_BARBARA)
    assert response.status_code == 401


def test_quote_unknown_provider(client: TestClient) -> None:
    sign_in_with(None)
    response = client.get(URL, params=SANTA_BARBARA)
    assert response.status_code == 404
    assert response.json()["detail"] == "Provider not found"


@pytest.mark.parametrize("base_location", [None, "garbage"])
def test_quote_without_base_location(client: TestClient, base_location: object) -> None:
    sign_in_with(provider_row(base_location=base_location))
    response = client.get(URL, params=SANTA_BARBARA)
    assert response.status_code == 422
    assert response.json()["detail"] == "Provider has no base location set"


@pytest.mark.parametrize(
    "params",
    [
        {"lat": 91, "lng": 1},
        {"lat": -91, "lng": 1},
        {"lat": 1, "lng": 181},
        {"lat": 1},
        {"lng": 1},
    ],
)
def test_quote_rejects_bad_coordinates(client: TestClient, params: dict[str, float]) -> None:
    sign_in_with(provider_row())
    response = client.get(URL, params=params)
    assert response.status_code == 422


def test_quote_rejects_bad_provider_id(client: TestClient) -> None:
    sign_in_with(provider_row())
    response = client.get("/providers/not-a-uuid/travel-quote", params=SANTA_BARBARA)
    assert response.status_code == 422
