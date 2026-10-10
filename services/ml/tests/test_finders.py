"""Vertical-aware planner: catalog sync, budget splits per occasion, rules keywords,
package math (per person / per item / daily / hourly) and the generic vendor finder
(Supabase is faked; no network)."""
import re
from datetime import date
from pathlib import Path

import pytest

from app.planner.budget import SPLITS, split_budget
from app.planner.finders import VendorFinder, build_finders
from app.planner.finders.generic import PREFERRED_SERVICE, choose_vendor_package, price_package
from app.planner.geocode import known_only
from app.planner.rules import understand
from app.planner.schema import Brief, LatLng, PlanRequest
from app.planner.service import Planner
from app.planner.vocab import CATEGORIES, EVENT_TYPES, OCCASION_TYPES

TODAY = date(2026, 10, 9)
CATALOG = Path(__file__).resolve().parents[3] / "frontend" / "src" / "verticals" / "catalog.js"


def brief_of(message):
    return understand(message, TODAY, None, known_only).brief


# ---- catalog.js stays the source of truth -------------------------------------------
def _catalog():
    if not CATALOG.exists():
        pytest.skip("frontend/src/verticals/catalog.js not available")
    js = CATALOG.read_text(encoding="utf-8")
    verticals = re.findall(r"^\s{4}slug: '([a-z-]+)', name: '([^']*)'", js, re.M)
    services = {}
    for block in re.split(r"^\s{2}\{\n", js, flags=re.M)[1:]:
        m = re.search(r"slug: '([a-z-]+)'", block)
        services[m[1]] = re.findall(r"\{ slug: '([a-z-]+)', name:", block)
    occasions = {m[1]: [s.strip(" '") for s in m[2].split(",")]
                 for m in re.finditer(r"\{ slug: '([a-z-]+)', name: '[^']*', icon: '[^']*', tint: '[^']*',\s*"
                                      r"needs: \[([^\]]*)\]", js)}
    return verticals, services, occasions


def test_categories_match_catalog_verticals():
    verticals, _, _ = _catalog()
    assert len(verticals) == 18
    assert list(CATEGORIES) == [slug for slug, _ in verticals]
    assert [label for label, _ in CATEGORIES.values()] == [name for _, name in verticals]
    assert all(bookable for _, bookable in CATEGORIES.values())


def test_occasions_are_event_types_and_splits_use_their_needs():
    _, _, occasions = _catalog()
    assert len(occasions) == 10
    for slug, needs in occasions.items():
        assert slug in EVENT_TYPES
        assert set(SPLITS[slug]) == set(needs), slug
    assert set(OCCASION_TYPES) <= set(occasions)


def test_preferred_services_exist_in_their_vertical():
    _, services, _ = _catalog()
    for vertical, table in PREFERRED_SERVICE.items():
        for event_type, service in table.items():
            assert event_type == "*" or event_type in EVENT_TYPES
            assert service in services[vertical], (vertical, service)


# ---- budget splits -------------------------------------------------------------------
@pytest.mark.parametrize("event_type", EVENT_TYPES)
def test_budget_split_sums_to_total_for_every_event_type(event_type):
    rows = split_budget(1_234_500, event_type, [])
    assert sum(r["cents"] for r in rows) == 1_234_500
    assert all(r["category"] in CATEGORIES for r in rows)
    assert all(r["cents"] > 0 for r in rows)


# ---- rules engine: occasions and vendor words ------------------------------------------
@pytest.mark.parametrize("message, event_type", [
    ("my daughter's 7th birthday party", "birthday"),
    ("planning a proposal on the beach", "engagement"),
    ("company offsite for 40 people", "corporate"),
    ("baby shower in March", "baby-shower"),
    ("quinceañera for my niece", "quinceanera"),
    ("a dinner party at my place", "dinner-party"),
    ("bachelorette weekend in Palm Springs", "bachelor"),
    ("office holiday party", "holiday-party"),
    ("wedding in Malibu", "wedding"),
    ("engagement shoot at sunset", "portrait"),
])
def test_occasion_event_types(message, event_type):
    assert brief_of(message).event_type == event_type


def test_birthday_plan_needs_venue_catering_cakes_and_decor():
    b = brief_of("Plan my 30th birthday party on Nov 14 in Pasadena, 50 guests, $6k budget")
    assert b.event_type == "birthday"
    assert b.guest_count == 50
    assert {"venue", "catering", "cakes", "decor"} <= set(b.services_needed)


def test_specific_vendors_and_catering_for_80():
    b = brief_of("need a DJ and catering for 80 at my birthday on Nov 14")
    assert b.services_needed == ["catering", "music"]  # catalog order
    assert b.guest_count == 80


@pytest.mark.parametrize("message, category", [
    ("we need a florist", "florals"), ("a photo booth for the reception", "entertainment"),
    ("a party bus for the bachelorette", "transportation"), ("tables and chairs", "rentals"),
    ("a private chef", "private-chef"), ("someone to officiate", "officiant"), ("valet", "staffing"),
    ("a coffee cart", "bar"), ("balloons", "decor"), ("bridal glam", "hair-makeup"), ("a cake", "cakes"),
])
def test_vendor_keywords(message, category):
    assert category in brief_of(message).services_needed


def test_photo_booth_is_not_photography():
    assert "photography" not in brief_of("just a photo booth for my birthday").services_needed


# ---- package math -------------------------------------------------------------------
def pkg(**kw):
    base = {"id": "p", "name": "Pkg", "service": None, "price_type": "fixed", "price_cents": 10000,
            "duration_minutes": None, "min_quantity": None, "max_quantity": None, "attributes": {}}
    return {**base, **kw}


def test_per_person_is_price_times_guests():
    b = Brief(event_type="wedding", guest_count=80)
    total, qty, note = price_package(pkg(price_type="per_person", price_cents=6500, min_quantity=40), b, "catering", 1)
    assert (total, qty) == (520_000, 80)
    assert "x 80 guests" in note


def test_per_person_respects_the_minimum_and_maximum():
    small = Brief(event_type="birthday", guest_count=20)
    total, qty, _ = price_package(pkg(price_type="per_person", price_cents=6500, min_quantity=40), small, "catering", 1)
    assert (total, qty) == (260_000, 40)
    big = Brief(event_type="wedding", guest_count=500)
    assert price_package(pkg(price_type="per_person", price_cents=6500, max_quantity=300), big, "catering", 1) is None


def test_per_person_without_a_guest_count_uses_the_typical_one():
    total, qty, note = price_package(pkg(price_type="per_person", price_cents=2000), Brief(event_type="corporate"),
                                     "catering", 1)
    assert qty == 60 and total == 120_000 and "estimate" in note


def test_hair_and_makeup_counts_the_party_not_the_guests():
    b = Brief(event_type="wedding", guest_count=150)
    total, qty, _ = price_package(pkg(price_type="per_person", price_cents=15000), b, "hair-makeup", 1)
    assert (total, qty) == (90_000, 6)


def test_per_item_uses_units_per_guest():
    b = Brief(event_type="wedding", guest_count=100)
    centerpiece = pkg(price_type="per_item", price_cents=8500, min_quantity=5, attributes={"units_per_guest": 0.125})
    total, qty, _ = price_package(centerpiece, b, "florals", 2)  # items are bought once, not per day
    assert (total, qty) == (13 * 8500, 13)
    cake = pkg(price_type="per_item", price_cents=65000)
    assert price_package(cake, b, "cakes", 1)[:2] == (65000, 1)


def test_daily_and_hourly():
    b = Brief(event_type="birthday", guest_count=60, notes="5 hours of coverage.")
    assert price_package(pkg(price_type="daily", price_cents=350000, max_quantity=220), b, "venue", 2)[0] == 700_000
    assert price_package(pkg(price_type="daily", price_cents=350000, max_quantity=40), b, "venue", 1) is None
    total, _, note = price_package(pkg(price_type="hourly", price_cents=25000), b, "music", 1)
    assert total == 125_000 and "x 5 h" in note
    limo = pkg(price_type="hourly", price_cents=14500, attributes={"min_hours": 3})
    assert price_package(limo, Brief(event_type="wedding", notes="2 hours of coverage."), "transportation", 1)[0] == 43_500


def test_choose_prefers_the_service_then_fits_the_budget():
    pkgs = [pkg(id="buffet", service="buffet", price_type="per_person", price_cents=4500, min_quantity=40),
            pkg(id="plated", service="plated-dinner", price_type="per_person", price_cents=6500, min_quantity=40),
            pkg(id="plated2", service="plated-dinner", price_type="per_person", price_cents=9500, min_quantity=40)]
    b = Brief(event_type="wedding", guest_count=100)
    c = choose_vendor_package(pkgs, "plated-dinner", 700_000, 1, b, "catering")
    assert c.package["id"] == "plated" and c.match == 1.0 and c.total == 650_000
    c = choose_vendor_package(pkgs, "food-truck", None, 1, b, "catering")
    assert c.package["id"] == "buffet" and c.match < 1.0  # stand-in, cheapest


# ---- the generic finder end to end (fake Supabase) -------------------------------------
class FakeCatalog:
    """Two caterers and a venue near Pasadena."""
    PROVIDERS = {
        "c1": {"id": "c1", "display_name": "Golden Spoon", "city": "Boyle Heights", "service_radius_km": 60,
               "base_location": None, "rating_avg": 4.8, "rating_count": 5, "attributes": {"max_guests": 400}},
        "c2": {"id": "c2", "display_name": "Tiny Bites", "city": "Pasadena", "service_radius_km": 20,
               "base_location": None, "rating_avg": None, "rating_count": 0, "attributes": {"max_guests": 30}},
        "v1": {"id": "v1", "display_name": "Glasshouse", "city": "Arts District", "service_radius_km": 0,
               "base_location": None, "rating_avg": 5, "rating_count": 1, "attributes": {"capacity_standing": 220}},
    }
    VERTICAL = {"catering": ["c1", "c2"], "venue": ["v1"]}
    PACKAGES = [
        {"id": "k1", "provider_id": "c1", "name": "Plated Dinner", "service": "plated-dinner", "price_type": "per_person",
         "price_cents": 6500, "min_quantity": 40, "max_quantity": 300, "attributes": {}},
        {"id": "k2", "provider_id": "c2", "name": "Snack Boxes", "service": "drop-off-catering", "price_type": "per_person",
         "price_cents": 1500, "min_quantity": 10, "attributes": {}},
        {"id": "k3", "provider_id": "v1", "name": "Day Rental", "service": "party-space", "price_type": "daily",
         "price_cents": 350000, "max_quantity": 220, "attributes": {}},
    ]

    def __init__(self):
        self.calls = []

    def search_providers(self, dates, category):
        self.calls.append(category)
        ids = self.VERTICAL.get(category, [])
        return [{"provider_id": i, "free_dates": list(dates)} for i in ids]

    def providers(self, ids):
        return [self.PROVIDERS[i] for i in ids]

    def packages(self, ids):
        return [p for p in self.PACKAGES if p["provider_id"] in ids]

    def portfolio_embeddings(self, ids):
        return []


def test_vendor_finder_prices_per_person_and_skips_too_small_caterers():
    b = Brief(event_type="birthday", guest_count=80, dates=["2026-11-14"], location_text="Pasadena",
              location=LatLng(lat=34.1478, lng=-118.1445))
    options = VendorFinder(FakeCatalog(), vertical="catering")(b, 600_000)
    assert [o["provider_id"] for o in options] == ["c1"]  # Tiny Bites tops out at 30 guests
    o = options[0]
    assert o["price_cents"] == 520_000 and o["quantity"] == 80 and o["price_type"] == "per_person"
    assert o["fits_budget"] is True and o["free_on_all_dates"] is True
    assert any("catering budget" in r and "x 80 guests" in r for r in o["reasons"])


def test_planner_recommends_every_needed_vertical():
    catalog = FakeCatalog()
    planner = Planner(finders=build_finders(catalog), geocode=known_only)
    out = planner.plan(PlanRequest(message="Plan a birthday party on Nov 14 in Pasadena for 80 guests, $12k budget",
                                   today="2026-10-09"))
    cats = [r["category"] for r in out["recommendations"]]
    assert {"venue", "catering", "cakes", "decor"} <= set(cats)
    assert out["coming_soon"] == []
    by_cat = {r["category"]: r for r in out["recommendations"]}
    assert by_cat["venue"]["options"][0]["price_cents"] == 350_000
    assert "party-space" in catalog.calls  # birthday -> the venue's party-space service first
    assert "found 1 caterer" in out["reply"]
