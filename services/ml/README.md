# ML service (SigLIP)

Turns every portfolio photo into:
- an **embedding**: 768 numbers describing how the photo *looks* (similar style = similar numbers), stored in `photo_embeddings` (pgvector);
- a few **auto-tags** such as `moody`, `golden hour`, `black and white`, `wedding`, stored in `photos.auto_tags`.

Model: [`google/siglip-base-patch16-224`](https://huggingface.co/google/siglip-base-patch16-224), open weights, runs locally. No API key and no per-photo fee.

## How it fits

```
photographer posts ─► Supabase Storage + photos table
                                │
        ML worker (this service) │ finds photos without an embedding
          downloads each photo ──┤ SigLIP: embedding + auto-tags
                                ▼
          ml_save_photo_analysis()  ──►  photo_embeddings, photos.auto_tags

user swipes in Discover ─► swipes table
Discover asks for cards ─► discover_feed()  (SQL in Postgres, no Python involved)
                           taste = average of liked photos, nudged away from passes;
                           ranks unseen photos by similarity + ~15% "something new"
```

**This service is only needed when new photos arrive.** The feed itself runs inside the
database, so if this service is down, Discover keeps working; new photos just appear
there a little later.

## Run it on your machine

```bash
cd services/ml
python -m venv .venv
.venv\Scripts\activate                       # macOS/Linux: source .venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
cp .env.example .env                          # then fill in the values
```

`.env` needs the **service role key** (Supabase → Project Settings → API Keys). It has full
database access: it stays in `services/ml/.env` (git-ignored) or your host's secret
settings, never in the frontend or in Git.

| Command | What it does |
|---|---|
| `python -m app.worker --once` | Analyse every waiting photo, then exit |
| `python -m app.worker` | Keep running; check for new photos every 30 s |
| `uvicorn app.main:app --port 8000` | HTTP API (`/health`, `/analyze`, `/process-pending`, `/embed-text`) |
| `python scripts/try_images.py <folder> --query "moody wedding"` | Try the model on local photos (no database needed) |
| `python -m pytest tests` | Fast tests (no model download) |

The first run downloads the model (~800 MB) into the Hugging Face cache. On a normal CPU
a photo takes a fraction of a second. A GPU isn't needed; to use one, install a CUDA
build of PyTorch instead.

## Running it for real (later)

Supabase can't run PyTorch models, so this needs a small place to run Python. Options,
cheapest first at low volume:

| Option | How it's triggered | Rough cost |
|---|---|---|
| **Your laptop** (now) | Run `python -m app.worker --once` after posting | Free |
| **Modal** (serverless, scales to zero) | Supabase database webhook on new `photos` rows calls `POST /process-pending` | Pay per second of use; free monthly credits cover early usage |
| **Railway / Fly.io / Render** (small always-on container, `Dockerfile` included) | Run `python -m app.worker` (polls every 30 s) | About $5–20/month (needs ~2 GB RAM) |
| **Google Cloud Run** | Webhook → `POST /process-pending`, scales to zero | Pay per request |

For an always-on host, run the worker. For a serverless one, run the API and point a
Supabase **Database Webhook** (Database → Webhooks → on insert into `photos`) at
`/process-pending` with the `X-ML-Secret` header.

## Tuning

- **Tags:** the vocabulary and thresholds are in `app/tags.py`. Re-check with `scripts/try_images.py` after edits.
- **Black & white** is detected from pixel saturation (`is_black_and_white` in `app/siglip.py`), not by the model.
- **Changing the model:** the embedding size must stay 768, or the `photo_embeddings.embedding` column must change too. Re-analyse everything afterwards: `delete from photo_embeddings;` then run the worker.

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
