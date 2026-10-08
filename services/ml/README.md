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
