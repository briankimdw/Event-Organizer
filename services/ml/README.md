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
                           + ~15% "something new" (details: Tuning)
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
| `uvicorn app.main:app --port 8000` | HTTP API (`/health`, `/analyze`, `/process-pending`, `/embed-text`, AI photo tools `/ai/*`) |
| `python scripts/fetch_models.py` | Download the AI photo tool models (see "AI photo tools") |
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
The scripts print their results (`eval/report_tables.py` turns `simulate.py --out` JSON into
Markdown tables); no results report is committed. The photos are downloaded outside the
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

## AI photo tools

Firefly-style tools for the photo editor, running locally on CPU with open-source models through
[ONNX Runtime](https://onnxruntime.ai). API contract for the apps: [`docs/AI_TOOLS.md`](../../docs/AI_TOOLS.md).
Code: `app/ai/` (`router.py` endpoints, `tools.py` pre/post-processing, `models.py` model loading).

| Endpoint | Tool | Model |
|---|---|---|
| `GET /ai/capabilities` | which tools are installed, limits | |
| `POST /ai/remove-background` | photo → PNG cutout with alpha, or the mask | BiRefNet lite (1024×1024) |
| `POST /ai/erase` | photo + mask (white = remove) → filled-in JPEG/PNG | LaMa (big-lama, 512×512) |
| `POST /ai/upscale` | photo (≤ 1024 px) → ×2 / ×4 JPEG/PNG | Real-ESRGAN compact (`realesr-general-x4v3`) |

All need a signed-in user's Supabase access token (`Authorization: Bearer …`), checked with
Supabase Auth (`GET /auth/v1/user`, cached 60 s); the browser can call them from the web app's
origins (CORS: `localhost:5173` and `<LAN IP>:5173`).

### Setup

```bash
cd services/ml
pip install -r requirements.txt                 # adds onnxruntime (+ onnx, used only by the fetch script)
.venv/Scripts/python scripts/fetch_models.py    # ~440 MB into services/ml/models/ (git-ignored)
```

- `fetch_models.py` downloads from pinned URLs (fixed Hugging Face revisions, a GitHub release),
  checks each file's SHA-256 and deletes it on a mismatch. `--list` shows the models; `--only lama`
  fetches one.
- Real-ESRGAN ships only as PyTorch weights: the script loads them with
  `torch.load(weights_only=True)` (tensors only, no code) and exports `realesr-general-x4v3.onnx`.
- Restart the service afterwards. Without models the service starts normally and
  `/ai/capabilities` reports the tools as unavailable (`/ai/*` answer `503 tool_unavailable`).
- The Docker image fetches the models at build time (`--build-arg FETCH_AI_MODELS=0` to skip).

| File in `models/` | Size | Memory: loaded / peak during a request |
|---|---|---|
| `birefnet-lite.onnx` | 224 MB | ~330 MB / **~6 GB** (Swin transformer at 1024×1024) |
| `lama.onnx` | 208 MB | ~300 MB / ~0.6 GB |
| `realesr-general-x4v3.onnx` (+ the `.pth` it came from) | 5 MB | ~40 MB / ~0.6 GB (×4 of 1024×768) |

Plan for **8 GB RAM** on a host that runs all three (plus SigLIP, ~1 GB). ONNX Runtime's memory
arena is turned off so memory goes back down after each request (with it on, BiRefNet kept ~6 GB
and grew to ~12 GB after two requests). The per-tool lock keeps two background removals from
overlapping.

Models load in a background thread at startup (`AI_PRELOAD=1`); LaMa takes ~18 s and BiRefNet ~7 s
to load, so the first request right after a start may wait for that.

### Limits

| | Default | Env |
|---|---|---|
| Upload size, per file | 30 MB → `413 file_too_large` | `AI_MAX_UPLOAD_MB` |
| Decoded size | 50 MP → `413 too_many_pixels` | `AI_MAX_PIXELS` |
| Remove background / erase input | long edge shrunk to 2048 px (header `X-Input-Downscaled: true`) | `AI_MAX_EDGE` |
| Upscale input | long edge ≤ 1024 px, else `413 upscale_input_too_large` | `AI_UPSCALE_MAX_EDGE` |
| Rate limit | 30 requests per user per 10 min (in memory, per process) → `429` + `Retry-After` | `AI_RATE_LIMIT`, `AI_RATE_WINDOW_S` |
| Concurrency | 1 request per tool per process; others wait up to 60 s, then `503 busy` | `AI_QUEUE_TIMEOUT_S` |
| ONNX Runtime threads per model | all cores | `AI_ORT_THREADS` |

Requests are handled in a worker thread (decode → model → encode), so the event loop and the
other endpoints stay responsive.

### Timings

AMD Ryzen 7 7800X3D (8 cores), 32 GB RAM, Windows 11, CPU only, ONNX Runtime 1.31. A 12 MP
(4000×3000) JPEG through the full HTTP path (upload, decode, downscale, model, encode); median of
3 warm runs, range over two runs (the machine was also running other work):

| Request | Output | Time |
|---|---|---|
| remove-background, `cutout` | 2048×1536 PNG RGBA | 5.5–5.9 s |
| remove-background, `mask` | 2048×1536 PNG grey | 4.7–5.5 s |
| erase, small object (200 px) | 2048×1536 JPEG | 1.8–2.0 s |
| erase, a person (~⅓ of the frame) | 2048×1536 JPEG | 2.0–2.1 s |
| upscale ×2 (input 1024×768) | 2048×1536 JPEG | 4.8 s |
| upscale ×4 (input 1024×768) | 4096×3072 JPEG | 4.5–4.7 s |

The first request after a start also pays the model load if preloading hasn't finished (LaMa
~18 s, BiRefNet ~7 s). With less than ~6 GB free RAM, background removal starts swapping and takes
10–30 s.

BiRefNet at 1024×1024 is most of the background-removal time (~4.7 s); ×2 costs the same as ×4
because the model is ×4 and the result is shrunk with Lanczos (as Real-ESRGAN itself does).
To reproduce, call the endpoints with a 12 MP photo and read the `X-Processing-Ms` header.

### How each tool works

- **Remove background:** resize to 1024×1024, ImageNet normalisation, BiRefNet → sigmoid → soft
  mask resized back to the photo; the cutout is the photo with that mask as alpha.
- **Erase:** the mask (white = remove; transparency counts as keep) is resized to the photo. A crop
  around the painted area (2× its size, at least 512 px, for context) is resized to 512×512, the
  mask is grown 3 px there, LaMa fills it, and the result is blended back (softened edge; painted
  pixels always fully replaced). One crop covers all painted areas, so two far-apart areas share a
  larger, lower-resolution crop; very large areas come out soft.
- **Upscale:** Real-ESRGAN compact ×4 on the whole image (no tiling needed at ≤ 1024 px).

### Licenses (verified upstream, 2026-10-19)

Only permissive licenses (MIT / Apache-2.0 / BSD-3-Clause) for both code and weights. Full list
with versions and URLs: [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md).

| Component | Code | Weights |
|---|---|---|
| BiRefNet lite, ONNX export by onnx-community | MIT ([ZhengPeng7/BiRefNet](https://github.com/ZhengPeng7/BiRefNet/blob/main/LICENSE)) | MIT (model cards of `ZhengPeng7/BiRefNet_lite` and `onnx-community/BiRefNet_lite-ONNX`) |
| LaMa big-lama, ONNX port by Carve | Apache-2.0 ([advimman/lama](https://github.com/advimman/lama/blob/main/LICENSE), [Carve-Photos/lama](https://github.com/Carve-Photos/lama)) | Apache-2.0 (model cards of `Carve/LaMa-ONNX` and `smartywu/big-lama`; also redistributed by OpenCV Zoo under Apache-2.0) |
| Real-ESRGAN `realesr-general-x4v3` | BSD-3-Clause ([xinntao/Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN/blob/master/LICENSE)) | BSD-3-Clause (released with the repo, v0.2.5.0) |
| ONNX Runtime | MIT | |
| onnx (fetch script only) | Apache-2.0 | |

Not used, and why:
- **BRIA RMBG 1.4 / 2.0** (rembg's current default): weights need a paid agreement for commercial use.
- **rembg** itself (MIT): not needed; its BiRefNet pre/post-processing is a few lines here, and the
  package pulls in OpenCV, SciPy, scikit-image and numba.
- **IS-Net `isnet-general-use`** / **U²-Net**: code Apache-2.0, but the weights have no license of
  their own (only Google Drive links) and the DIS5K data has separate terms; BiRefNet's weights are
  explicitly MIT and better at edges.
- **RealESRGAN_x4plus / x2plus** (BSD-3, fine license): RRDB networks with ~14× the parameters of
  the compact model, most of them at full resolution, so far slower on CPU (not measured here);
  Real-ESRGAN describes the compact model as "a tiny small model (consume much fewer GPU memory and time)".

Note: the models were trained by their authors on public research datasets (Places365 for LaMa,
DIS5K/HRSOD etc. for BiRefNet, DF2K/OST for Real-ESRGAN). The weights' licenses above are what the
authors released them under; the datasets' own terms are not passed on to the weights by those
licenses.

## AI planner (archived)

The AI event planner (`POST /plan`, `app/planner/`) belonged to the multi-vendor event platform and was
archived when the product went back to photography only. Its code, tests, settings and docs are in
`archive/event-platform/services/ml-planner/` (see `archive/event-platform/README.md` for how to restore it).
