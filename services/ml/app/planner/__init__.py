"""AI event planner: free text -> event brief -> budget split -> real vendors.

The AI only drafts a plan; the user always reviews it and books through the normal
booking flow. Nothing here creates bookings.

Modules:
    vocab.py      event types, vendor categories, style words (one place to extend)
    budget.py     budget split per event type (easy to tune)
    rules.py      deterministic parser (no API key needed)
    claude.py     Claude structured extraction (used when an API key is configured)
    brief.py      shared clean-up of a brief (dates list, title, questions)
    geocode.py    place name -> lat/lng (known LA places, then Nominatim)
    search.py     find and score real providers in Supabase
    service.py    ties it together for POST /plan
"""
