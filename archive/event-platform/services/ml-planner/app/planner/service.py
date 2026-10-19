"""POST /plan: understand the message, split the budget, find real vendors."""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from typing import Callable, Optional

from .brief import fmt_dates, money, parse_iso
from .budget import split_budget
from .claude import ClaudeEngine
from .geocode import Geocoder
from .rules import understand as rules_understand
from .schema import Brief, PlanRequest, Understanding
from .vocab import GUEST_EVENT_TYPES, category_label, is_bookable, vendor_noun

log = logging.getLogger(__name__)

# Bookable category -> finder(brief, category budget in cents) -> options.
# finders.build_finders() makes one for every vertical.
Finder = Callable[[Brief, Optional[int]], list[dict]]
MAX_PARALLEL_SEARCHES = 6

EVENT_PHRASES = {
    "wedding": "a wedding", "graduation": "graduation photos", "portrait": "a portrait session",
    "event": "an event", "headshots": "headshots", "real-estate": "a real estate shoot",
    "product": "a product shoot", "other": "a photo shoot",
    "birthday": "a birthday party", "engagement": "a proposal", "corporate": "a corporate event",
    "baby-shower": "a baby shower", "quinceanera": "a quinceañera", "dinner-party": "a dinner party",
    "bachelor": "a bachelor/ette party", "holiday-party": "a holiday party",
}


class Planner:
    def __init__(self, finders: dict[str, Finder], geocode: Geocoder, claude: Optional[ClaudeEngine] = None):
        self.finders = finders
        self.geocode = geocode
        self.claude = claude

    @property
    def claude_enabled(self) -> bool:
        return self.claude is not None

    def understand(self, req: PlanRequest, today: date) -> Understanding:
        if self.claude is not None:
            try:
                return self.claude.understand(req.message, today, req.previous, req.history, self.geocode)
            except Exception as e:  # network, refusal, invalid output...: the rules engine takes over
                status = getattr(e, "status_code", None)
                log.warning("Claude planner failed (%s%s); using rules engine",
                            type(e).__name__, f" {status}" if status else "")
        return rules_understand(req.message, today, req.previous, self.geocode)

    def plan(self, req: PlanRequest) -> dict:
        today = parse_iso(req.today) or date.today()
        u = self.understand(req, today)
        brief = u.brief

        budget = split_budget(brief.budget_total_cents, brief.event_type, brief.services_needed)
        share = {row["category"]: row["cents"] for row in budget}

        # One search per needed category, run in parallel (a wedding needs about 12).
        searchable = [c for c in brief.services_needed if is_bookable(c) and self.finders.get(c) is not None]

        def search(category: str) -> tuple[list[dict], bool]:
            try:
                return self.finders[category](brief, share.get(category)), False
            except Exception as e:
                log.warning("Vendor search failed for %s (%s)", category, type(e).__name__)
                return [], True

        if len(searchable) > 1:
            with ThreadPoolExecutor(max_workers=min(MAX_PARALLEL_SEARCHES, len(searchable))) as pool:
                results = list(pool.map(search, searchable))
        else:
            results = [search(c) for c in searchable]
        recommendations, search_failed = [], any(failed for _, failed in results)
        for category, (options, _) in zip(searchable, results):
            recommendations.append({"category": category, "label": category_label(category),
                                    "budget_cents": share.get(category), "options": options})
        coming_soon = [{"category": c, "label": category_label(c)}
                       for c in brief.services_needed if not (is_bookable(c) and c in self.finders)]

        reply = u.reply or compose_reply(brief, share, recommendations, coming_soon)
        if search_failed:
            reply += " (I couldn't search for vendors just now; please try again in a moment.)"
        return {
            "engine": u.engine,
            "reply": reply,
            "brief": brief.model_dump(),
            "questions": u.questions,
            "budget": budget,
            "recommendations": recommendations,
            "coming_soon": coming_soon,
        }


def compose_reply(brief: Brief, share: dict[str, int], recommendations: list[dict], coming_soon: list[dict]) -> str:
    """The rules engine's short summary: what I understood + what's next."""
    days = [d for d in (parse_iso(x) for x in brief.dates) if d]
    what = EVENT_PHRASES.get(brief.event_type, "a photo shoot")
    if brief.location_text:
        place = brief.location_text.split(",")[0]
        what += f" {'at' if brief.title.endswith(' at ' + place) else 'in'} {place}"
    if days:
        what += f" on {fmt_dates(days)}"
    extras = []
    if brief.guest_count:
        extras.append(f"about {brief.guest_count} {'guests' if brief.event_type in GUEST_EVENT_TYPES else 'people'}")
    if brief.budget_total_cents:
        extras.append(f"a {money(brief.budget_total_cents)} budget")
    parts = [f"Here's a first plan for {what}" + (f" ({', '.join(extras)})" if extras else "") + "."]

    for rec in recommendations:
        n = len(rec["options"])
        noun, nouns = vendor_noun(rec["category"]), vendor_noun(rec["category"], plural=True)
        if n:
            found = f"found {n} {noun if n == 1 else nouns}"
            if days:
                found += " free on " + ("that day" if len(days) == 1 else "those dates")
            set_aside = f"I set aside {money(rec['budget_cents'])} for {rec['label'].lower()} and " \
                if rec.get("budget_cents") and len(share) > 1 else "I "
            parts.append(f"{set_aside}{found}, best matches first.")
        elif days:
            parts.append(f"No {nouns} are free on those dates yet. Nearby dates might work.")
        else:
            parts.append(f"I couldn't find a matching {noun} yet.")

    if coming_soon:
        ranked = sorted(coming_soon, key=lambda c: -share.get(c["category"], 0))
        labels = [c["label"] for c in ranked]
        if len(labels) > 3:
            listed = f"{labels[0]}, {labels[1].lower()} and {len(labels) - 2} other categories"
        elif len(labels) > 1:
            listed = ", ".join([labels[0]] + [x.lower() for x in labels[1:-1]]) + f" and {labels[-1].lower()}"
        else:
            listed = labels[0]
        verb = "isn't" if len(labels) == 1 else "aren't"
        tail = ", so they're placeholders in the budget for now." if share else " yet."
        parts.append(f"{listed} {verb} bookable here{tail}")
    parts.append("Nothing is booked until you send a request.")
    return " ".join(parts)
