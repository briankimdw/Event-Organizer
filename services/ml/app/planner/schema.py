"""Request/response shapes for POST /plan (the contract the frontend codes against)."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

EventType = Literal["wedding", "graduation", "portrait", "event", "headshots", "real-estate", "product", "other"]


class LatLng(BaseModel):
    lat: float
    lng: float


class Brief(BaseModel):
    event_type: EventType = "other"
    title: str = "Photo shoot"
    start_date: Optional[str] = None  # YYYY-MM-DD
    end_date: Optional[str] = None
    dates: list[str] = Field(default_factory=list)  # every day of the event, max 14
    location_text: Optional[str] = None
    location: Optional[LatLng] = None
    budget_total_cents: Optional[int] = None
    guest_count: Optional[int] = None
    styles: list[str] = Field(default_factory=list)
    services_needed: list[str] = Field(default_factory=list)
    notes: Optional[str] = None


class Turn(BaseModel):
    role: Literal["user", "assistant"]
    text: str


class PlanRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    today: Optional[str] = None  # YYYY-MM-DD in the user's timezone; server date if missing
    previous: Optional[Brief] = None
    history: list[Turn] = Field(default_factory=list)


class Understanding(BaseModel):
    """What an engine produces before vendor search: the brief, a reply and questions."""
    engine: Literal["claude", "rules"]
    brief: Brief
    reply: Optional[str] = None  # None = the planner writes one after searching
    questions: list[str] = Field(default_factory=list)
