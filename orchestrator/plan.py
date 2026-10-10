"""Approved-plan parsing and validation. The orchestrator never invents a plan."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from pathlib import Path

REQUIRED_SECTIONS = (
    "objective",
    "scope",
    "acceptance criteria",
    "design constraints",
    "required tests",
)
_PLACEHOLDER = re.compile(r"^\s*(?:[-*]\s*)?(?:todo|tbd|\.\.\.|n/?a|<.*>)?\s*$", re.I)
_APPROVED = re.compile(r"^\s*\**status\**\s*:\s*\**approved\**\s*$", re.I | re.M)


class PlanError(ValueError):
    pass


@dataclass
class Plan:
    title: str
    text: str
    sha256: str
    sections: dict[str, str]
    allowed_paths: list[str] = field(default_factory=list)
    approvals: set[str] = field(default_factory=set)


def _bullets(body: str) -> list[str]:
    """First token of each bullet: '- `backend/api/**` (why)' -> 'backend/api/**'."""
    items = []
    for line in body.splitlines():
        m = re.match(r"^\s*[-*]\s+`?([^`\s]+)", line)
        if m:
            items.append(m.group(1))
    return items


def parse_plan(text: str) -> Plan:
    # HTML comments are guidance for the author, never part of the plan's content.
    visible = re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL)
    title_m = re.search(r"^#\s+(.+?)\s*$", visible, re.M)
    if not title_m or title_m.group(1).startswith("<"):
        raise PlanError("plan has no '# Title' heading (or still has the template placeholder)")
    if not _APPROVED.search(visible):
        raise PlanError(
            "plan is not approved: add a line 'Status: approved' once you have reviewed it"
        )

    sections: dict[str, str] = {}
    parts = re.split(r"^##\s+(.+?)\s*$", visible, flags=re.M)
    for name, body in zip(parts[1::2], parts[2::2], strict=True):
        sections[name.strip().lower()] = body.strip()

    problems = []
    for req in REQUIRED_SECTIONS:
        body = sections.get(req)
        if body is None:
            problems.append(f"missing section '## {req.title()}'")
        elif all(_PLACEHOLDER.match(line) for line in body.splitlines()):
            problems.append(f"section '## {req.title()}' is empty or a placeholder")
    if problems:
        raise PlanError("plan is incomplete: " + "; ".join(problems))

    return Plan(
        title=title_m.group(1),
        text=text,
        sha256=hashlib.sha256(text.encode()).hexdigest(),
        sections=sections,
        allowed_paths=_bullets(sections.get("allowed paths", "")),
        approvals={a.lower() for a in _bullets(sections.get("approvals", ""))},
    )


def load_plan(path: Path) -> Plan:
    if not path.is_file():
        raise PlanError(f"plan file not found: {path}")
    return parse_plan(path.read_text(encoding="utf-8"))


def slugify(title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    return slug[:40].rstrip("-") or "task"
