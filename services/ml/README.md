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
                           taste = up to 3 groups of recent likes (centred SigLIP space),
                           pushed away from passes; ranks unseen photos by best match
                           + ~15% "something new" (details: Tuning, eval/REPORT.md)
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
| `python -m app.worker --retag` | Re-analyse every photo (after changing `app/tags.py`), then exit |
| `uvicorn app.main:app --port 8000` | HTTP API (`/health`, `/analyze`, `/process-pending`, `/embed-text`) |
| `python scripts/try_images.py <folder> --query "moody wedding"` | Try the model on local photos (no database needed) |
| `python -m pytest tests` | Fast tests (no model download) |
| `python eval/simulate.py <folder>` | Offline evaluation of the Discover feed (see Tuning) |

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

Everything here is measured with the offline evaluation in `eval/`: 632 hand-checked Creative
Commons photos in 19 style/content groups, and simulated users swiping through the feed.
Results and what each change is worth: `eval/REPORT.md`. The photos are downloaded outside the
repo; only `eval/manifest.csv` is committed.

```bash
W=<folder outside the repo>
.venv/Scripts/python -I eval/dataset.py fetch $W     # download the labeled photos (~35 MB)
.venv/Scripts/python -I eval/embed.py $W             # embed them (cached)
.venv/Scripts/python -I eval/simulate.py $W --algos oracle,v1,v2   # how fast the feed learns a taste
.venv/Scripts/python -I eval/tune.py $W --set ablation             # compare ranking variants
.venv/Scripts/python -I eval/tags_eval.py $W         # auto-tag precision / recall
```

- **Feed ranking (v2, `supabase/migrations/20261012000100_feed_v2.sql`).** Its knobs are
  constants at the top of `taste_profile()` and `discover_feed()`, mirrored by `V2_DEFAULTS`
  in `eval/feeds.py`:

  | Knob | Value | What it does |
  |---|---|---|
  | Centring | on | Every similarity uses embedding minus the catalog average. SigLIP vectors share a big common part; without centring everything looks ~0.6 similar. |
  | Learning starts | first like | With passes only, the feed steers away from them. |
  | Half-life | 40 swipes | How fast old swipes fade. |
  | Save weight | 2 | A save counts as two likes. |
  | Pass weight (gamma) | 0.5 | How hard each taste is pushed away from passes. |
  | Tastes | up to 3 | A like joins a taste at centred cosine >= 0.35. |
  | Stale rule | 2:1 | A taste is dropped when nearby passes outweigh its likes 2:1. |
  | Category scope | on | With a category filter, the taste comes from that category's likes. |
  | Photographer penalty | 0.03 | Per extra album from the same photographer. |
  | Exploration | 15% | Share of cards picked at random from lower down. |
  | Cold start | 200 newest | With no swipes, farthest-point picks among the 200 newest albums. |

  If you change the SQL, change `FeedV2` too. Then run the parity check in `eval/sql/`: it
  replays the Python scenarios against the SQL in PGlite.
- **Tags:** the vocabulary and thresholds are in `app/tags.py`. Each group is a softmax over
  its tags plus a neutral option (`_daylight`, `_indoor`, `_other`...) that absorbs ordinary
  photos. The `event` group covers event scenes and details that wedding and event
  photographers shoot: plated dish, buffet, cake, cocktails, floral arrangement, table setting,
  event venue, dance floor, live music, kids party, ceremony.
  - After editing, re-check with `eval/tags_eval.py`. To compare with an older copy, pass
    `--tags-file`.
  - Then push the new tags to existing photos with `python -m app.worker --retag`. It updates
    rows in place; the feed keeps working.
- **Black & white** is detected from pixel saturation (`is_black_and_white` in `app/siglip.py`), not by the model.
- **Changing the model:** the embedding size must stay 768, or the `photo_embeddings.embedding` column must change too.
  - Measured options:
    - `google/siglip2-base-patch16-224` is a 768-d drop-in with small, mixed gains.
    - `siglip-so400m` is 1152-d and 5x slower on CPU, no better.
    - Neither is worth switching to yet.
  - After a switch, re-analyse everything (`delete from photo_embeddings;`, then run the
    worker).

## AI planner (archived)

The AI event planner (`POST /plan`, `app/planner/`) belonged to the multi-vendor event platform and was
archived when the product went back to photography only. Its code, tests, settings and docs are in
`archive/event-platform/services/ml-planner/` (see `archive/event-platform/README.md` for how to restore it).
