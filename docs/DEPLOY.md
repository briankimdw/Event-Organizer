# Deploying photomatch

| Piece | Host | URL |
|---|---|---|
| Web app (`frontend/`, includes Studio at `/studio/`) | Vercel, project `photomatch`, root directory `frontend` | the Vercel production domain |
| Database, auth, storage | Supabase project `ktjvbajrfrbwpndforcy` | `https://ktjvbajrfrbwpndforcy.supabase.co` |
| ML service (`services/ml`: Discover embeddings + AI photo tools) | Hugging Face Space (Docker, free CPU) | `https://<user>-photomatch-ml.hf.space` |
| Mobile app (`mobile/`) | Expo Go for now; points at the two URLs above | |

## Web app (Vercel)

Every push to `main` deploys automatically (Git integration). `frontend/vercel.json` sets the
build, sends every path except `/studio/...` to `index.html` (client-side routes), and caches
`/assets/*` forever (the file names are content hashes).

Environment variables (Project Settings > Environment Variables, Production + Preview):

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://ktjvbajrfrbwpndforcy.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | the publishable key (public; same as `frontend/.env.local`) |
| `VITE_ML_URL` | the Space URL, e.g. `https://<user>-photomatch-ml.hf.space` |

`VITE_*` values are baked in at build time: after changing one, redeploy.
Without `VITE_ML_URL` the site works and the AI tools say they aren't set up.

## ML service (Hugging Face Space)

```sh
cd services/ml
.venv/Scripts/pip install -U "huggingface_hub[cli]"   # if `hf` isn't there yet
hf auth login                                         # token with "write" access (huggingface.co/settings/tokens)
.venv/Scripts/python scripts/deploy_hf_space.py --origins https://<vercel-domain>
```

The script creates the public Space, copies the secrets from `services/ml/.env` into the Space's
secrets (the service role key never goes to Git or the browser), sets the variables, and uploads
the Docker build. The first build takes 10-15 minutes (PyTorch + ~1.3 GB of model weights).
Re-run the same command to deploy changes; add more origins comma-separated.

On the Space, `ML_WORKER_IN_API=1` runs the photo-analysis worker inside the API process, so new
photos get embeddings and tags without a second container. Check `GET /health` and
`GET /ai/capabilities`. Free Spaces sleep after 48 hours without traffic; the first request then
takes a minute or two while it wakes.

## Supabase settings (dashboard, once)

Authentication > URL Configuration:
- **Site URL**: the Vercel production domain.
- **Redirect URLs**: the Vercel domain with `/**`, `http://localhost:5173/**`, `exp://**`,
  `eventorganizer://**`.

If Google sign-in is on, the Google Cloud OAuth client's authorised redirect URI stays
`https://ktjvbajrfrbwpndforcy.supabase.co/auth/v1/callback` (unchanged by the deploy).

## Mobile

`mobile/.env` (git-ignored):

```
EXPO_PUBLIC_ML_URL=https://<user>-photomatch-ml.hf.space
EXPO_PUBLIC_STUDIO_URL=https://<vercel-domain>
```

Then `cd mobile && npx expo start --tunnel --clear`.

## Database changes not yet applied

- `supabase/migrations/20261020000000_photo_edits.sql` (saves editor recipes so posts can be
  re-edited). The app works without it.
- The photography-only cleanup, `supabase/demo/photography_only_setup.sql` and
  `frontend/scripts/delete-nonphoto-users.mjs`: see `docs/PHOTOGRAPHY_ONLY_RUNBOOK.md`. Until it
  runs, old non-photo listings stay in the database but the apps hide them.
