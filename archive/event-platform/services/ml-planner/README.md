# AI event planner (archived)

Archived from `services/ml/` on 2026-10-18 when the product went back to photography only
(git tag `multi-vendor-snapshot`, commit c7028db, has it in place). Not built or tested any more.

| Here | Came from |
|---|---|
| `app/planner/` | `services/ml/app/planner/` |
| `app/main.py` | `services/ml/app/main.py` as it was, with the `/plan` and `/plan/health` routes and CORS |
| `app/config.py` | `services/ml/app/config.py` as it was, with the `PLANNER_*` settings |
| `tests/test_finders.py`, `tests/test_planner.py` | `services/ml/tests/` (test_finders reads `frontend/src/verticals/catalog.js`, now in `archive/event-platform/frontend/`) |
| `.env.example`, `requirements.txt` | as they were (the planner needs `anthropic>=1.13`) |

To restore: copy `app/planner/` and the two tests back into `services/ml/`, re-add the planner
block of `main.py` and `config.py` (diff them against the current files), add `anthropic` to
`requirements.txt`, and restore `frontend/src/verticals/catalog.js` for `test_finders.py`.

The original README section follows.

## AI planner (`POST /plan`)

Type "a wedding June 14–15 2027 in Malibu, $25k, 120 guests, candid style" and get back:
- what was understood (the **brief**)
- a budget split by vendor category
- real photographers who are free on those dates, travel there, fit the budget and match the style.

It never books anything; the app links to the normal booking form. Code: `app/planner/`.

**How it works**
1. **Understand.** With an Anthropic API key, Claude (`claude-opus-5-5`, low effort, structured output) reads the message. Without a key, or if the call fails, a built-in rules parser does (`rules.py`). It handles dates like "June 14–15", "6/14", "next Saturday" and "next May"; budgets like "$25k" and "5,000 dollars"; guest counts; LA places, with OpenStreetMap lookups for others; and style words. Follow-ups ("make it cheaper", "what about July instead") edit the previous brief.
2. **Budget.** `budget.py` splits the total by event type (e.g. a wedding is venue ~33%, catering ~27%, photography ~12%, …). Only photography is bookable today; the rest are "coming soon" placeholders.
3. **Find photographers.** `search.py`:
   - `search_providers()` for free dates
   - package choice: exact service, else a related one, never an unrelated one
   - distance vs. service radius
   - style match: SigLIP text embedding vs. each portfolio's photo embeddings
   - rating.

   It returns at most 6 options per category, best first, each with plain-language reasons.

**Run it**
```
cd services/ml
.venv/Scripts/python -m pip install -r requirements.txt     # adds the anthropic SDK
.venv/Scripts/python -m uvicorn app.main:app --port 8000
```
The web app calls `VITE_ML_URL` (default `http://<page host>:8000`). Settings in `services/ml/.env`:

| Variable | Meaning |
|---|---|
| `ANTHROPIC_API_KEY` | Optional. Turns on the Claude engine; without it the rules engine runs. |
| `PLANNER_ENGINE` | `auto` (default) or `rules` (never call Claude). |
| `PLANNER_ALLOWED_ORIGINS` | Web app origins (default `http://localhost:5173`; LAN IPs on :5173 are also allowed). |
| `SUPABASE_ANON_KEY` | Optional; used to verify sign-in tokens. |
| `PLANNER_GEOCODER` | `nominatim` (default) or `off`. |
| `PLANNER_DEV_ALLOW_ANON` | **Dev only.** `1` lets `/plan` run without signing in. Never set it in production: anyone could spend your Claude credits. |

**API**
- `GET /plan/health` returns `{ ok, claude }`.
- `POST /plan` (header `Authorization: Bearer <Supabase access token>`) takes `{ message, today, previous, history }` and returns `{ engine, reply, brief, questions, budget, recommendations, coming_soon }`.
- The full shape is in `app/planner/schema.py` and `service.py`. Tests: `tests/test_planner.py` (Claude is mocked; no API calls).
