"""AI planner: rules engine, budget split, and the Claude request shape (Claude is mocked; no API calls)."""
from datetime import date
from types import SimpleNamespace

import pytest

from app.planner.budget import split_budget
from app.planner.claude import FALLBACK_BETA, MODEL, ClaudeBrief, ClaudeEngine
from app.planner.geocode import known_only
from app.planner.rules import understand
from app.planner.schema import PlanRequest
from app.planner.service import Planner

TODAY = date(2026, 10, 9)  # a Friday


def brief_of(message, previous=None):
    return understand(message, TODAY, previous, known_only).brief


# ---- rules engine -------------------------------------------------------------
def test_wedding_with_everything():
    b = brief_of("I want to organize a wedding from June 14 to June 15 2027, budget $25k, in Malibu, "
                 "about 120 guests, candid golden-hour style")
    assert b.event_type == "wedding"
    assert b.dates == ["2027-06-14", "2027-06-15"]
    assert b.location_text.startswith("Malibu") and b.location is not None
    assert b.budget_total_cents == 2_500_000
    assert b.guest_count == 120
    assert set(b.styles) == {"candid", "golden hour"}
    assert "photography" in b.services_needed and "venue" in b.services_needed


@pytest.mark.parametrize("message, dates", [
    ("headshots in Koreatown on Oct 20", ["2026-10-20"]),
    ("birthday party on 11/14 in Pasadena", ["2026-11-14"]),
    ("engagement shoot next Saturday", ["2026-10-17"]),
    ("wedding June 14-15 2027", ["2027-06-14", "2027-06-15"]),
])
def test_dates(message, dates):
    assert brief_of(message).dates == dates


@pytest.mark.parametrize("message, cents", [
    ("budget $25k", 2_500_000),
    ("we have 25,000 dollars", 2_500_000),
    ("budget of 5000", 500_000),
    ("around $500 for photos", 50_000),
])
def test_budget(message, cents):
    assert brief_of("wedding in Malibu, " + message).budget_total_cents == cents


def test_month_only_asks_which_day():
    u = understand("grad photos at UCLA next May, budget $500", TODAY, None, known_only)
    assert u.brief.event_type == "graduation"
    assert u.brief.dates == []
    assert any("May" in q for q in u.questions)


def test_style_only_asks_for_date_and_place():
    u = understand("something moody and black and white", TODAY, None, known_only)
    assert set(u.brief.styles) == {"moody", "black and white"}
    assert len(u.questions) == 2


def test_follow_up_cheaper_and_july():
    first = brief_of("wedding from June 14 to June 15 2027, budget $25k, in Malibu")
    cheaper = brief_of("make it cheaper", previous=first)
    assert cheaper.budget_total_cents < first.budget_total_cents
    assert cheaper.dates == first.dates and cheaper.location_text == first.location_text
    july = brief_of("what about July instead", previous=first)
    assert july.dates == ["2027-07-14", "2027-07-15"]


# ---- budget split ---------------------------------------------------------------
def test_budget_split_sums_to_total_and_every_vertical_is_bookable():
    rows = split_budget(2_500_000, "wedding", ["photography", "venue", "catering", "florals"])
    assert sum(r["cents"] for r in rows) == 2_500_000
    assert all(r["bookable"] for r in rows)  # every vertical has a finder now (was: photography only)


def test_photo_only_event_gets_whole_budget():
    rows = split_budget(50_000, "graduation", ["photography"])
    assert rows[0]["category"] == "photography" and rows[0]["cents"] == 50_000


# ---- Claude engine (mocked) -------------------------------------------------------
class FakeMessages:
    def __init__(self, parsed):
        self.parsed = parsed
        self.kwargs = None

    def parse(self, **kwargs):
        self.kwargs = kwargs
        return SimpleNamespace(stop_reason="end_turn", parsed_output=self.parsed)


def fake_client(parsed):
    messages = FakeMessages(parsed)
    return SimpleNamespace(beta=SimpleNamespace(messages=messages)), messages


def test_claude_request_shape_and_conversion():
    parsed = ClaudeBrief(
        reply="A two-day wedding in Malibu.", event_type="wedding", title="Wedding in Malibu",
        start_date="2027-06-14", end_date="2027-06-15", location_text="Malibu, CA", budget_total_usd=25000,
        guest_count=120, styles=["candid"], services_needed=["photography", "venue"], notes=None, questions=[],
    )
    client, messages = fake_client(parsed)
    u = ClaudeEngine(client).understand("wedding in malibu...", TODAY, None, [], known_only)

    k = messages.kwargs
    assert k["model"] == MODEL == "claude-opus-5-5"
    assert k["output_format"] is ClaudeBrief
    assert k["output_config"] == {"effort": "low"}
    assert k["betas"] == [FALLBACK_BETA] and k["fallbacks"] == "default"
    assert "thinking" not in k  # no budget_tokens / disabled thinking on Opus 5.5
    assert k["messages"][-1]["role"] == "user"  # no assistant prefill
    assert "<today>2026-10-09" in k["messages"][0]["content"]

    assert u.engine == "claude"
    assert u.brief.dates == ["2027-06-14", "2027-06-15"]
    assert u.brief.budget_total_cents == 2_500_000


def test_planner_falls_back_to_rules_when_claude_fails():
    class Broken:
        def understand(self, *a, **k):
            raise RuntimeError("network down")

    planner = Planner(finders={"photography": lambda brief, budget: []}, geocode=known_only, claude=Broken())
    out = planner.plan(PlanRequest(message="headshots in Koreatown on Oct 20, budget $300", today="2026-10-09"))
    assert out["engine"] == "rules"
    assert out["brief"]["dates"] == ["2026-10-20"]
    assert out["recommendations"][0]["category"] == "photography"


# ---- package choice ----------------------------------------------------------------
from app.planner.search import choose_package  # noqa: E402


def test_wedding_never_gets_an_unrelated_package():
    pkgs = [{"id": "a", "name": "Listing Shoot", "service": "real-estate", "price_type": "fixed", "price_cents": 30000}]
    assert choose_package(pkgs, "wedding", 300000, 1, None, "wedding") == (None, None, 0.0)


def test_related_package_stands_in_at_half_match():
    pkgs = [{"id": "e", "name": "Event Coverage", "service": "event", "price_type": "hourly", "price_cents": 15000,
             "duration_minutes": 180},
            {"id": "r", "name": "Listing Shoot", "service": "real-estate", "price_type": "fixed", "price_cents": 30000}]
    pkg, total, match = choose_package(pkgs, "wedding", 300000, 1, None, "wedding")
    assert pkg["id"] == "e" and match == 0.5


def test_exact_package_preferred_and_fits_budget():
    pkgs = [{"id": "w1", "name": "Elopement", "service": "wedding", "price_type": "fixed", "price_cents": 120000},
            {"id": "w2", "name": "Full-Day Wedding", "service": "wedding", "price_type": "fixed", "price_cents": 450000},
            {"id": "e", "name": "Event Coverage", "service": "event", "price_type": "fixed", "price_cents": 50000}]
    pkg, total, match = choose_package(pkgs, "wedding", 300000, 1, None, "wedding")
    assert pkg["id"] == "w1" and match == 1.0 and total == 120000
