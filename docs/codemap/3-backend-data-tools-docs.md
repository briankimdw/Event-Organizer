## Backend, database, tools and docs

Covers everything outside `frontend/src/` and `mobile/`: the web app's config and scripts (`frontend/` minus `src/`), `supabase/`, `services/ml/`, `tools/`, `docs/` and the repo root files. Facts (who added a file, when, last change) come from `tools/codemap/codemap.json` (`node tools/codemap/scan.mjs > tools/codemap/codemap.json`); "Used by" was checked by grep, because SQL, docs and scripts have no imports. 168 tracked files are in scope.

### How the pieces connect

```
 web (frontend/, Vite :5173) ─┐                       ┌─► Supabase "Event Organizer" (ktjvbajrfrbwpndforcy)
 mobile (Expo, shares          ├─ supabase-js ─────────┤     Postgres 17 + RLS + RPCs, Auth, Storage, Realtime
   frontend/src/api via @shared)┘  (publishable key)    │     pg_cron jobs, pgvector
        │                                               │            ▲
        │  Bearer <Supabase access token>               │            │ service-role key (REST + /rpc/ml_*)
        └─► services/ml  (FastAPI :8000) ───────────────┘            │
              /ai/* tools (ONNX on CPU)       app.worker / POST /process-pending (SigLIP embeddings + auto-tags)
 backend/ (FastAPI :8001, gallery uploads, session denylist; not covered here)
```

- **Browser and app → Supabase directly.** There's no API server in between for normal data. Screens call `frontend/src/api/*.js` (the Expo app imports the same files through `@shared/api/...`), which query tables under Row-Level Security and call database functions (`supabase.rpc('…')`) for anything with rules: booking state changes, chats, the Discover feed. Keys: `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` in `frontend/.env.local`. The service-role key only lives in `services/ml/.env` (the admin scripts read it from there too).
- **`services/ml` has two jobs.**
  1. **SigLIP worker.** It finds photos without an embedding (`ml_pending_photos()`), downloads them from the `portfolio` bucket, and saves a 768-d embedding plus `photos.auto_tags` through `ml_save_photo_analysis()`. It runs as `python -m app.worker`, or as `POST /process-pending` with the `X-ML-Secret` header (for a database webhook). The Discover feed itself (`discover_feed()`, `provider_matches()`) runs in SQL, so Discover keeps working when the service is down.
  2. **AI photo tools**: `GET /ai/capabilities`, `POST /ai/remove-background|erase|upscale`. Callers: the web editor's AI tab (`frontend/src/components/editor/ai/AiPanel.jsx` → `frontend/src/api/ai.js`) and mobile (`mobile/src/screens/editor/ai/client.ts`, same `ai.js`). They need `Authorization: Bearer <Supabase access token>`, which `app/auth.py` checks against `/auth/v1/user` (cached 60 s). They're rate-limited to 30 requests per user per 10 min. The base URL is `VITE_ML_URL` (mobile: `EXPO_PUBLIC_ML_URL`), defaulting to port 8000 on the page's host. CORS allows `localhost:5173` and LAN IPs on `:5173`.
- **Migrations.** `supabase/migrations/*.sql` are the source of truth. They were applied to the hosted project with the Supabase MCP/`db push` or pasted into the SQL Editor. **Checked against the hosted project's migration list on 2026-10-20: 20 of 22 are applied, through `20261013000000_discover_all_verticals`.** Not applied yet:
  - **`20261018000000_photography_only`**: destructive; follow `docs/PHOTOGRAPHY_ONLY_RUNBOOK.md`.
  - **`20261020000000_photo_edits`**: the app detects the missing column and works without it.

  `supabase/pending/split_owner_policies.sql` is an optional extra that was declined. Two docs are behind on this: `docs/DATABASE.md` calls `feed_v2` "Written" (it's applied), and `docs/PROGRESS.md` still says share cards and all-verticals are "to apply" (they're applied).
- **Reference, demo and test data.**
  - `supabase/seed.sql`: categories and policies.
  - `frontend/scripts/seed-test-users.mjs`: 14 test accounts and 9 Photo & video listings from `docs/test-users.json`.
  - `supabase/demo/demo_data.sql`: packages, hours, bookings, reviews, chats.
  - `supabase/tests/*.sql`: tests you paste into the SQL Editor. They always roll back, and every line should end in `ok`.
  - `frontend/scripts/e2e/run.mjs`: end-to-end checks against the real database, signed in as the test users through the app's own `api/*.js`.
- **Scripts you run by hand** (all from `frontend/`):
  - `seed-test-users.mjs`
  - the photography-only trio: `backup-nonphoto.mjs` → paste `supabase/demo/photography_only_setup.sql` → `delete-nonphoto-users.mjs`
  - `scripts/e2e/run.mjs`

  Each one reads the service-role key from `services/ml/.env` (except e2e, which uses only the publishable key) and never prints it.
- **Studio build pipeline.** `node tools/studio/build.mjs` downloads miniPaint v4.14.3 at a pinned commit and checks its SHA-256. It installs the pinned build deps in a temp folder with `--ignore-scripts`, swaps the GPL AlertifyJS for an MIT shim, strips the upstream API keys and runs webpack with a licence gate. The output is committed to `frontend/public/studio/`, which `frontend/src/components/studio/Studio.jsx` loads in a same-origin iframe (`/studio/index.html`). It's web only: mobile has no Studio.

---

### Root files

#### `README.md`
**What:** Project front page. Covers photography-only status, a status table, the docs index, the "open decisions" table (`architecture.md` vs `docs/PLAN.md`), how to run the web app and the `backend/` note.
**Made:** 2026-10-08 · `f0866fc` "readme" (Timothy Phelps). **Last changed:** 2026-10-20 · `5f6655d` "Cleanup: remove dead code, unused deps and stale docs" (briankimdw).
**Used by:** humans; links to most docs below. Current.

#### `THIRD_PARTY_NOTICES.md`
**What:** Licences for third-party code shipped with the app. Covers the Studio bundle (`frontend/public/studio/`: miniPaint MIT plus bundled packages) and the AI tool models and code (`services/ml`, `/ai/*`: BiRefNet, LaMa, Real-ESRGAN/SRVGG).
**Made:** 2026-10-20 · `8b9994d` "Studio (miniPaint) and AI photo tools for web and mobile" (briankimdw). **Last changed:** same.
**Used by:** referenced from `docs/STUDIO.md`, `services/ml/README.md`, `services/ml/app/ai/srvgg.py`, `services/ml/scripts/fetch_models.py`, `tools/studio/webpack.config.cjs`. Update it whenever the Studio pin or a model changes.

#### `.gitignore`
**What:** Ignores `.env` and `.env.*` (except `.env.example`), `.idea/` at any depth, `.orchestrator/`, `__pycache__/`, `specs/`, the e2e outputs (`frontend/scripts/e2e/last-report.json`, `last-cleanup.sql`) and `archive/event-platform/data-backup/` (real user data).
**Made:** 2026-10-08 · `eb26ea1` "architecture and git ignore" (Timothy Phelps). **Last changed:** 2026-10-20 · `5f6655d` "Cleanup…" (briankimdw).
**Notes:** `frontend/.idea/` is now ignored but its 5 files are **still tracked**, because ignoring a path doesn't untrack it (`git rm -r --cached frontend/.idea` would).

#### `architecture.md`
**What:** Tim's original service-based backend design: ~8 FastAPI services, an event bus, the booking state machine, escrow, the media pipeline, recommendations, the AI planner and chat contact masking.
**Made:** 2026-10-08 · `eb26ea1` "architecture and git ignore" (Timothy Phelps). **Last changed:** never edited since.
**Used by:** referenced from `README.md` (open-decisions table), `docs/DATABASE.md`, `docs/PROGRESS.md`.
**Notes:** **Tim's document. Leave it to him.** It doesn't describe what was built: the build uses one Supabase project plus one ML service (see `docs/DATABASE.md` §1). The README lists where the two designs disagree.

---

### `frontend/` config, entry and tooling (not `src/`)

#### `frontend/package.json`
**What:** The web app manifest (`photographer-match-frontend`). Scripts: `dev`, `build`, `preview`. Dependencies: React 18, react-router-dom 6, `@supabase/supabase-js`, leaflet + react-leaflet, exifr, heic-to, lucide-react. Dev dependencies: Vite 5 and `@vitejs/plugin-react`. There is no test runner; tests use `node --test`.
**Made:** 2026-10-08 · `8367e87` "Add project plan and mobile React frontend prototype" (briankimdw). **Last changed:** 2026-10-19 · `2914c32` "Web: photo editor, easier posting, before & after slider" (briankimdw).
**Used by:** `npm install` / `frontend/start`. The admin and e2e scripts also resolve `@supabase/supabase-js` from here.

#### `frontend/package-lock.json`
**What:** npm lockfile for the above (1,906 lines).
**Made:** 2026-10-08 · `8367e87` (briankimdw). **Last changed:** 2026-10-19 · `2914c32` (briankimdw).
**Used by:** `frontend/start` reinstalls when this is newer than `node_modules/.package-lock.json`.

#### `frontend/vite.config.js`
**What:** Minimal Vite config (React plugin only). There are no aliases or proxy; the `@shared` alias is mobile-side.
**Made:** 2026-10-08 · `8367e87` (briankimdw). **Last changed:** unchanged.
**Used by:** `npm run dev|build|preview`.

#### `frontend/index.html`
**What:** The Vite HTML shell (`<title>PhotoMatch</title>`, `#root`, loads `/src/main.jsx`, `viewport-fit=cover`).
**Made:** 2026-10-08 · `8367e87` (briankimdw). **Last changed:** unchanged.
**Used by:** Vite entry.

#### `frontend/.env.example`
**What:** Template for `frontend/.env.local`:
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (publishable only)
- `VITE_ML_URL` (the ML service, default port 8000 on the page's host)
- `VITE_API_URL` (`backend/`, default port 8001)

**Made:** 2026-10-08 · `1fb7ec3` "Supabase database + auth setup (phases 0-2)" (briankimdw). **Last changed:** 2026-10-20 · `5f6655d` (briankimdw).
**Used by:** copied by hand. `frontend/start` refuses to run without `.env.local`, and `scripts/e2e/lib/env.mjs` reads `.env.local`.

#### `frontend/.gitignore`
**What:** `node_modules`, `dist`.
**Made:** 2026-10-08 · `8367e87` (briankimdw). **Last changed:** unchanged.

#### `frontend/start`
**What:** Bash launcher. It checks for `.env.local`, runs `npm install` when `node_modules` is missing or stale, then `npm run dev -- "$@"`. `bash ./start --host` also serves to the LAN.
**Made:** 2026-10-10 · `ee319d7` "orchestrator agent and start scripts for frontend and backend" (Timothy Phelps). **Last changed:** unchanged.
**Used by:** the README's run instructions. Its sibling `backend/start` is outside this section.

#### `frontend/.idea/` (5 files: `.gitignore`, `frontend.iml`, `misc.xml`, `modules.xml`, `vcs.xml`)
**What:** JetBrains (WebStorm/PyCharm) project settings: module definition, VCS root `$PROJECT_DIR$/..`, and IDE-local ignores.
**Made:** 2026-10-08 · `e495343` "pass for auth with supabase login / expiring a token on logout with denylist in db" (Timothy Phelps). **Last changed:** unchanged.
**Used by:** nothing in the build.
**Notes:** Committed by accident. The root `.gitignore` now ignores `.idea/`, but these stay tracked until someone runs `git rm --cached`.

### `frontend/public/studio/`: built Studio (miniPaint), generated

**Generated by `node tools/studio/build.mjs`. Don't edit by hand.** It's served as static files at `/studio/…`, and `frontend/src/components/studio/Studio.jsx` (`STUDIO_URL = BASE_URL + 'studio/index.html'`) opens it in an iframe. All files here were added in 2026-10-20 · `8b9994d` "Studio (miniPaint) and AI photo tools for web and mobile" (briankimdw) and never changed since.

#### `frontend/public/studio/index.html`
**What:** Our iframe page. Its layout markup is adapted from miniPaint's (MIT), and it loads `minipaint.js`.
**Used by:** `frontend/src/components/studio/Studio.jsx` (iframe `src`).

#### `frontend/public/studio/minipaint.js`
**What:** The minified webpack bundle (~1 MB, 2 lines): upstream miniPaint `src/` plus our bridge (`tools/studio/entry.js`, exposing `window.studioBridge`), with the AlertifyJS shim and theme CSS inlined.
**Used by:** `studio/index.html`. It loads only when Studio opens (`StudioLayer.jsx` is lazy).

#### `frontend/public/studio/minipaint.js.LICENSE.txt`
**What:** Licence banners that webpack extracted from the bundle.
**Used by:** referenced by the bundle's first line. Covered by `THIRD_PARTY_NOTICES.md`.

#### `frontend/public/studio/MINIPAINT-LICENSE.txt`
**What:** miniPaint's MIT licence (Copyright ViliusL), copied from upstream.
**Used by:** referenced from `studio/index.html` and `THIRD_PARTY_NOTICES.md`.

#### `frontend/public/studio/VERSION.json`
**What:** Build provenance: miniPaint `4.14.3`, commit `a79733eb…`, tarball URL, SHA-256, `builtAt`.
**Used by:** humans and reviewers. `build.mjs` writes it.

#### `frontend/public/studio/bundled-packages.json`
**What:** Name, version, licence and repo of every package inside the bundle. Written by `tools/studio/webpack.config.cjs` and used for the licence gate.
**Used by:** `THIRD_PARTY_NOTICES.md` (source of the list).

#### `frontend/public/studio/images/` (33 files)
**What:** miniPaint UI assets copied from upstream.
- **Root (2):** `logo.svg`, `logo-colors.png`.
- **`icons/` (31):** tool icons, mostly SVG: animation, arrow-down, blur, bold, brush, bulge_pinch, clone, crop, delete, desaturate, erase, fill, italic, magic_erase, media, menu, pencil, pick_color, refresh, select, selection, shape, sharpen, strikethrough, text, underline, undo, view. Plus PNGs: external, gradient, grid.

**Used by:** miniPaint CSS and markup inside the iframe.

#### `frontend/public/studio/src/js/libs/gifjs/gif.worker.js`
**What:** The gif.js Web Worker (minified, MIT). It's kept at the path miniPaint loads it from at runtime (animated GIF export).
**Used by:** `minipaint.js` (worker URL).

### `frontend/scripts/`: admin and seed scripts (Node, service role)

#### `frontend/scripts/lib/admin.mjs`
**What:** Shared helpers for the service-role scripts. It provides `ROOT`, `adminConfig()` (URL and service key from the environment or `services/ml/.env`, never printed), `adminClient()` and `must()`.
**Made:** 2026-10-19 · `80615b2` "Photography-only pivot: database cleanup, scripts, ML service, docs" (briankimdw). **Last changed:** unchanged.
**Used by:** `frontend/scripts/seed-test-users.mjs`, `backup-nonphoto.mjs`, `delete-nonphoto-users.mjs`.

#### `frontend/scripts/seed-test-users.mjs`
**What:** Creates the test accounts from `docs/test-users.json`: 9 photographers and creators with Photo & video listings, and 5 clients. It skips anything that already exists.
**Made:** 2026-10-08 · `7e398b0` "Add seed script for test users (reads private docs/private/test-users.json)" (briankimdw). **Last changed:** 2026-10-19 · `80615b2` (briankimdw).
**Used by:** run by hand: `cd frontend && node scripts/seed-test-users.mjs [--with-photos]` on a fresh environment, before `supabase/demo/demo_data.sql`. Runbook step 4; e2e prerequisite.
**Notes:** The commit subject mentions `docs/private/`. It now reads the public `docs/test-users.json`.

#### `frontend/scripts/backup-nonphoto.mjs`
**What:** Read-only export of everything the photography-only cleanup deletes: rows as JSON per table, Storage files and `manifest.json`. It writes to `archive/event-platform/data-backup/<timestamp>/`, which is git-ignored.
**Made:** 2026-10-19 · `80615b2` (briankimdw). **Last changed:** unchanged.
**Used by:** run by hand: `node scripts/backup-nonphoto.mjs --dry-run`, then without `--dry-run` (`--no-files`, `--out=<dir>`). Runbook step 1, **before** `photography_only_setup.sql`. The folder name goes into that file's guard.

#### `frontend/scripts/delete-nonphoto-users.mjs`
**What:** Deletes the 32 archived vendor test accounts (listed in `archive/event-platform/docs/test-users-vendors.json`): their Storage files, client bookings and auth user. Then it removes orphaned files named in the newest backup. It refuses to touch anyone in `docs/test-users.json`, or to run before the cleanup SQL.
**Made:** 2026-10-19 · `80615b2` (briankimdw). **Last changed:** unchanged.
**Used by:** run by hand: `node scripts/delete-nonphoto-users.mjs --dry-run`, then without (`--backup=<folder>`). Runbook step 3. **Pending**, like the migration.

### `frontend/scripts/e2e/`: real-database end-to-end test (19 files)

All added 2026-10-10 · `0fca74f` "Web: QA fixes, WCAG 2.2 AA accessibility pass, real-database e2e script" (briankimdw). Most were last changed 2026-10-19 · `80615b2` (pivot trims). It signs in as the test users from `docs/test-users.json` and runs the app's unmodified `frontend/src/api/*.js` under Node, using module hooks. It uses the **publishable key only**. It needs Node ≥ 22.15. Exit codes: 0 pass, 1 failure, 2 couldn't start.

#### `frontend/scripts/e2e/README.md`
**What:** How to run it, who plays whom (jordanlee, taylorb, kai.film, mayachen, sofia.wild), what each `--only` area covers, cleanup behaviour, and what was archived.
**Used by:** linked from the root `README.md`. Current (photography-only).

#### `frontend/scripts/e2e/run.mjs`
**What:** The entry point. It parses flags (`--dry-run`, `--only a,b`, `--verbose`, `--keep`, `--pause-for-payment`, `--realtime-timeout`), loads the shim, runs the sections, runs cleanup, prints a table and writes `last-report.json` (git-ignored).
**Last changed:** 2026-10-19 · `80615b2`.
**Used by:** `cd frontend && node scripts/e2e/run.mjs`. Imported by `test/helpers.test.mjs`.

#### `frontend/scripts/e2e/lib/env.mjs`
**What:** Reads `frontend/.env.local` (refuses a service-role-looking key) and the test logins. Provides email masking.
**Last changed:** 2026-10-10 · `0fca74f`.
**Used by:** `lib/context.mjs`, `run.mjs`, `sections/anon.mjs`, `sections/preflight.mjs`, `test/helpers.test.mjs`.

#### `frontend/scripts/e2e/lib/context.mjs`
**What:** Shared run state: `ROLES` (which test user plays which part), per-user clients, the app modules, the cleanup registry, the date allocator and anon fixtures.
**Last changed:** 2026-10-19 · `80615b2`.
**Used by:** `run.mjs`, `test/helpers.test.mjs`.

#### `frontend/scripts/e2e/lib/harness.mjs`
**What:** A dependency-free step runner: sections, pass/fail/skip, `expectReject` and the result table.
**Last changed:** 2026-10-10 · `0fca74f`.
**Used by:** `run.mjs`, `lib/context.mjs` and all 7 `sections/*.mjs`.

#### `frontend/scripts/e2e/lib/cleanup.mjs`
**What:** Registry of everything the test creates. It undoes it in a safe order (bookings → events → chats…), on exit, on failure or on Ctrl+C. It writes `last-cleanup.sql` for leftovers.
**Last changed:** 2026-10-19 · `80615b2`.
**Used by:** `run.mjs`, `test/helpers.test.mjs`.

#### `frontend/scripts/e2e/lib/shim.mjs`
**What:** Makes the browser-flavoured app modules importable from Node. It registers `hooks.mjs` and stubs `localStorage`, `sessionStorage`, `location` and similar.
**Last changed:** 2026-10-19 · `80615b2`.
**Used by:** `run.mjs`, `test/helpers.test.mjs`.

#### `frontend/scripts/e2e/lib/hooks.mjs`
**What:** Node module hooks. They rewrite `import.meta.env` in `frontend/src/**`, and they redirect `frontend/src/lib/supabase.js` to `supabase-shim.mjs`.
**Last changed:** 2026-10-10 · `0fca74f`.
**Used by:** `lib/shim.mjs`, `test/helpers.test.mjs`.

#### `frontend/scripts/e2e/lib/supabase-shim.mjs`
**What:** Stands in for the app's single Supabase client, so several users can be signed in at once (one client each).
**Last changed:** 2026-10-10 · `0fca74f`.
**Used by:** `lib/shim.mjs` (through the hooks).

#### `frontend/scripts/e2e/lib/pricing.mjs`
**What:** The expected booking totals and deposits, mirroring `request_booking()` (from `20261010000000_all_verticals.sql`) for every price type.
**Last changed:** 2026-10-10 · `0fca74f`.
**Used by:** `sections/bookings.mjs`, `test/helpers.test.mjs`.

#### `frontend/scripts/e2e/lib/jpeg.mjs`
**What:** Generates a tiny valid baseline JPEG in code (no image library) for posting tests.
**Last changed:** 2026-10-10 · `0fca74f`.
**Used by:** `sections/posting.mjs`, `test/helpers.test.mjs`.

#### `frontend/scripts/e2e/sections/anon.mjs`
**What:** Signed-out checks (also run in `--dry-run`):
- Photo & video is live
- `listProviders`
- `search_providers`
- `getProvider`
- reviews against the rating aggregates
- the anon Discover feed
- anon can't call the booking RPCs

**Last changed:** 2026-10-19 · `80615b2`. **Used by:** `run.mjs`.

#### `frontend/scripts/e2e/sections/preflight.mjs`
**What:** Checks that the role accounts, listings, the verified and unverified flags, `max_concurrent` and the fixed/hourly/quote packages exist. It runs before any signed-in area.
**Last changed:** 2026-10-19 · `80615b2`. **Used by:** `run.mjs`.

#### `frontend/scripts/e2e/sections/social.mjs`
**What:** Follow and unfollow, the shortlist, Discover swipes (like, pass, undo), the taste profile and `provider_matches`. These are the `social` and `discover` areas.
**Last changed:** 2026-10-10 · `0fca74f`. **Used by:** `run.mjs`.

#### `frontend/scripts/e2e/sections/bookings.mjs`
**What:** The `pricing`, `lifecycle` and `capacity` areas:
- request, counter, accept, decline and cancel bookings
- the unverified vendor can't accept
- no double-booking
- with `--pause-for-payment`: deliver → complete → double-blind reviews

**Last changed:** 2026-10-19 · `80615b2`. **Used by:** `run.mjs`.

#### `frontend/scripts/e2e/sections/messaging.mjs`
**What:** DMs, unread counts and `markRead`, Realtime delivery, groups (create, rename, add, leave), `searchPeople`, and share cards (`shareToChats`; the server fills `share_preview`).
**Last changed:** 2026-10-19 · `80615b2`. **Used by:** `run.mjs`.

#### `frontend/scripts/e2e/sections/posting.mjs`
**What:** Posts an album with `postAlbum` and the generated JPEG, then checks the public view and EXIF, editing, that other users are locked out, and that deleting removes both Storage files.
**Last changed:** 2026-10-19 · `80615b2`. **Used by:** `run.mjs`.

#### `frontend/scripts/e2e/sections/rls.mjs`
**What:** RLS probes from an outsider: other people's bookings, offers, DMs, read markers, events, listings, `provider_private`, swipes, the shortlist and Storage folders. They write existing values, so they're harmless.
**Last changed:** 2026-10-19 · `80615b2`. **Used by:** `run.mjs`.

#### `frontend/scripts/e2e/test/helpers.test.mjs`
**What:** Offline unit tests for the helpers: pricing, masking, the harness, cleanup ordering and JPEG output.
**Last changed:** 2026-10-19 · `80615b2`.
**Used by:** `cd frontend && node --test scripts/e2e/test/helpers.test.mjs`.

---

### `supabase/`: schema, seed, demo data, SQL tests

Every RPC listed under "called from" was found with `grep "rpc('name'"` in `frontend/src` and `mobile/src`. Mobile makes **no** direct `.rpc()` calls; it reaches them through `@shared/api/*.js`, so every `frontend/src/api` caller below serves both apps. **Hosted status was checked on 2026-10-20 with the project's migration list.** The first seven are recorded there as `0001_…` to `0007_…` but carry the same timestamps as the files.

#### `supabase/config.toml`
**What:** Supabase CLI config for a local stack (`project_id = "photographer-match"`, Postgres 17, API 54321, DB 54322, Studio 54323, seed `./seed.sql`, Realtime and Storage on). Tim set `jwt_expiry` from 3600 to 600 so the backend's session denylist rows expire quickly.
**Made:** 2026-10-08 · `1fb7ec3` "Supabase database + auth setup (phases 0-2)" (briankimdw). **Last changed:** 2026-10-08 · `e495343` "pass for auth with supabase login / expiring a token on logout with denylist in db" (Timothy Phelps).
**Used by:** `npx supabase …` (CLI). Nobody runs a local stack yet (no Docker; `docs/DATABASE.md` §7). The hosted project's auth settings are set in the dashboard, not here.

#### `supabase/.gitignore`
**What:** Ignores the CLI's `.branches`, `.temp`, `.env.keys`, `.env.local` and `.env.*.local`.
**Made:** 2026-10-08 · `1fb7ec3` (briankimdw). **Last changed:** unchanged.

#### `supabase/seed.sql`
**What:** Reference data, safe to re-run: the **Photo & video** vertical (slug `photography`) with its 14 services and JSON Schemas (provider and package fields, including the video fields), plus the Flexible, Moderate and Strict cancellation-policy templates. The slugs match `frontend/src/verticals/`.
**Made:** 2026-10-08 · `1fb7ec3` (briankimdw). **Last changed:** 2026-10-19 · `80615b2` "Photography-only pivot: database cleanup, scripts, ML service, docs" (briankimdw).
**Used by:** `supabase db reset` (local, automatically); on hosted, pasted into the SQL Editor. Concatenated into `supabase/demo/photography_only_setup.sql` (part 2).
**Notes:** The hosted DB still has the pre-pivot multi-vertical seed until the runbook runs. The old seed is at `archive/event-platform/supabase/seed_all_verticals.sql`.

#### `supabase/migrations/20261008171959_extensions_and_profiles.sql`
**What:** Phase 0.
- Extensions: postgis, citext, pg_jsonschema, pg_trgm, btree_gist, moddatetime.
- Shared enums (`price_type`, `provider_status`, …).
- Tables `profiles`, `admins`, `identity_verifications`.
- The `handle_new_user()` signup trigger (creates the profile) and `is_admin()`.

**Made:** 2026-10-08 · `1fb7ec3` (briankimdw). **Last changed:** unchanged.
**Used by:** **applied.** `profiles` is read by `frontend/src/auth.jsx`, `api/catalog.js`, `api/messages.js`, `screens/Me.jsx`, `mobile/src/state/auth.tsx` and others. Tests: `supabase/tests/smoke_test.sql`.

#### `supabase/migrations/20261008172117_categories_providers_packages.sql`
**What:** The category-agnostic core.
- Tables `service_categories` (with JSON Schemas), `providers`, `provider_private`, `provider_services`, `cancellation_policies`, `packages`, `package_addons`.
- Validation triggers `providers_check` and `packages_check` (`pg_jsonschema` against `category_schema()`).
- RPC `become_provider()`, helper `owns_provider()`.

**Made:** 2026-10-08 · `1fb7ec3` (briankimdw). **Last changed:** unchanged.
**Used by:** **applied.** `rpc('become_provider')` is called from `frontend/src/api/portfolio.js`. The tables are read by `api/catalog.js`, `api/provider.js`, `api/portfolio.js` and `api/locations.js`. Tests: `smoke_test.sql`.

#### `supabase/migrations/20261008172131_availability.sql`
**What:** Tables `availability_rules` (working hours per weekday) and `blackouts` (a `tstzrange` of blocked time), with RLS.
**Made:** 2026-10-08 · `1fb7ec3` (briankimdw). **Last changed:** unchanged.
**Used by:** **applied.** `frontend/src/api/provider.js` (hours, blocked days). Filled by `supabase/demo/demo_data.sql`. Read inside `search_providers()` and `is_provider_free()`.

#### `supabase/migrations/20261008172231_portfolio_and_storage.sql`
**What:** Portfolio and Storage.
- Tables `albums`, `photos` (EXIF, `authenticity`, `pair_role` for before/after), `tags`, `album_tags`.
- Helpers `can_view_album()` and `owns_album()`, the `albums_status_guard` trigger.
- Storage buckets `avatars` and `portfolio` (public), `portfolio-originals` and `raw-proofs` (private), each with owner-folder policies.

**Made:** 2026-10-08 · `1fb7ec3` (briankimdw). **Last changed:** unchanged.
**Used by:** **applied.** `frontend/src/api/portfolio.js`, `api/home.js`, `api/discover.js`, `api/edits.js`, `mobile/src/lib/beforeAfter.ts`. e2e: `sections/posting.mjs`.

#### `supabase/migrations/20261008172529_events_and_bookings.sql`
**What:** Bookings.
- Tables `events`, `event_members`, `bookings` (exclusion constraint against overlaps), `booking_addons`, `booking_offers`, `booking_events` (audit log).
- RPCs `request_booking`, `respond_to_booking`, `respond_to_offer`, `cancel_booking`, `mark_delivered`, `accept_delivery`, `search_providers`, `is_provider_free`.
- pg_cron jobs: `expire-booking-requests`, `start-booked-shoots`, `auto-complete-deliveries`.

**Made:** 2026-10-08 · `1fb7ec3` (briankimdw). **Last changed:** unchanged.
**Used by:** **applied.** `frontend/src/api/bookings.js` (every booking RPC) and `api/catalog.js` (`search_providers`). e2e: `sections/bookings.mjs`, `anon.mjs`, `rls.mjs`. Tests: `smoke_test.sql`. `request_booking` and `is_provider_free` were redefined by `20261010000000_all_verticals`.

#### `supabase/migrations/20261008172715_messaging_reviews_discovery.sql`
**What:** Messaging, reviews and Discover data.
- Tables `conversations`, `conversation_members`, `messages` (added to Realtime), `reviews` (double-blind, rating aggregates by trigger, `reveal-reviews` cron), `swipes`, `taste_corrections`, `saved_providers`, `collections`, `collection_items`, `follows`, `notifications`, `reports`, `blocks`.
- A booking-chat auto-create trigger.
- RPCs `start_inquiry` and `submit_review`.

**Made:** 2026-10-08 · `1fb7ec3` (briankimdw). **Last changed:** unchanged.
**Used by:** **applied.** `api/messages.js` (`start_inquiry`, chats), `api/bookings.js` (`submit_review`), `api/social.js`, `api/discover.js`, `components/PostSheets.jsx` and `mobile/src/screens/inbox/ModerationSheet.tsx` (reports, blocks).

#### `supabase/migrations/20261008173740_hardening.sql`
**What:** Fixes from the Supabase advisors. It revokes API `EXECUTE` on the trigger functions and adds 21 foreign-key indexes. The optional policy split was left in `supabase/pending/`.
**Made:** 2026-10-08 · `1fb7ec3` (briankimdw). **Last changed:** unchanged.
**Used by:** **applied.** No callers; it's DB hygiene.

#### `supabase/migrations/20261008213950_photo_embeddings_and_feed.sql`
**What:** ML data and the first feed.
- The pgvector extension and table `photo_embeddings` (server-only).
- Column `photos.auto_tags`.
- Service-role RPCs `ml_pending_photos` and `ml_save_photo_analysis`.
- `discover_feed()` v1.

**Made:** 2026-10-08 · `acda51d` "Discover ML: SigLIP embeddings, auto-tags and discover_feed" (briankimdw). (Tim's parallel branch `e495343` also added it.) **Last changed:** 2026-10-11 · `fe263db` "Discover feed v2 + offline evaluation; repair corrupted feed migration" (briankimdw).
**Used by:** **applied.** `services/ml/app/store.py` (`/rest/v1/rpc/ml_pending_photos`, `ml_save_photo_analysis`). `discover_feed` is called from `frontend/src/api/discover.js`. Tests: `supabase/tests/feed_test.sql`.

#### `supabase/migrations/20261008214116_discover_feed_soft_diversity.sql`
**What:** Replaces `discover_feed()`. The hard 2-albums-per-photographer cap becomes a soft score penalty, and slots are reserved for exploration.
**Made:** 2026-10-08 (in `acda51d` and Tim's `e495343`; the JSON credits `e495343`, Timothy Phelps). **Last changed:** unchanged.
**Used by:** **applied.** Superseded by `20261012000100_feed_v2` (which redefines `discover_feed`).

#### `supabase/migrations/20261008220000_revoked_sessions.sql`
**What:** Tim's session denylist. Table `revoked_sessions` (`session_id`, purged after token expiry), RPCs `revoke_my_session()` and `is_my_session_revoked()`.
**Made:** 2026-10-08 · `e495343` "pass for auth with supabase login / expiring a token on logout with denylist in db" (Timothy Phelps). **Last changed:** unchanged.
**Used by:** **applied.** `backend/api/auth.py` (`rpc('revoke_my_session')`), `backend/dependencies/auth.py`, `backend/core/sessions.py`. See `backend/AUTH.md`. The web app and mobile don't use it.

#### `supabase/migrations/20261009023242_provider_matches.sql`
**What:** RPC `provider_matches()`: a relative "% match" (~60–98) per photographer against the signed-in user's taste vector.
**Made:** 2026-10-08 · `9db1724` "Connect the frontend to Supabase; remove all mock data" (briankimdw). **Last changed:** unchanged.
**Used by:** **applied.** `rpc('provider_matches')` is called from `frontend/src/api/catalog.js`, whose results `api/discover.js` uses. Tests: `supabase/tests/matches_test.sql`. e2e: `sections/social.mjs`. Redefined by `feed_v2`.

#### `supabase/migrations/20261009023437_swipes_undo.sql`
**What:** One RLS policy that lets users delete their own swipes, for Discover undo.
**Made:** 2026-10-08 · `9db1724` (briankimdw). **Last changed:** unchanged.
**Used by:** **applied.** `frontend/src/api/discover.js` and `api/social.js` (`from('swipes').delete()`). e2e: `sections/social.mjs`.

#### `supabase/migrations/20261009120000_direct_and_group_messages.sql`
**What:** DMs, groups and blocks.
- RPCs `start_direct_message`, `create_group_chat`, `rename_group`, `add_group_members`, `leave_group`.
- `is_blocked_between()` and the `messages_block_check` trigger.
- Adds `conversation_members` to Realtime.

**Made:** 2026-10-09 · `682c20d` "Real messaging between people, photographer map, new posting flow" (briankimdw). **Last changed:** unchanged.
**Used by:** **applied.** All five RPCs are called from `frontend/src/api/messages.js`. Tests: `supabase/tests/messaging_test.sql`. e2e: `sections/messaging.mjs`.

#### `supabase/migrations/20261009120100_portfolio_owner_select.sql`
**What:** A Storage policy that lets owners `select` their own folder in `portfolio`. Without it, Storage deletes silently left files behind.
**Made:** 2026-10-09 · `682c20d` (briankimdw). **Last changed:** unchanged.
**Used by:** **applied.** Deleting a post or rolling back an upload in `frontend/src/api/portfolio.js`. e2e: `sections/posting.mjs`.

#### `supabase/migrations/20261010000000_all_verticals.sql`
**What:** Pricing, quantity and capacity for every vertical.
- Price types `per_person`, `per_item`, `daily`.
- Columns `packages.min_quantity` / `max_quantity` and `bookings.quantity`.
- Column `providers.max_concurrent` with slot capacity (`bookings_assign_slot` trigger).
- Redefines `request_booking` and `is_provider_free`. Re-runnable.

**Made:** 2026-10-10 · `1f99925` "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** unchanged.
**Used by:** **applied.** The core stays after the pivot. `api/bookings.js` (`request_booking`), `api/provider.js` (quantities). Mirrored by `frontend/scripts/e2e/lib/pricing.mjs`. Used by `supabase/demo/demo_data.sql`.

#### `supabase/migrations/20261011000000_share_cards.sql`
**What:** Share cards in chat.
- Columns `messages.shared_provider_id`, `shared_event_id` and `share_preview`.
- The `messages_share_preview` trigger fills a safe snapshot on the server and wipes any preview the client sets.

**Made:** 2026-10-10 · `b9b7a81` "Posting for every vertical, in-app sharing, events with friends, UI pass" (briankimdw). **Last changed:** unchanged.
**Used by:** **applied.** `frontend/src/api/messages.js` (`sendMessage`, `shareToChats`, `shareSupport`, `shareColumnsReady`). Tests: `supabase/tests/share_cards_test.sql`. e2e: `sections/messaging.mjs` (`sharing`).

#### `supabase/migrations/20261011000100_event_groups.sql`
**What:** Events with friends (archived feature).
- Tables `event_candidates` and `event_candidate_votes`.
- Event-chat sync triggers.
- RPCs `create_event_with_chat`, `invite_to_event`, `leave_event`, `post_event_note`, `add_event_candidate`, `set_event_candidate_status`, `event_bookings`, …

**Made:** 2026-10-10 · `b9b7a81` (briankimdw). **Last changed:** unchanged.
**Used by:** **applied, but dead code**: no caller in `frontend/src` or `mobile/src`. `20261018000000_photography_only` drops its tables and functions. A copy lives in `archive/event-platform/supabase/migrations/`.

#### `supabase/migrations/20261011000200_post_credits.sql`
**What:** Table `album_credits` (tag other vendors on a post) with the `album_credits_limit` trigger, plus seeded `occasion-*` tags (archived feature).
**Made:** 2026-10-10 · `b9b7a81` (briankimdw). **Last changed:** unchanged.
**Used by:** **applied, but dead code.** Only `frontend/scripts/backup-nonphoto.mjs` and `supabase/demo/photography_only_setup.sql` mention it. Dropped by `photography_only`.

#### `supabase/migrations/20261012000100_feed_v2.sql`
**What:** Discover feed v2.
- Helpers `taste_profile()` (up to 3 taste groups, centred SigLIP space), `vec_scale()` and `photo_in_category()`.
- Rewrites `discover_feed()` and `provider_matches()`.
- The knobs are constants at the top of the functions.

**Made:** 2026-10-11 · `fe263db` "Discover feed v2 + offline evaluation; repair corrupted feed migration" (briankimdw). **Last changed:** unchanged.
**Used by:** **applied** (`docs/DATABASE.md` saying "Written" is stale). `api/discover.js` and `api/catalog.js`. Mirrored by `services/ml/eval/feeds.py` (`V2_DEFAULTS`), checked by `eval/sql/parity.mjs` and `eval/sql/feed_v2_smoke.sql`, pinned by `services/ml/tests/test_feed_eval.py`.

#### `supabase/migrations/20261013000000_discover_all_verticals.sql`
**What:** Vendor-card Discover: `discover_vendors()` with the helpers `vendor_traits`, `discover_jaccard` and `discover_norm` (archived feature).
**Made:** 2026-10-12 · `c7028db` "Discover for every vertical (web + mobile), demo vendor portfolios" (briankimdw). **Last changed:** unchanged.
**Used by:** **applied**, and `frontend/src/api/discover.js` still calls `rpc('discover_vendors')`. Once `photography_only` drops it, that call falls back to the in-browser `rankVendors()` (`isMissingFn`), so nothing breaks.

#### `supabase/migrations/20261018000000_photography_only.sql`
**What:** **Destructive pivot. It's guarded and re-runnable.**
- Merges videography into the "Photo & video" vertical (schemas, 5 video services, listings).
- Drops `album_credits`, `event_candidates`, `event_candidate_votes`, the events-with-friends functions and triggers, and `discover_vendors()` with its helpers.
- Deletes the data of the other 16 verticals and every event.
- It refuses to run while non-photo data exists unless `photography_only.backup_done` is set.

**Made:** 2026-10-19 · `80615b2` "Photography-only pivot: database cleanup, scripts, ML service, docs" (briankimdw). **Last changed:** unchanged.
**Used by:** **pending (not applied).** Apply it by pasting `supabase/demo/photography_only_setup.sql`, which wraps this file with the guard, the seed and the `schema_migrations` record, after `backup-nonphoto.mjs`. See `docs/PHOTOGRAPHY_ONLY_RUNBOOK.md`.
**Notes:** Don't `npx supabase db push` before the runbook. Push would try this file without the guard set, and it would abort.

#### `supabase/migrations/20261020000000_photo_edits.sql`
**What:** Non-destructive editing support.
- Column `photos.edit_recipe jsonb`, with the check function `edit_recipe_ok()` (known keys, ranges, ≤ 4 KB).
- `insert` and `update` grants on that column for `authenticated`.
- The `photos_display_changed` trigger: when `display_path` changes, it deletes the photo's embedding (so the ML worker re-analyses it) and clears `phash`. Re-runnable.

**Made:** 2026-10-19 · `2914c32` "Web: photo editor, easier posting, before & after slider" (briankimdw). **Last changed:** unchanged.
**Used by:** **pending (not applied).** `docs/EDITOR.md` says so, and the hosted list confirms it. `frontend/src/api/edits.js` (`editRecipeSupported()` detects the missing column and saves without the recipe), `api/portfolio.js`, `components/editor/PhotoEditor.jsx`, `components/upload/editorBridge.jsx`, `ManagePost.jsx`, `mobile/src/screens/provider/upload/PostPhotos.tsx`. Tests: `supabase/tests/photo_edits_test.sql`.
**Notes:** There's no paste-ready wrapper. Paste the file itself (it's re-runnable), or `db push` once `photography_only` is recorded.

#### `supabase/pending/split_owner_policies.sql`
**What:** Optional performance tidy-up. It splits each owner `FOR ALL` policy into insert, update and delete policies, so they no longer overlap the public `SELECT` policies. Access stays the same.
**Made:** 2026-10-08 · `1fb7ec3` (briankimdw). **Last changed:** unchanged.
**Used by:** **not applied (declined 2026-10-08).** To use it, copy it into a new migration. Mentioned in `docs/DATABASE.md` §6 and `docs/PROGRESS.md`.

#### `supabase/demo/photography_only_setup.sql`
**What:** A paste-ready, single-transaction file:
- 0: the backup guard (replace `'no'` with the backup folder name)
- 1: the `20261018000000_photography_only` migration
- 2: `seed.sql`
- 3: the record in `supabase_migrations.schema_migrations`
- a final check row (every column `true`, `listings_left = 9`)

**Made:** 2026-10-19 · `80615b2` (briankimdw). **Last changed:** unchanged.
**Used by:** runbook step 2, in the SQL Editor. **Pending.** If you change the migration or the seed, update this file too.

#### `supabase/demo/demo_data.sql`
**What:** Demo data for the test users: packages, add-ons, gear, working hours, bookings in every state, double-blind reviews, chats, follows, a shortlist. Photography only. Looks rows up by username and slug, and is safe to re-run.
**Made:** 2026-10-08 · `9db1724` "Connect the frontend to Supabase; remove all mock data" (briankimdw). **Last changed:** 2026-10-19 · `80615b2` (briankimdw).
**Used by:** pasted into the SQL Editor after `seed-test-users.mjs` (runbook step 4; e2e prerequisite). The old all-verticals version is in `archive/event-platform/supabase/demo/`.

#### `supabase/demo/remove_demo_data.sql`
**What:** Undoes `demo_data.sql` (bookings with their reviews, chats and history, packages, hours, follows, the shortlist, and Brian's demo bookings). It keeps accounts, listings and albums. Run it before deleting test users.
**Made:** 2026-10-08 · `9db1724` (briankimdw). **Last changed:** 2026-10-19 · `80615b2` (briankimdw).
**Used by:** pasted by hand. Referenced in `docs/PHOTOGRAPHY_ONLY_RUNBOOK.md` and `docs/test-users.md`.

#### `supabase/tests/smoke_test.sql`
**What:** A 22-check test of the schema, auth rules and booking flow: RLS, the no-overlap rule, the RPCs and refunds. It's one `do $$` block that always rolls back by raising the results.
**Made:** 2026-10-08 · `1fb7ec3` (briankimdw). **Last changed:** unchanged.
**Used by:** pasted into the SQL Editor or run with MCP `execute_sql` after a schema change (`docs/DATABASE.md` §7, runbook step 5). Every line should end in `ok`.

#### `supabase/tests/feed_test.sql`
**What:** `discover_feed` with made-up embeddings: two styles, and a client who likes the warm one. Rolls back.
**Made:** 2026-10-08 · `acda51d` "Discover ML: SigLIP embeddings, auto-tags and discover_feed" (briankimdw). **Last changed:** unchanged.
**Used by:** pasted by hand. Covers `20261008213950_*`, `214116` and `feed_v2`.

#### `supabase/tests/matches_test.sql`
**What:** `provider_matches()` as `jordanlee`. It needs the demo photographers with analysed photos (run the SigLIP worker first). Rolls back.
**Made:** 2026-10-08 · `9db1724` (briankimdw). **Last changed:** unchanged.
**Used by:** pasted by hand.

#### `supabase/tests/messaging_test.sql`
**What:** DMs, group chats (create, rename, add, leave) and blocks. Rolls back.
**Made:** 2026-10-09 · `682c20d` (briankimdw). **Last changed:** unchanged.
**Used by:** pasted by hand. Covers `20261009120000_direct_and_group_messages`.

#### `supabase/tests/share_cards_test.sql`
**What:** Share cards: server-filled `share_preview`, client values wiped, event snapshot privacy. Rolls back.
**Made:** 2026-10-10 · `b9b7a81` (briankimdw). **Last changed:** unchanged.
**Used by:** pasted by hand. Covers `20261011000000_share_cards`.

#### `supabase/tests/photo_edits_test.sql`
**What:** 13 checks: recipe validation, column grants, and the stale-analysis reset when `display_path` changes. Rolls back.
**Made:** 2026-10-19 · `2914c32` (briankimdw). **Last changed:** unchanged.
**Used by:** pasted by hand **after** `20261020000000_photo_edits` is applied. It fails on the hosted DB until then.

---

### `services/ml/`: SigLIP worker and AI photo tools (Python, FastAPI)

Python 3.12, run from `services/ml`, with a git-ignored `.venv/`. Settings come from `services/ml/.env` (`app/config.py` loads only that file). Most of the service was added 2026-10-08 · `acda51d` "Discover ML: SigLIP embeddings, auto-tags and discover_feed" (briankimdw). The AI tools came 2026-10-20 · `8b9994d` "Studio (miniPaint) and AI photo tools for web and mobile" (briankimdw).

#### `services/ml/README.md`
**What:** Setup and commands for the service: hosting options (laptop, Modal, Railway/Fly/Render, Cloud Run, with a webhook to `/process-pending`), feed tuning (the v2 knobs and the eval commands), and the AI photo tools (models, licences, timings).
**Made:** 2026-10-08 · `acda51d` (briankimdw). **Last changed:** 2026-10-20 · `5f6655d` "Cleanup…" (briankimdw).
**Used by:** linked from the root `README.md`, `docs/AI_TOOLS.md`, `THIRD_PARTY_NOTICES.md`. Current.

#### `services/ml/.env.example`
**What:** The keys to set:
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server only), `ML_WEBHOOK_SECRET`
- optional: `SIGLIP_MODEL`, `ML_DEVICE`, `ML_BATCH_SIZE`, `SUPABASE_ANON_KEY`, `ML_ALLOWED_ORIGINS`
- the `AI_*` limits

**Made:** 2026-10-08 · `acda51d` (briankimdw). **Last changed:** 2026-10-20 · `8b9994d` (briankimdw).
**Used by:** copy it to `services/ml/.env`. That `.env` is **also** where `frontend/scripts/lib/admin.mjs` finds the service-role key.

#### `services/ml/.gitignore`
**What:** Ignores `.venv/`, `__pycache__/`, `*.pyc`, `.pytest_cache/`, `.env` and `models/` (the downloaded ONNX files).
**Made:** 2026-10-08 · `acda51d`. **Last changed:** 2026-10-20 · `8b9994d`.

#### `services/ml/requirements.txt`
**What:** transformers < 5, sentencepiece, protobuf, pillow, fastapi, uvicorn, python-multipart, httpx, python-dotenv and numpy, plus pinned `onnxruntime==1.31.0` and `onnx==1.23.2` (for the AI tools) and pytest. Install PyTorch first, separately (the CPU wheel).
**Made:** 2026-10-08 · `acda51d`. **Last changed:** 2026-10-20 · `8b9994d`.
**Used by:** `pip install -r requirements.txt`, `Dockerfile`.

#### `services/ml/Dockerfile`
**What:** CPU image (python:3.12-slim). It bakes in the SigLIP weights and runs `scripts/fetch_models.py` unless built with `--build-arg FETCH_AI_MODELS=0`. The default command is `uvicorn app.main:app --port 8000`; the alternative is `python -m app.worker`.
**Made:** 2026-10-08 · `acda51d`. **Last changed:** 2026-10-20 · `8b9994d`.
**Used by:** future hosting (not deployed yet; the README says "laptop (now)").

#### `services/ml/app/__init__.py`
**What:** Package marker (docstring only).
**Made:** 2026-10-08 · `acda51d`. **Last changed:** unchanged.
**Used by:** every `app.*` module.

#### `services/ml/app/config.py`
**What:** All settings from the environment:
- the model id (768-d, must match `photo_embeddings`) and device
- Supabase URL and keys, the portfolio bucket, the webhook secret, the batch size
- CORS origins plus a LAN regex
- the **AI limits**: 30 MB per upload, 50 MP, a 2048 px edge, a 1024 px upscale input, 30 requests per 600 s, a 60 s queue timeout, `AI_PRELOAD`

**Made:** 2026-10-08 · `acda51d`. **Last changed:** 2026-10-20 · `8b9994d`.
**Used by:** `app/main.py`, `worker.py`, `store.py`, `siglip.py`, `auth.py`, `ai/models.py`, `ai/router.py`.

#### `services/ml/app/main.py`
**What:** The FastAPI app (`uvicorn app.main:app --port 8000`).
- `GET /health`.
- `POST /analyze`, `/process-pending` and `/embed-text`, all behind the `X-ML-Secret` header (server-to-server).
- The `/ai/*` router mounted.
- CORS (`Authorization` and `Content-Type` only).
- SigLIP loaded at startup, AI models preloaded in a background thread.

**Made:** 2026-10-08 · `acda51d`. **Last changed:** 2026-10-20 · `8b9994d`.
**Used by:** uvicorn and `tests/test_ai_tools.py`. Nothing in the repo calls `/process-pending`, `/analyze` or `/embed-text` yet; they're meant for a Supabase Database Webhook or cron.

#### `services/ml/app/worker.py`
**What:** The analysis loop: `run_once()` claims pending photos, embeds and tags them, and saves the results. CLI: `python -m app.worker` (polls every 30 s), `--once`, `--retag` (re-analyses every photo).
**Made:** 2026-10-08 · `acda51d`. **Last changed:** 2026-10-11 · `fe263db` "Discover feed v2 + offline evaluation…".
**Used by:** run by hand after new photos are posted (e2e "% match" needs it). Also `app/main.py` (`/process-pending`).

#### `services/ml/app/store.py`
**What:** The Supabase client using the service-role key. It calls `rpc/ml_pending_photos`, downloads from the `portfolio` bucket, and calls `rpc/ml_save_photo_analysis` (embedding and `auto_tags`).
**Made:** 2026-10-08 · `acda51d`. **Last changed:** 2026-10-11 · `fe263db`.
**Used by:** `app/worker.py`, `app/main.py`. It depends on migration `20261008213950_photo_embeddings_and_feed`.

#### `services/ml/app/siglip.py`
**What:** The `SigLIP` wrapper (`google/siglip-base-patch16-224`). It turns images into 768-d embeddings and auto-tags, and also provides `embed_texts`, `to_pgvector` and pixel-based black-and-white detection.
**Made:** 2026-10-08 · `acda51d`. **Last changed:** unchanged.
**Used by:** `app/main.py`, `app/worker.py`, `eval/embed.py`, `eval/tags_eval.py`, `scripts/try_images.py`.

#### `services/ml/app/tags.py`
**What:** The auto-tag vocabulary: groups for colour, light, mood, style and subject, each with a neutral `_` option. `select_tags()` keeps a tag only when it clearly wins within its group; the thresholds were tuned with `eval/tags_eval.py`.
**Made:** 2026-10-08 · `acda51d`. **Last changed:** 2026-10-20 · `5f6655d` "Cleanup…".
**Used by:** `app/siglip.py`, `tests/test_tags.py`. After editing it, run `python -m app.worker --retag`. The tags show in the app through `photos.auto_tags` (`api/discover.js`, `api/portfolio.js`).

#### `services/ml/app/auth.py`
**What:** `TokenVerifier`. It checks a Supabase access token with `GET /auth/v1/user` (apikey = `SUPABASE_ANON_KEY`, else the service key) and caches valid tokens for 60 s. Also provides `bearer_token()`.
**Made:** 2026-10-20 · `8b9994d`. **Last changed:** unchanged.
**Used by:** `app/ai/router.py`, `tests/test_ai_tools.py`.

#### `services/ml/app/ai/__init__.py`
**What:** Package marker for the AI tools.
**Made:** 2026-10-20 · `8b9994d`. **Used by:** `app/ai/router.py`, `tests/test_ai_tools.py`.

#### `services/ml/app/ai/router.py`
**What:** `APIRouter(prefix="/ai")`.
- Endpoints: `GET /capabilities` and `POST /remove-background`, `/erase`, `/upscale`.
- Each request goes through `require_user` (bearer token), the in-memory per-user `RateLimiter`, then the size limits. Each tool runs one request at a time, with a queue timeout leading to `503 busy`.
- Error codes are stable (`docs/AI_TOOLS.md`), and the `X-Image-*` and `X-Processing-Ms` headers are exposed.

**Made:** 2026-10-20 · `8b9994d`. **Last changed:** unchanged.
**Used by:** `app/main.py`. Callers: `frontend/src/api/ai.js` (web `components/editor/ai/AiPanel.jsx`, mobile `screens/editor/ai/client.ts`). Tests: `tests/test_ai_tools.py`.

#### `services/ml/app/ai/models.py`
**What:** `ModelRegistry`. It lists which ONNX models are installed in `AI_MODELS_DIR` (BiRefNet-lite, LaMa, Real-ESRGAN x4v3) and loads each one into ONNX Runtime once (lazily, or preloaded).
**Made:** 2026-10-20 · `8b9994d`. **Used by:** `app/ai/router.py`, `tests/test_ai_tools.py`.

#### `services/ml/app/ai/tools.py`
**What:** Pure image-in, image-out functions:
- `remove_background`: BiRefNet at 1024², soft mask.
- `erase`: LaMa at 512², on a crop around the mask.
- `upscale`: x4, or x2 by doing x4 and then a Lanczos downscale.

**Made:** 2026-10-20 · `8b9994d`. **Used by:** `app/ai/router.py`.

#### `services/ml/app/ai/imaging.py`
**What:** Safe decoding (pixel-count check before decode, EXIF orientation, Pillow bomb guard at 100 MP) and PNG/JPEG encoding.
**Made:** 2026-10-20 · `8b9994d`. **Used by:** `app/ai/router.py`.

#### `services/ml/app/ai/srvgg.py`
**What:** The PyTorch `SRVGGNetCompact` architecture (Real-ESRGAN, BSD-3). It's used **only** to export the `.pth` weights to ONNX; the service never imports it.
**Made:** 2026-10-20 · `8b9994d`. **Used by:** `services/ml/scripts/fetch_models.py`.

#### `services/ml/scripts/fetch_models.py`
**What:** Downloads the AI tool models from pinned URLs into `services/ml/models/` (git-ignored, ~440 MB) and verifies their SHA-256. It loads the Real-ESRGAN `.pth` with `weights_only=True` and exports it to ONNX.
**Made:** 2026-10-20 · `8b9994d`. **Last changed:** unchanged.
**Used by:** `python scripts/fetch_models.py`, once per machine, and in the `Dockerfile`. Without it, `/ai/capabilities` reports the tools as unavailable.

#### `services/ml/scripts/try_images.py`
**What:** Runs SigLIP on local photos without a database. It prints tags, the most similar pairs and text-query scores.
**Made:** 2026-10-08 · `acda51d`. **Last changed:** unchanged.
**Used by:** `python scripts/try_images.py <folder> [--query "moody wedding"]`.

#### `services/ml/tests/test_tags.py`
**What:** Fast tests for `app/tags.py` (group winners, `MAX_TAGS`, black and white). No model download.
**Made:** 2026-10-08 · `acda51d`. **Last changed:** 2026-10-19 · `80615b2`.
**Used by:** `python -m pytest tests`.

#### `services/ml/tests/test_feed_eval.py`
**What:** Synthetic-data tests of the Python feed ports (`eval/feeds.py`: `FeedV1`, `FeedV2`, `_diversify`). These pin the behaviour of the `feed_v2` SQL.
**Made:** 2026-10-11 · `fe263db`. **Last changed:** unchanged.
**Used by:** `python -m pytest tests`.

#### `services/ml/tests/test_ai_tools.py`
**What:** `/ai/*` tests: auth (with a faked token check), limits, rate limiting and capabilities, plus a smoke test per tool on tiny images when the models are installed.
**Made:** 2026-10-20 · `8b9994d`. **Last changed:** unchanged.
**Used by:** `python -m pytest tests`.

#### `services/ml/eval/` (11 files): offline feed and tag evaluation
All added 2026-10-11 · `fe263db` "Discover feed v2 + offline evaluation; repair corrupted feed migration" (briankimdw) and unchanged since. They run by hand with a work folder outside the repo, usually as `.venv/Scripts/python -I eval/<script>.py <workdir>`. The scripts import each other through `sys.path`, which the codemap scan can't see.

#### `services/ml/eval/manifest.csv`
**What:** 632 labeled Creative Commons photos (id, group, url, licence, creator) in 19 style and content groups. Only the manifest is committed; the photos themselves are downloaded.
**Used by:** `eval/dataset.py` (`MANIFEST`), which `embed.py` and `simulate.py` use.

#### `services/ml/eval/dataset.py`
**What:** Builds the labeled set from Openverse. Subcommands: `search`, `search-extra`, `fetch`, `sheets` (contact sheets).
**Used by:** `python eval/dataset.py fetch <workdir>`. Imported by `eval/embed.py`, `eval/simulate.py`.

#### `services/ml/eval/embed.py`
**What:** Embeds the eval photos with SigLIP and caches the result in `<workdir>/emb_<model>.npz`.
**Used by:** `python eval/embed.py <workdir>`. Imported by `simulate.py`, `tags_eval.py`.

#### `services/ml/eval/feeds.py`
**What:** Python ports of the Discover ranking: `Oracle`, `FeedV1`, and `FeedV2` with `V2_DEFAULTS` mirroring `20261012000100_feed_v2.sql`.
**Used by:** `eval/simulate.py`, `eval/tune.py`, `eval/sql/parity_export.py`, `tests/test_feed_eval.py`. When you change the feed SQL, keep this in sync.

#### `services/ml/eval/simulate.py`
**What:** Simulated users swiping. It measures how fast each algorithm learns a taste (scenarios include single and double target groups).
**Used by:** `python eval/simulate.py <workdir> --algos oracle,v1,v2 [--out f.json]`. Imported by `tune.py`, `tags_eval.py`, `sql/parity_export.py`.

#### `services/ml/eval/tune.py`
**What:** Compares ranking variants with P@10 over the learning window (`--set main|cold|clusters|ablation…`).
**Used by:** `python eval/tune.py <workdir> --set ablation`.

#### `services/ml/eval/tags_eval.py`
**What:** Auto-tag precision, recall and false-tag rate against the group labels.
**Used by:** `python eval/tags_eval.py <workdir>`, after you edit `app/tags.py`.

#### `services/ml/eval/report_tables.py`
**What:** Turns `simulate.py --out` JSON into Markdown tables.
**Used by:** `python eval/report_tables.py final.json`.
**Notes:** Its docstring (and the `feed_v2` migration header) mention `eval/REPORT.md`, which isn't committed (the README says so).

#### `services/ml/eval/sql/parity_export.py`
**What:** Parity check, step 1. It exports a catalog, swipe scenarios and the Python `FeedV2` results to a fixture JSON.
**Used by:** `python eval/sql/parity_export.py <workdir> <fixture.json>`.

#### `services/ml/eval/sql/parity.mjs`
**What:** Parity check, step 2. It runs the `feed_v2` migration in PGlite with pgvector and compares `discover_feed` and `provider_matches` with the Python port.
**Used by:** by hand, from a scratch folder: `npm i @electric-sql/pglite@0.5.8 @electric-sql/pglite-pgvector@0.0.9 && node parity.mjs <migration.sql> <fixture.json>`.

#### `services/ml/eval/sql/feed_v2_smoke.sql`
**What:** A smoke test on the real schema: 2 vendors × 3 albums × 3 photos with random embeddings, so every code path of `discover_feed`, `taste_profile` and `provider_matches` runs.
**Used by:** run by hand (PGlite or the SQL Editor). The runbook lists it among the tests that pass after `photography_only`.

---

### `tools/studio/`: Studio (miniPaint) build

All 9 files were added 2026-10-20 · `8b9994d` "Studio (miniPaint) and AI photo tools for web and mobile" (briankimdw) and are unchanged since. Nothing here is installed into the repo: `build.mjs` copies these files to a temp folder and builds there. Design and decision record: `docs/STUDIO.md`.

#### `tools/studio/build.mjs`
**What:** The pipeline:
1. Download the miniPaint tarball at commit `a79733eb…` (v4.14.3) and check its SHA-256.
2. Stage the upstream `src/` unmodified, with our bridge files next to it.
3. `npm ci --ignore-scripts` from the pinned lockfile.
4. Run webpack. The build fails on AlertifyJS or GPL text, leftover API keys, or a non-MIT/ISC/BSD/Apache licence.
5. Copy the output to `frontend/public/studio/` and write `VERSION.json`.

**Used by:** `node tools/studio/build.mjs [--work <dir>] [--keep]`. Run it when bumping miniPaint (edit `MINIPAINT` commit + sha256) or after changing any file below.

#### `tools/studio/package.json`
**What:** The build-only manifest. Pinned runtime deps of miniPaint (jquery 3.7.1, pica, gif.js.optimized, hermite-resize from a GitHub tarball…) and webpack 5 + babel. **AlertifyJS is deliberately absent.**
**Used by:** `build.mjs` (copied into the scratch folder).

#### `tools/studio/package-lock.json`
**What:** The lockfile for the above (4,157 lines). It makes `npm ci` reproducible.
**Used by:** `build.mjs`.

#### `tools/studio/webpack.config.cjs`
**What:** Bundles upstream `src/` and `bridge/entry.js` into `minipaint.js`. It aliases `alertifyjs` to the shims, runs `strip-keys-loader.js` on `src/js/config.js`, and writes `bundled-packages.json` with the licence check. Paths are relative to the scratch folder.
**Used by:** `build.mjs`.

#### `tools/studio/entry.js`
**What:** The bridge that runs inside the iframe.
- It tweaks miniPaint's config before start: dark theme only, no Pixabay, Google Fonts or external links.
- It imports the upstream `main.js` unchanged.
- It exposes `window.studioBridge`: `ready`, `open(blobOrUrl)`, export and dirty state, documented in `docs/STUDIO.md`.

**Used by:** bundled into `frontend/public/studio/minipaint.js`. The host side is `frontend/src/components/studio/Studio.jsx`. Imports `studio-overrides.css`.

#### `tools/studio/alertify-shim.js`
**What:** An MIT stand-in for AlertifyJS's `error`, `success` and `warning` notices. Notices go to an ARIA live region.
**Used by:** `webpack.config.cjs` (alias replacing `alertifyjs/build/alertify.min.js`).

#### `tools/studio/alertify-shim.css`
**What:** Styles for the shim's notices (`.pm-notices`, `.pm-notice`).
**Used by:** `webpack.config.cjs` (alias replacing `alertify.min.css`).

#### `tools/studio/studio-overrides.css`
**What:** Our dark theme over miniPaint's CSS variables, matching `frontend/src/components/editor/editor.css`. Also the wordmark and the focus ring.
**Used by:** `tools/studio/entry.js` (import).

#### `tools/studio/strip-keys-loader.js`
**What:** A webpack loader that blanks upstream's `pixabay_key` and `google_webfonts_key` in `config.js`. They aren't our keys, and the repo is public.
**Used by:** `webpack.config.cjs`. `build.mjs` re-checks the bundle for those keys.

#### `tools/codemap/` (not tracked yet)
**What:** `scan.mjs` builds `codemap.json`: for every tracked file, the commit that added it, its latest change, `importedBy` and `routes`. This map is written from it.
**Used by:** `node tools/codemap/scan.mjs > tools/codemap/codemap.json`. It's untracked (`git status` shows `?? tools/codemap/`), so it isn't in the JSON's own file list.

---

### `docs/`

#### `docs/DATABASE.md`
**What:** The database and auth design: key decisions, auth, every table, the RLS summary, Storage buckets, the migration rollout table and the CLI workflow. §0 covers the photography-only pivot.
**Made:** 2026-10-08 · `1fb7ec3` "Supabase database + auth setup (phases 0-2)" (briankimdw). **Last changed:** 2026-10-20 · `5f6655d` "Cleanup…" (briankimdw).
**Used by:** linked from `README.md` and `docs/PROGRESS.md`. Referenced by migration `20261008171959`.
**Notes:** Mostly current. Stale points:
- `feed_v2` is shown as "Written"; it's applied.
- `20261020000000_photo_edits` is missing from the rollout table.
- The header says the project "is currently empty".
- `event_members` is listed twice.

#### `docs/PHOTOGRAPHY_ONLY_RUNBOOK.md`
**What:** Step-by-step switch of the hosted DB to photography only: 1. backup script, 2. `photography_only_setup.sql` with the guard, 3. `delete-nonphoto-users.mjs`, 4. optional re-seed, 5. e2e verification. Also covers undo and offline testing.
**Made:** 2026-10-19 · `80615b2` "Photography-only pivot: database cleanup, scripts, ML service, docs" (briankimdw). **Last changed:** unchanged.
**Used by:** referenced from `README.md`, `docs/DATABASE.md`, `docs/PROGRESS.md`, `docs/test-users.md`, both scripts, `photography_only_setup.sql`, the migration and the e2e README. **Current, and not yet carried out.**

#### `docs/AI_TOOLS.md`
**What:** The API contract for `/ai/*`: base URL and auth, common rules (multipart, EXIF, headers), the error-code table, each endpoint, typical CPU times, and web and Expo examples.
**Made:** 2026-10-20 · `8b9994d` (briankimdw). **Last changed:** unchanged.
**Used by:** referenced from `frontend/src/api/ai.js`, `mobile/src/shims/env.ts`, both `.env.example` files, `services/ml/app/main.py`, `app/ai/router.py`, `services/ml/README.md`, `docs/EDITOR.md`, `docs/STUDIO.md`. Current.

#### `docs/EDITOR.md`
**What:** The non-destructive photo editor: file map, recipe v1 format, geometry and colour pipeline, UI and accessibility, persistence (migration `20261020000000_photo_edits`, "**Not applied to the hosted DB yet**") and the `api/edits.js` API.
**Made:** 2026-10-19 · `2914c32` "Web: photo editor, easier posting, before & after slider" (briankimdw). **Last changed:** 2026-10-20 · `8b9994d` (briankimdw).
**Used by:** referenced from `docs/STUDIO.md` and the `photo_edits` migration. Current.

#### `docs/STUDIO.md`
**What:** Studio: why miniPaint (comparison with Filerobot and TOAST UI, the GPL AlertifyJS issue), why an iframe, the file map, build steps, the `studioBridge` API and how to update the pin.
**Made:** 2026-10-20 · `8b9994d` (briankimdw). **Last changed:** unchanged.
**Used by:** referenced from `tools/studio/*`, `frontend/public/studio/index.html`, `frontend/src/components/studio/StudioLayer.jsx`, `PhotoEditor.jsx`, `THIRD_PARTY_NOTICES.md`, `docs/EDITOR.md`. Current.

#### `docs/FRONTEND_DATA.md`
**What:** The data layer contract. Screens only call `frontend/src/api/*`. Covers where things live, the object shapes screens get, IDs and links, rules of thumb, the 2026-10-19 posting rework and what the pivot removed.
**Made:** 2026-10-08 · `9db1724` "Connect the frontend to Supabase; remove all mock data" (briankimdw). **Last changed:** 2026-10-20 · `5f6655d` (briankimdw).
**Used by:** linked from `README.md` and `docs/PROGRESS.md`. Current.

#### `docs/PROGRESS.md`
**What:** A session-by-session log (newest first: Studio 10-19, pivot 10-18, sharing 10-11, all verticals 10-10…). Also has "Done", "Decisions", "Open items" and "Next steps".
**Made:** 2026-10-08 · `1fb7ec3` (briankimdw). **Last changed:** 2026-10-20 · `5f6655d` (briankimdw).
**Used by:** linked from `README.md`; meant to be updated at the end of each session.
**Notes:** Partly stale:
- The header says "Last updated: 2026-10-18".
- The 10-10 and 10-11 entries still say to paste `all_verticals_setup.sql` and `sharing_events_credits_setup.sql`. Those files are now archived, and the migrations are applied.

#### `docs/PLAN.md`
**What:** The original product and feature spec (photographers first): posting, swipe Discover, profiles, the booking flow, delivery, payments, monetization, extras, the multi-service expansion (now archived) and the roadmap.
**Made:** 2026-10-08 · `8367e87` "Add project plan and mobile React frontend prototype" (briankimdw). **Last changed:** 2026-10-20 · `5f6655d` (briankimdw).
**Used by:** linked from `README.md` and `docs/PROGRESS.md`.
**Notes:** It's a vision doc, and parts disagree with `architecture.md` (see the README's open-decisions table). Its "Architecture" section (Next.js, Turborepo) doesn't match the repo.

#### `docs/test-users.json`
**What:** Throwaway dev logins (`note`, 9 `photographers` with listing details, 5 `clients`). They're **public on purpose**; delete the accounts before launch. Don't reuse the passwords anywhere.
**Made:** 2026-10-08 · `8d9b3b6` "Add test users to docs/ (public, throwaway dev logins)" (briankimdw). **Last changed:** 2026-10-19 · `80615b2` (briankimdw).
**Used by:** `frontend/scripts/seed-test-users.mjs` (creates them), `frontend/scripts/e2e/lib/env.mjs` and `context.mjs` (sign in), `frontend/scripts/delete-nonphoto-users.mjs` (the never-delete list). Usernames are also hard-coded in `supabase/demo/*.sql`.

#### `docs/test-users.md`
**What:** The human version of the above: how to seed them, the 9 photographers and 5 clients with what each is set up for, what you can test, and how to clean up later. Email confirmation must stay off for `@example.com`.
**Made:** 2026-10-08 · `8d9b3b6` (briankimdw). **Last changed:** 2026-10-19 · `80615b2` (briankimdw).
**Used by:** linked from `README.md` and `docs/DATABASE.md`. Referenced by `frontend/scripts/e2e/lib/context.mjs` and `env.mjs`. Current.

---

### Quick reference

| I want to… | Do this |
|---|---|
| Add a migration | `npx supabase migration new <name>`, then write re-runnable SQL in `supabase/migrations/`. Apply it with the Supabase MCP or `npx supabase db push` (not before the photography-only runbook; see the note on `20261018000000`). Add a rolled-back test in `supabase/tests/` and regenerate types (`docs/DATABASE.md` §7). |
| Know if a migration is live | Supabase MCP `list_migrations` (project `ktjvbajrfrbwpndforcy`). As of 2026-10-20, applied through `20261013000000`; `photography_only` and `photo_edits` are pending. |
| Switch the hosted DB to photography only | `docs/PHOTOGRAPHY_ONLY_RUNBOOK.md`: back up, paste `supabase/demo/photography_only_setup.sql` with the folder name, run `delete-nonphoto-users.mjs`, run e2e. |
| Turn on saved edit recipes | Apply `supabase/migrations/20261020000000_photo_edits.sql`, then paste `supabase/tests/photo_edits_test.sql` (13 × `ok`). |
| Change AI tool limits | Set the `AI_*` variables in `services/ml/.env` (defaults in `services/ml/app/config.py`). Update the tables in `docs/AI_TOOLS.md` too. |
| Add or replace an AI model | `services/ml/app/ai/models.py` (registry), `scripts/fetch_models.py` (pinned URL and sha256), `app/ai/tools.py`, `THIRD_PARTY_NOTICES.md`. |
| Change auto-tags | Edit `services/ml/app/tags.py`, run `python eval/tags_eval.py <workdir>` and `pytest tests`, then `python -m app.worker --retag`. |
| Tune the Discover feed | Change the constants in a **new** migration copying `discover_feed` and `taste_profile` from `20261012000100_feed_v2.sql`. Mirror them in `eval/feeds.py` `V2_DEFAULTS` and re-run `eval/simulate.py`, `tune.py` and the parity check. |
| Get "% match" and Discover ranking for new photos | Run the SigLIP worker: `cd services/ml && python -m app.worker --once`. |
| Rebuild Studio | `node tools/studio/build.mjs`, then commit `frontend/public/studio/`. To bump miniPaint, change `MINIPAINT` (commit and sha256) in `build.mjs` and re-check the licences. |
| Re-seed demo data | `cd frontend && node scripts/seed-test-users.mjs --with-photos`, then paste `supabase/demo/demo_data.sql`. Undo with `supabase/demo/remove_demo_data.sql`. |
| Run the e2e test | `cd frontend && node scripts/e2e/run.mjs` (or `--dry-run`, `--only messaging,rls`). Needs Node ≥ 22.15 and `frontend/.env.local`. |
| Check the schema after a change | Paste `supabase/tests/smoke_test.sql` (and the feature's test) into the SQL Editor; every line should end in `ok`. |
| Refresh this map's facts | `node tools/codemap/scan.mjs > tools/codemap/codemap.json` |

### Commands cheat sheet

```bash
# Web app (http://localhost:5173)
cd frontend && cp .env.example .env.local      # fill in URL + publishable key
bash ./start                                   # or: bash ./start --host  (LAN)
npm run build                                  # production build -> frontend/dist

# Seed / demo / cleanup (service role key read from services/ml/.env, never printed)
cd frontend
node scripts/seed-test-users.mjs [--with-photos]
node scripts/backup-nonphoto.mjs --dry-run && node scripts/backup-nonphoto.mjs
node scripts/delete-nonphoto-users.mjs --dry-run && node scripts/delete-nonphoto-users.mjs
#   SQL Editor: supabase/demo/demo_data.sql | remove_demo_data.sql | photography_only_setup.sql

# End-to-end (publishable key only)
cd frontend
node scripts/e2e/run.mjs [--dry-run] [--only a,b] [--verbose] [--keep] [--pause-for-payment]
node --test scripts/e2e/test/helpers.test.mjs

# Supabase CLI (hosted project, no Docker)
npx supabase login && npx supabase link --project-ref ktjvbajrfrbwpndforcy
npx supabase migration new <name>
npx supabase db push                           # NOT before the photography-only runbook
npx supabase gen types typescript --project-id ktjvbajrfrbwpndforcy > frontend/src/lib/database.types.ts

# ML service (services/ml)
cd services/ml && python -m venv .venv && .venv\Scripts\activate
pip install torch --index-url https://download.pytorch.org/whl/cpu && pip install -r requirements.txt
cp .env.example .env
python scripts/fetch_models.py                 # AI tool models (~440 MB) -> models/
uvicorn app.main:app --port 8000               # /health, /ai/*, /process-pending (X-ML-Secret)
python -m app.worker [--once | --retag]        # SigLIP embeddings + auto-tags
python -m pytest tests
python scripts/try_images.py <folder> --query "moody wedding"
python -I eval/dataset.py fetch <W> && python -I eval/embed.py <W> && python -I eval/simulate.py <W> --algos oracle,v1,v2

# Studio
node tools/studio/build.mjs [--work <dir>] [--keep]

# Codemap facts
node tools/codemap/scan.mjs > tools/codemap/codemap.json
```
