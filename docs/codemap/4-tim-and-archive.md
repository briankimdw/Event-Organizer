## Tim's services and the archive

This section covers two things that sit beside the live photography app:

1. **Tim Phelps's code** (author `Timothy Phelps` on every file): the FastAPI backend in `backend/`, the plan-driven Claude Code orchestrator in `orchestrator/`, the plan template in `plans/`, and the `/spec` skill in `.claude/`. That's 52 tracked files, each with its own entry below.
2. **`archive/event-platform/`**: the multi-vendor event-platform code that was moved out during the photography-only pivot. That's 140 tracked files, summarised folder by folder in tables.

---

### Part 1: Tim Phelps's code

#### How Tim's code fits into the app

- **The live app mostly doesn't use `backend/`.** Web (`frontend/`) and mobile (`mobile/`) talk to Supabase directly, and the ML service (`services/ml/`, port 8000) handles AI and photos. `backend/` is a separate FastAPI service on **port 8001**. Only one feature calls it: **booking gallery upload on the web**.
  - The call chain is `frontend/src/screens/Chat.jsx` → `components/GalleryUpload.jsx` → `frontend/src/api/gallery.js` `uploadGallery()` → `POST {API_URL}/bookings/{id}/gallery`. It sends the Supabase access token as `Authorization: Bearer`.
  - The upload button only shows for the booking's provider while the booking is `confirmed`, `in_progress` or `delivered`.
  - v1 stores nothing. It only returns a receipt (`stored: false`).
  - Mobile has no client for `backend/`. Nothing in `mobile/src` calls port 8001.
- **Some endpoints have no caller.** No client code calls `POST /auth/logout`, `GET /users/me` or `GET /users/me/profile`. Web (`frontend/src/auth.jsx`) and mobile (`mobile/src/state/auth.tsx`) both sign out with plain `supabase.auth.signOut()`. So the backend's session denylist is never filled in practice. `backend/AUTH.md` lists this as a known limit.
- **Env vars**:
  - `backend/.env` (gitignored) holds `SUPABASE_URL`, `SUPABASE_KEY` (the anon/publishable key, so RLS applies as the user), an optional `SUPABASE_JWT_SECRET` (legacy HS256 tokens) and an optional `CORS_ORIGINS`.
  - The web app uses `VITE_API_URL` (see `frontend/.env.example`). Without it, the URL falls back to `http://<page host>:8001`.
  - ⚠ The default `cors_origins` is only `http://localhost:5173`. Testing from a phone on the LAN (the reason for the host fallback) needs `CORS_ORIGINS` set.
- **Database dependencies**: the logout and revocation code uses `public.revoked_sessions` and the RPCs `revoke_my_session()` / `is_my_session_revoked()`. These come from `supabase/migrations/20261008220000_revoked_sessions.sql` (Tim, `e495343`). The gallery route reads `bookings` and `providers` under RLS.
- **Tim's files outside this section** (covered in their own sections):
  - `frontend/src/api/gallery.js`, `frontend/src/components/GalleryUpload.jsx`, `frontend/src/lib/galleryRules.js`, and his edits to `frontend/src/screens/Chat.jsx` and `frontend/.env.example` (`024a38b`)
  - `frontend/start` (`ee319d7`)
  - the `revoked_sessions` migration and the `supabase/config.toml` token-expiry change (`e495343`)
- **The orchestrator is a dev tool, not part of the app.**
  - **How to run it:** `python3 -m orchestrator start --plan plans/<x>.md` or `--plan specs/<slug>.md`, from the repo root.
  - **What it reads:**
    - `orchestrator/config.toml`
    - the approved plan or spec
    - `orchestrator/prompts/*.md`
    - the vendored plugin in `orchestrator/plugins/code-simplifier/`
  - **What it writes:**
    - `.orchestrator/tasks/<task-id>/` (gitignored): state, the frozen plan, logs and transcripts
    - a git worktree in `../photographer-match.worktrees/<task-id>` on branch `orch/<slug>`
    - then a commit, a push and a PR through `gh`. It never merges.
  - **It has been used once.** PR #7 (`orch/booking-gallery-upload-received-only-v1`) built the gallery upload. Commit `024a38b` has the trailer `Orchestrator-Task: 20261010-150547-booking-gallery-upload-received-only-v1`.
  - **Its checks only cover `backend/` and the frontend build.** It never verifies `mobile/`, `services/ml/` or the Supabase SQL tests.
  - **It's POSIX-only:**
    - `fcntl` in `state.py`
    - `os.killpg` / `start_new_session` in `proc.py`
    - `.venv/bin/...` paths in `config.toml` and `backend/start`
    
    So it needs WSL, Linux or macOS. It won't run in this repo's native Windows checkout. Neither `.orchestrator/` nor the worktree folder exists locally.
- **`.claude/`**: only the `/spec` skill is tracked. `.claude/settings.local.json` is local and ignored by the user's global gitignore. The orchestrator deliberately ignores everything repo-provided in `.claude/` (`--setting-sources user --disable-slash-commands`). The skill's output folder, `specs/`, is gitignored, and none exists locally.

Commits referenced below (all by Timothy Phelps):
- `e495343` (2026-10-08): "pass for auth with supabase login / expiring a token on logout with denylist in db"
- `9258c02` (2026-10-10): "Add plan-driven Claude Code orchestrator and backend checks"
- `9a73d30` (2026-10-10): "Add /spec planning skill and run spec acceptance criteria as checks"
- `024a38b` (2026-10-10): "Booking gallery upload (received-only v1)"
- `ee319d7` (2026-10-10): "orchestrator agent and start scripts for frontend and backend"

#### `backend/` — FastAPI auth + gallery service (Tim) · 21 files

#### `backend/main.py`
**What:** The FastAPI app ("Photographer Match API"). It adds CORS from settings, mounts the `auth`, `users` and `bookings` routers, and serves `GET /health`.
**Made:** 2026-10-08 · `e495343` · "pass for auth with supabase login / expiring a token on logout with denylist in db" (Timothy Phelps). **Last changed:** 2026-10-10 · `024a38b` · "Booking gallery upload (received-only v1)" (added the bookings router).
**Used by:** `backend/start` (`uvicorn main:app --port 8001`); `tests/test_health.py`, `tests/test_gallery_upload.py`.
**Notes:** Imports are top-level (`from api import …`), so it runs with `backend/` as cwd, not as a package.

#### `backend/config.py`
**What:** Pydantic `Settings` read from `backend/.env`: `supabase_url`, `supabase_key` (anon key), optional `supabase_jwt_secret`, and `cors_origins` (default `["http://localhost:5173"]`). `get_settings()` is cached with `lru_cache`.
**Made:** 2026-10-08 · `e495343` · "pass for auth with supabase login / expiring a token on logout with denylist in db" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `main.py`, `dependencies/auth.py`. Tests override it with env vars in `tests/conftest.py`.

#### `backend/api/auth.py`
**What:** `POST /auth/logout` (204). It records the session in the denylist (RPC `revoke_my_session`), marks it revoked in the process cache, then signs the session out at Supabase with scope `local`.
**Made:** 2026-10-08 · `e495343` · "pass for auth with supabase login / expiring a token on logout with denylist in db" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `main.py` (router). **No HTTP client calls it.** Web and mobile sign out with `supabase.auth.signOut()` only. No tests.

#### `backend/api/users.py`
**What:** `GET /users/me` returns the id and email from the JWT. `GET /users/me/profile` returns the caller's `profiles` row under RLS (404 if missing).
**Made:** 2026-10-08 · `e495343` · "pass for auth with supabase login / expiring a token on logout with denylist in db" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `main.py` (router). No client or test calls it.

#### `backend/api/bookings.py`
**What:** `POST /bookings/{booking_id}/gallery` (multipart `photos`). It checks that the booking exists under RLS, that the caller is its provider (`providers.profile_id`), the booking status, the photo count (1–100) and each file. It returns a receipt `{booking_id, received, total_bytes, stored: false, photos}`. Nothing is stored. All files must pass or the whole upload is rejected.
**Made:** 2026-10-10 · `024a38b` · "Booking gallery upload (received-only v1)" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `main.py` (router). Its HTTP client is `frontend/src/api/gallery.js` `uploadGallery()`, used by `components/GalleryUpload.jsx`, which `screens/Chat.jsx` opens. Tested by `tests/test_gallery_upload.py`.

#### `backend/core/gallery.py`
**What:** Upload rules:
- `MAX_PHOTOS=100`, 50 MB per file
- upload statuses `confirmed` / `in_progress` / `delivered`
- JPEG/PNG/WebP/HEIC types, falling back to the file extension for an empty or octet-stream type

`check_photo()` returns `(status, detail)` for the first problem it finds.
**Made:** 2026-10-10 · `024a38b` · "Booking gallery upload (received-only v1)" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `api/bookings.py`. It's mirrored by hand in `frontend/src/lib/galleryRules.js` (used by `GalleryUpload.jsx` and `Chat.jsx`).

#### `backend/core/sessions.py`
**What:** `RevokedSessions`, a thread-safe per-process cache in front of `public.revoked_sessions`. A "revoked" answer is cached until the token expires. A "not revoked" answer is rechecked every 30 s. Also defines the module singleton `revoked_sessions`.
**Made:** 2026-10-08 · `e495343` · "pass for auth with supabase login / expiring a token on logout with denylist in db" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `api/auth.py`, `dependencies/auth.py`.

#### `backend/dependencies/auth.py`
**What:** FastAPI dependencies:
- `AccessTokenDep`: the bearer token
- `CurrentUser`: verifies the JWT locally with PyJWT, using JWKS ES256/RS256 or the legacy HS256 secret, and checks audience and issuer. It then checks `session_id` against the denylist through RPC `is_my_session_revoked`, which fails closed with 503.
- `SupabaseDep`: a new per-request Supabase client that sends the user's token, so RLS applies

**Made:** 2026-10-08 · `e495343` · "pass for auth with supabase login / expiring a token on logout with denylist in db" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `api/auth.py`, `api/users.py`, `api/bookings.py`; `tests/test_gallery_upload.py` (overrides `get_current_user` and `get_supabase`).

#### `backend/AUTH.md`
**What:** Design doc for backend auth: how a request is verified, what logout does, its limits, and the top follow-up of moving the denylist to Redis. Also covers setup (`.env` keys, the `revoked_sessions` migration, 600 s token expiry).
**Made:** 2026-10-08 · `e495343` · "pass for auth with supabase login / expiring a token on logout with denylist in db" (Timothy Phelps). **Last changed:** same commit.
**Used by:** linked from the root `README.md`.
**Notes:** Its "Run" line has no `--port 8001`. `backend/start` sets the port.

#### `backend/start`
**What:** Bash launcher. It requires `backend/.env`, creates `.venv`, reinstalls `requirements.txt` only when its sha256 changes, then runs `uvicorn main:app --reload --port 8001`. Extra arguments go to uvicorn.
**Made:** 2026-10-10 · `ee319d7` · "orchestrator agent and start scripts for frontend and backend" (Timothy Phelps). **Last changed:** same commit.
**Used by:** humans (`bash backend/start`, in the root `README.md`). Its sibling is `frontend/start`.
**Notes:** Uses the `.venv/bin/` layout, so it doesn't work with a native Windows venv (`.venv\Scripts`).

#### `backend/requirements.txt`
**What:** Pinned runtime dependencies: fastapi, uvicorn, supabase 2.32 (postgrest, supabase-auth, storage3…), PyJWT/cryptography, httpx, pydantic-settings, and python-multipart (for uploads).
**Made:** 2026-10-08 · `e495343` · "pass for auth with supabase login / expiring a token on logout with denylist in db" (Timothy Phelps). **Last changed:** 2026-10-10 · `024a38b` · "Booking gallery upload (received-only v1)" (python-multipart).
**Used by:** `backend/start`, `requirements-dev.txt` (`-r`), the orchestrator's `[setup]`, the `rerun_on` and `pip-audit` check.

#### `backend/requirements-dev.txt`
**What:** Dev tools on top of the runtime dependencies: pytest, ruff, mypy, pip-audit.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** the orchestrator's `[setup]` (installed into each worktree's `backend/.venv`). It's on the orchestrator's protected-files list.

#### `backend/pyproject.toml`
**What:** Tool config only:
- ruff: py312, line length 100, rules `E F W I B UP`, ignore `B904`
- mypy: with the pydantic plugin
- pytest: `testpaths=tests`, `pythonpath=.`

**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** ruff, mypy and pytest run from `backend/`, which are the orchestrator's `ruff-lint`/`ruff-format`/`mypy`/`pytest` checks. Protected file.

#### `backend/.gitignore`
**What:** Ignores `.env`, `.venv/`, `__pycache__/`, `*.py[cod]` and `.pytest__cache/`.
**Made:** 2026-10-08 · `e495343` · "pass for auth with supabase login / expiring a token on logout with denylist in db" (Timothy Phelps). **Last changed:** same commit.
**Used by:** git.
**Notes:** `.pytest__cache/` is a typo (pytest writes `.pytest_cache/`), so that folder isn't ignored here.

#### `backend/__init__.py`
**What:** Empty package marker.
**Made:** 2026-10-08 · `e495343` · "pass for auth with supabase login / expiring a token on logout with denylist in db" (Timothy Phelps). **Last changed:** same commit.
**Used by:** nothing in practice. The app and tests run with `backend/` as the import root (`pythonpath=.`).

#### `backend/api/__init__.py`
**What:** Empty package marker for the routers.
**Made:** 2026-10-08 · `e495343` · "pass for auth with supabase login / expiring a token on logout with denylist in db" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `from api import auth, bookings, users` in `main.py`.

#### `backend/core/__init__.py`
**What:** Empty package marker.
**Made:** 2026-10-08 · `e495343` · "pass for auth with supabase login / expiring a token on logout with denylist in db" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `core.sessions` and `core.gallery` imports.

#### `backend/dependencies/__init__.py`
**What:** Empty package marker.
**Made:** 2026-10-08 · `e495343` · "pass for auth with supabase login / expiring a token on logout with denylist in db" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `dependencies.auth` imports.

#### `backend/tests/conftest.py`
**What:** Sets dummy `SUPABASE_URL`/`SUPABASE_KEY`/`SUPABASE_JWT_SECRET` env vars, so tests never reach the real project.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** pytest (auto-loaded). Protected by the orchestrator. `orchestrator/verify.py` sets the same dummy values.

#### `backend/tests/test_health.py`
**What:** One test: `GET /health` returns `{"status": "ok"}`.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** pytest / the orchestrator's `pytest` check.

#### `backend/tests/test_gallery_upload.py`
**What:** 13 test functions, with the status tests parametrised, for the gallery endpoint. They cover the receipt, a missing token, an unknown booking, a caller who isn't the provider, closed and open statuses, 100 vs 101 photos, file types, octet-stream plus extension, empty files, files over 50 MB, and a missing field. Uses a fake Supabase query builder through `dependency_overrides`.
**Made:** 2026-10-10 · `024a38b` · "Booking gallery upload (received-only v1)" (Timothy Phelps). **Last changed:** same commit.
**Used by:** pytest / the orchestrator's `pytest` check.

#### `orchestrator/` — plan-driven Claude Code orchestrator (Tim) · 25 files

**How it works:** an approved plan or spec goes in. The orchestrator then:
1. creates a worktree and an `orch/<slug>` branch
2. runs `claude -p` to implement the plan
3. runs the checks and guards outside the agent
4. sends failures back to Claude, with a limited number of retries
5. runs one code-simplifier pass, which it keeps only if every check still passes
6. on `ship`, commits, pushes and opens a PR

Exit codes: 0 ok, 1 failed, 2 refused, 3 needs a human, 130 stopped.

#### `orchestrator/README.md`
**What:** The full manual:
- the flow (`/spec` or a hand-written plan → verify loop → simplify → ship)
- setup (Claude CLI, `gh`, gitleaks)
- plan and spec requirements, commands and exit codes
- checks, guards, limits, the safety model
- state and logs, and how to run the tests

**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** 2026-10-10 · `9a73d30` · "Add /spec planning skill and run spec acceptance criteria as checks".
**Used by:** linked from the root `README.md`. The `/spec` skill reads it during its investigation step.
**Notes:** It says the suite has "33 hermetic acceptance tests", but `test_orchestrator.py` has 35 `test_` methods.

#### `orchestrator/__init__.py`
**What:** Empty package marker.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `python3 -m orchestrator`; `tests/test_orchestrator.py` (`from orchestrator import cli, proc`).

#### `orchestrator/__main__.py`
**What:** Entry point: `raise SystemExit(main())` from `cli`.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `python3 -m orchestrator …` (run by humans; the `/spec` skill prints the command).

#### `orchestrator/cli.py`
**What:** argparse CLI with the subcommands `start`, `resume`, `status`, `stop`, `ship`, `logs` and `list`, plus limit flags (`--max-remediations`, `--budget`, `--timeout`), `--auto-ship`, `--no-simplify` and `--answer`. It finds the repo, loads `config.toml`, and refuses to run when `ORCHESTRATOR_ACTIVE` is set (recursion guard).
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `__main__.py`; `tests/test_orchestrator.py`. Imports `proc`, `report.status_text` and `runner.Orchestrator`.

#### `orchestrator/runner.py`
**What:** The `Orchestrator` class and the task lifecycle: create the task (lock, worktree, frozen plan), implement, verify and remediate within limits, run `_simplify` (a fresh session with `--plugin-dir` and `prompts/simplify.md`, reverted with `git read-tree` on failure), then `ship`.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** 2026-10-10 · `9a73d30` · "Add /spec planning skill and run spec acceptance criteria as checks".
**Used by:** `cli.py`. Imports `agent`, `guards`, `proc`, `ship`, `verify`, `plan`, `state` and `report.pr_body`.

#### `orchestrator/agent.py`
**What:** Builds and runs `claude -p --output-format json` with one persistent session per task (`--session-id` / `--resume`), a `--json-schema` end-of-turn status, `dontAsk` permissions, ignored repo settings, a budget cap and `--append-system-prompt-file prompts/system.md`. It parses the result into `AgentTurn`.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** 2026-10-10 · `9a73d30` · "Add /spec planning skill and run spec acceptance criteria as checks".
**Used by:** `runner.py`.

#### `orchestrator/plan.py`
**What:** Parses and validates both formats:
- `plans/TEMPLATE.md` style: `## Objective` … sections and `Status: approved`
- `/spec` files: `## 1.`–`## 12.` sections, `- status: approved`, no unfilled `{…}` slots

It pulls out `AC-n: \`command\`` acceptance checks, Allowed paths and Approvals, and provides a sha256 and a slug.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** 2026-10-10 · `ee319d7` · "orchestrator agent and start scripts for frontend and backend".
**Used by:** `runner.py`, `agent.py`, `guards.py`, `verify.py`, `report.py`; tests.

#### `orchestrator/verify.py`
**What:** Runs the `[[checks]]` from `config.toml` in the worktree with a scrubbed environment and dummy Supabase env. It handles `{files}`/`{worktree}` placeholders, `when_changed`, a rerun of each failure to detect flaky checks, offline markers that mark a check unavailable, acceptance commands (`bash -c`), and failure fingerprints for the no-progress stop.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** 2026-10-10 · `9a73d30` · "Add /spec planning skill and run spec acceptance criteria as checks".
**Used by:** `runner.py`; `guards.py` (`matches`).

#### `orchestrator/guards.py`
**What:** Diff policy run on every iteration:
- **Sent back to Claude:** edits to protected files, changes outside the allowed paths, secret files, added skip/noqa/type-ignore
- **Pauses for a human:** deleted tests, destructive SQL or edits to an existing migration, unless the plan's `## Approvals` allows them

**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `runner.py`.

#### `orchestrator/proc.py`
**What:** Subprocess helpers:
- `scrubbed_env()` with an allowlist, so `GH_TOKEN`, API keys and `SSH_AUTH_SOCK` are dropped
- `run()` with timeouts and process-group kill (`os.killpg`)
- a cooperative `STOP` event
- `git()` / `GitError`

**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `cli.py`, `runner.py`, `agent.py`, `verify.py`, `guards.py`, `ship.py`; tests.
**Notes:** POSIX-only (`killpg`, `start_new_session`).

#### `orchestrator/state.py`
**What:** `TaskState` dataclass with the lifecycle `implementing → verifying → remediating → awaiting_ship → shipping → shipped`, and paused/terminal states. `Store` handles `.orchestrator/tasks/<id>/state.json` and the `log.jsonl` event log. `RepoLock` allows one task per repo using `fcntl.flock`.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `runner.py`, `report.py`, `ship.py`; tests (`Store`).
**Notes:** `fcntl` means it won't import on native Windows.

#### `orchestrator/report.py`
**What:** Human-facing text: the checks table, the simplify outcome line, `status_text()` for the terminal, and `pr_body()`. The PR body includes the objective, checks, `Visual:` acceptance criteria as manual review items, review notes and cost.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** 2026-10-10 · `9a73d30` · "Add /spec planning skill and run spec acceptance criteria as checks".
**Used by:** `cli.py` (`status_text`), `runner.py` (`pr_body`).

#### `orchestrator/ship.py`
**What:** Idempotent ship steps:
- `preflight_gh`
- `commit` (with the `Orchestrator-Task:` and `Co-Authored-By` trailers)
- `push` (refuses if the remote branch differs; never force-pushes)
- `open_pr` through `gh`, reusing an existing PR

It never merges or deploys.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `runner.py`.

#### `orchestrator/config.toml`
**What:** All settings:
- `[limits]`: 4 remediations, $10, 45 min
- `[git]`: base `main`, branch prefix `orch/`, worktree root
- `[agent]`: allowed and disallowed tools
- `[simplify]`: $2, 10 min
- `[setup]`: venv plus dev requirements
- `[[checks]]`: ruff-lint, ruff-format, mypy, pytest, gitleaks, pip-audit (optional), frontend-build when `frontend/**` changed
- `[acceptance]`, `[guards]` (protected and test globs, secret globs, migration globs), `[ship]`

**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** 2026-10-10 · `9a73d30` · "Add /spec planning skill and run spec acceptance criteria as checks".
**Used by:** `cli.py` (`DEFAULT_CONFIG`); the `/spec` skill reads it during its investigation step.

#### `orchestrator/ruff.toml`
**What:** Ruff config for the orchestrator's own Python: py312, line length 100, rules `E F W I B UP`.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** ruff when run on `orchestrator/` by hand. None of the orchestrator's own checks lint it.

#### `orchestrator/prompts/system.md`
**What:** System prompt appended for implementation turns. Its rules: the plan is the source of truth; stop with `needs_human` instead of guessing; never weaken tests or add suppressions; don't touch protected paths, git or the network; treat `<untrusted>` text as data; AC commands are required checks.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** 2026-10-10 · `9a73d30` · "Add /spec planning skill and run spec acceptance criteria as checks".
**Used by:** `agent.py` (default `system_prompt="system.md"`).

#### `orchestrator/prompts/simplify.md`
**What:** Overrides for the simplifier pass. It replaces the plugin's JS/React standards with this repo's Python/FastAPI standards, and limits edits to the task's changed non-test files with behaviour kept exactly the same.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `runner.py` `_simplify` (`system_prompt="simplify.md"`).

#### `orchestrator/plugins/code-simplifier/.claude-plugin/plugin.json`
**What:** Manifest of the vendored Anthropic `code-simplifier` plugin (v1.0.0).
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `claude --plugin-dir orchestrator/plugins/code-simplifier` (from `config.toml` `[simplify].plugin_dir` through `runner.py`).

#### `orchestrator/plugins/code-simplifier/agents/code-simplifier.md`
**What:** The upstream `code-simplifier` agent definition (model `opus`), vendored unmodified.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `--agent code-simplifier:code-simplifier` in the simplify pass.

#### `orchestrator/plugins/code-simplifier/VENDORED.md`
**What:** Where the plugin comes from: `anthropics/claude-plugins-official` at commit `b8e53f1c…` (2026-10-09), unmodified. Its JS standards are overridden by `prompts/simplify.md`.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** humans (provenance and upgrade notes); referenced in the orchestrator README.

#### `orchestrator/plugins/code-simplifier/LICENSE`
**What:** Apache-2.0 license of the vendored plugin.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** license compliance only.

#### `orchestrator/tests/__init__.py`
**What:** Empty package marker.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `python3 -m unittest discover -s orchestrator/tests -t .`.

#### `orchestrator/tests/test_orchestrator.py`
**What:** Hermetic acceptance suite with 35 `test_` methods. It uses a throwaway git repo, a local bare remote, and the fake `claude` and `gh`. It covers plan refusal, happy path to PR, remediation, limits and no-progress, `needs_human` plus `--answer`, guards, flaky and unavailable checks, env scrubbing, stop/resume, recursion, simplifier keep/discard, spec parsing and AC checks, and the absence of any merge or deploy path.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** 2026-10-10 · `ee319d7` · "orchestrator agent and start scripts for frontend and backend".
**Used by:** `python3 -m unittest discover -s orchestrator/tests -t . -v` (by hand; no CI).

#### `orchestrator/tests/fake_claude.py`
**What:** Stand-in for `claude -p`. It replays `scenario.json` turn by turn (writes, deletes, status, cost, exit codes) and records every call to `calls.jsonl`.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `test_orchestrator.py` (copied into a temp bin dir and set as `[agent].command`).

#### `orchestrator/tests/fake_gh.py`
**What:** Stand-in for the GitHub CLI. It records calls to `gh_calls.jsonl` and keeps PRs in `prs.json`, so `auth status`, `pr list` and `pr create` work.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `test_orchestrator.py` (set as `[ship].gh`).

#### `plans/` — hand-written plans (Tim) · 1 file

#### `plans/TEMPLATE.md`
**What:** The template for a hand-written orchestrator plan:
- a title, which becomes the branch and PR title
- `Status: draft`, changed to `approved` once reviewed
- the required `## Objective`, `## Scope`, `## Acceptance criteria` (with the `AC-n: \`cmd\`` form), `## Design constraints` and `## Required tests` sections
- the optional `## Allowed paths` and `## Approvals` sections

**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** 2026-10-10 · `9a73d30` · "Add /spec planning skill and run spec acceptance criteria as checks".
**Used by:** humans (copy it to `plans/<name>.md`), then `python3 -m orchestrator start --plan …` / `plan.py`. `plans/**` is protected from the agent.
**Notes:** It's the only file in `plans/`. No real plan has been committed. The one orchestrator run (PR #7) used a plan that isn't in the repo.

#### `.claude/` — Claude Code skill (Tim) · 5 files

#### `.claude/skills/spec/SKILL.md`
**What:** The `/spec` skill. It investigates the repo (including the orchestrator README and config), interviews the user in multiple-choice rounds, and writes `specs/<slug>.md` from a 13-section template. A fresh agent then does a dry run of implementing from the spec alone to find gaps, and Gate B asks for approval. It never implements: on approval it prints `python3 -m orchestrator start --plan specs/<slug>.md`.
**Made:** 2026-10-10 · `9a73d30` · "Add /spec planning skill and run spec acceptance criteria as checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** Claude Code sessions in this repo (`/spec …`). The spec files it writes are parsed by `orchestrator/plan.py`. `specs/` is gitignored.

#### `.claude/skills/spec/config.yml`
**What:** Skill config: `output_language: en`, pinned (upstream defaults to `auto`/Japanese).
**Made:** 2026-10-10 · `9a73d30` · "Add /spec planning skill and run spec acceptance criteria as checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `SKILL.md` step 0, which reads it.

#### `.claude/skills/spec/VENDORED.md`
**What:** Where the skill comes from (`dualform-labs/spec-skill` @ `340ea16…`, Apache-2.0) and every change from upstream:
- translated to English
- plans only, never implements
- `draft→approved` statuses only
- `specs/` in this repo
- machine-runnable §11 acceptance criteria
- Allowed paths and Approvals subsections

Also explains why `spec-lint.sh` wasn't vendored.
**Made:** 2026-10-10 · `9a73d30` · "Add /spec planning skill and run spec acceptance criteria as checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** humans (provenance); referenced from `SKILL.md`.

#### `.claude/skills/spec/LICENSE`
**What:** Apache-2.0 license copied unchanged from upstream spec-skill.
**Made:** 2026-10-10 · `9a73d30` · "Add /spec planning skill and run spec acceptance criteria as checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** license compliance only.

#### `.claude/skills/spec/NOTICE`
**What:** Apache NOTICE file from upstream ("spec-skill, Copyright 2026 dualform-labs").
**Made:** 2026-10-10 · `9a73d30` · "Add /spec planning skill and run spec acceptance criteria as checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** license compliance only.

---

### Part 2: `archive/event-platform/` — the archived multi-vendor event platform

#### What it is and why

On **2026-10-18** photographer-match went back to **photography only**: one vertical, "Photo & video" (slug `photography`). Everything that only served the wider event-services marketplace was moved here:

- 17 other verticals (venues, catering, DJs…)
- events with friends
- the AI event planner
- occasion and service browse pages
- post credits
- vendor cards in Discover

The archive is **kept for later**. It is not built, not tested and not imported. No file outside `archive/` imports anything in it; every `importedBy` link in `codemap.json` points from one archive file to another. The database schema deliberately stays multi-vertical (`service_categories` JSON Schemas, `providers.vertical_id`, every price type, `events`/`event_members`), so a vertical can come back as data. The full story is in `archive/event-platform/README.md` and `docs/PHOTOGRAPHY_ONLY_RUNBOOK.md`.

- **Full previous state:** git tag **`multi-vendor-snapshot`**. It's an annotated tag pointing to commit `c7028db` (2026-10-12, "Discover for every vertical (web + mobile), demo vendor portfolios"). Every file sits there in its original place. Use the tag to see or run the old app, and this folder to find pieces quickly.
- **Commits that built the archive** (all by briankimdw):
  - `fba56f4` (2026-10-19), "Photography-only pivot: web and mobile apps": moved 108 files with `git mv`, so `renamedFrom` is set, and added 8 copies or extracts.
  - `80615b2` (2026-10-19), "Photography-only pivot: database cleanup, scripts, ML service, docs": added 22 files (copies, the e2e snapshot, the ml-planner shell files, the README).
  - `5f6655d` (2026-10-20), "Cleanup: remove dead code, unused deps and stale docs": moved `docs/QA_CHECKLIST.md` and `docs/UI_SWEEP.md` in from `docs/`.
- **Not in git:** `archive/event-platform/data-backup/` (gitignored). These are the deleted rows and Storage files, written by `frontend/scripts/backup-nonphoto.mjs`.

#### How to restore a piece (summary of the archive README)

General rule: take files from the tag (`git checkout multi-vendor-snapshot -- <path>`) or from here, then re-wire whatever the pivot removed. **Never re-run an old migration.** Write a new one.

- **A vertical** (e.g. catering):
  1. Copy its `service_categories` rows from `supabase/seed_all_verticals.sql` into `supabase/seed.sql`.
  2. Restore `frontend/src/verticals/catalog.js` and `<slug>/config.js` from this folder.
  3. Re-add the test vendors from `docs/test-users-vendors.json` with new passwords.
  4. Copy that vertical's demo data from `demo_data_all_verticals.sql`.
  5. Follow `docs/VERTICALS.md`.
  6. Re-insert old rows from `data-backup/` with the service role.
- **Events with friends:** write a new migration from `20261011000100_event_groups.sql` (`events`/`event_members` still exist), then restore the screens and `scripts/e2e/sections/events.mjs`.
- **Post credits:** new migration from `20261011000200_post_credits.sql`, plus `api/portfolio.credits-and-occasions.js` and `components/upload/Credits.jsx`.
- **AI planner:** see `services/ml-planner/README.md`. Copy `app/planner/` and the tests back into `services/ml/`, re-add the `/plan` block of `main.py`/`config.py`, and add `anthropic` to the requirements.
- **Vendor cards in Discover:** new migration from `20261013000000_discover_all_verticals.sql`, plus the Discover components here.

#### Folder-by-folder

Paths in the tables are relative to `archive/event-platform/`. "Original location" comes from `renamedFrom` in `codemap.json`. For files with no `renamedFrom` (copies and extracts), the original was checked against the pre-pivot tree (`fba56f4^`). Rows marked **(copy)** were confirmed byte-identical to that original. The live repo still has its own trimmed photography-only version of those files, and archived migrations also still exist in `supabase/migrations/`. Authorship: every archived file was originally written by briankimdw. None of it is Tim's.

##### Root · 1 file

| file | what it was | original location | archived in |
|---|---|---|---|
| `README.md` | Archive guide: what was archived, what stayed in the schema, how to restore each feature | new file | `80615b2` |

##### `docs/` · 5 files

| file | what it was | original location | archived in |
|---|---|---|---|
| `EVENT_PLATFORM_PLAN.md` | Plan for growing from a photographer marketplace into a multi-vendor event platform | `docs/EVENT_PLATFORM_PLAN.md` | `fba56f4` |
| `VERTICALS.md` | Checklist for adding a vertical (catalog, config, seed, schemas) | `docs/VERTICALS.md` | `fba56f4` |
| `QA_CHECKLIST.md` | Web QA run record of the multi-vendor app (2026-10-10) | `docs/QA_CHECKLIST.md` | `5f6655d` |
| `UI_SWEEP.md` | UI overflow/clipping sweep record of the multi-vendor app (2026-10-11) | `docs/UI_SWEEP.md` | `5f6655d` |
| `test-users-vendors.json` | The 32 test vendors of the archived verticals, passwords removed (their accounts were deleted) | extract of `docs/test-users.json` (`vendors`) | `80615b2` |

##### `frontend/src/` — top level, `api/`, `lib/`, `screens/` · 11 files

| file | what it was | original location | archived in |
|---|---|---|---|
| `styles.css` | The pre-pivot global stylesheet, including planner, events and vertical styles | `frontend/src/styles.css` **(copy)** | `fba56f4` |
| `api/events.js` | Events-with-friends data layer: events, members, invites, candidate board, votes | `frontend/src/api/events.js` | `fba56f4` |
| `api/planner.js` | Client for the AI planner (`services/ml` `POST /plan`) and saved plans | `frontend/src/api/planner.js` | `fba56f4` |
| `api/home.multi-vertical.js` | The multi-vertical Home/browse builders (old `buildHomeFeed`, `/services/:vertical`, `/occasions/:slug`, the Discover vertical picker) | extract cut from `frontend/src/api/home.js` | `fba56f4` |
| `api/portfolio.credits-and-occasions.js` | Post occasions and post credits (tag the other vendors on a post) | extract cut from `frontend/src/api/portfolio.js` | `fba56f4` |
| `lib/planBrief.js` | Plain-JS display helpers for planner briefs, shared with Expo | `frontend/src/lib/planBrief.js` | `fba56f4` |
| `screens/Events.jsx` | `/events` list and `/events/new` | `frontend/src/screens/Events.jsx` | `fba56f4` |
| `screens/EventDetail.jsx` | `/events/:id` event workspace (chat, invite, hiring board, votes) | `frontend/src/screens/EventDetail.jsx` | `fba56f4` |
| `screens/Occasion.jsx` | `/occasions/:slug` occasion landing page with a "Plan this with AI" box | `frontend/src/screens/Occasion.jsx` | `fba56f4` |
| `screens/Planner.jsx` | `/plan` AI event planner chat screen | `frontend/src/screens/Planner.jsx` | `fba56f4` |
| `screens/ServiceHome.jsx` | `/services/:vertical` vertical landing page (hero, service chips, provider shelves) | `frontend/src/screens/ServiceHome.jsx` | `fba56f4` |

##### `frontend/src/components/` · 23 files

| file | what it was | original location | archived in |
|---|---|---|---|
| `discover/VerticalPicker.jsx` | Discover deck's "what am I swiping" vertical chip and sheet | `frontend/src/components/discover/VerticalPicker.jsx` | `fba56f4` |
| `discover/discover.css` | Pre-pivot Discover styles (`dc-` prefix) | `frontend/src/components/discover/discover.css` **(copy)** | `fba56f4` |
| `events/EventParts.jsx` | Shared event pieces: Add-to-event sheet and button, rows, labels | `frontend/src/components/events/EventParts.jsx` | `fba56f4` |
| `events/EventsShelf.jsx` | "Your events" shelf on Home and Me | `frontend/src/components/events/EventsShelf.jsx` | `fba56f4` |
| `events/PlanSavedActions.jsx` | "Plan it with friends" actions after a planner save | `frontend/src/components/events/PlanSavedActions.jsx` | `fba56f4` |
| `events/events.css` | Styles for the events-with-friends screens | `frontend/src/components/events/events.css` | `fba56f4` |
| `home/Browse.jsx` | Uber Eats-style vertical tiles on Home (→ `/services/:vertical`) | `frontend/src/components/home/Browse.jsx` | `fba56f4` |
| `home/home.css` | Pre-pivot Home, service and occasion styles (`hd-` prefix) | `frontend/src/components/home/home.css` **(copy)** | `fba56f4` |
| `planner/BriefChips.jsx` | "What I understood" brief chips with inline editors | `frontend/src/components/planner/BriefChips.jsx` | `fba56f4` |
| `planner/BudgetBreakdown.jsx` | Stacked budget bar plus rows per category | `frontend/src/components/planner/BudgetBreakdown.jsx` | `fba56f4` |
| `planner/Composer.jsx` | Planner prompt box (hero and docked versions) | `frontend/src/components/planner/Composer.jsx` | `fba56f4` |
| `planner/MyEvents.jsx` | Saved plans list | `frontend/src/components/planner/MyEvents.jsx` | `fba56f4` |
| `planner/PlanCard.jsx` | Home entry card to the planner | `frontend/src/components/planner/PlanCard.jsx` | `fba56f4` |
| `planner/PlanError.jsx` | Planner error state with retry | `frontend/src/components/planner/PlanError.jsx` | `fba56f4` |
| `planner/PlanningState.jsx` | "Thinking" steps and skeletons | `frontend/src/components/planner/PlanningState.jsx` | `fba56f4` |
| `planner/Recommendations.jsx` | Ranked vendor options per category | `frontend/src/components/planner/Recommendations.jsx` | `fba56f4` |
| `planner/SharePlanButton.jsx` | Share a saved plan to chats as an event card | `frontend/src/components/planner/SharePlanButton.jsx` | `fba56f4` |
| `planner/brief.js` | Web brief helpers plus event-type icons | `frontend/src/components/planner/brief.js` | `fba56f4` |
| `planner/devMock.js` | DEV-only stand-in for `POST /plan` (`/plan?mock=1`) | `frontend/src/components/planner/devMock.js` | `fba56f4` |
| `planner/devMock.fixture.json` | Fixture response for `devMock.js` | `frontend/src/components/planner/devMock.fixture.json` | `fba56f4` |
| `upload/Credits.jsx` | Post-credits picker in the upload flow | `frontend/src/components/upload/Credits.jsx` | `fba56f4` |
| `verticals/EmptyVertical.jsx` | "No caterers near you yet" empty state with an invite | `frontend/src/components/verticals/EmptyVertical.jsx` | `fba56f4` |
| `verticals/VerticalSwitcher.jsx` | Airbnb-style vertical row, plus the `VerticalGrid` | `frontend/src/components/verticals/VerticalSwitcher.jsx` | `fba56f4` |

##### `frontend/src/verticals/` · 21 files

| file | what it was | original location | archived in |
|---|---|---|---|
| `catalog.js` | Shared catalog of all 18 verticals and 10 occasions (source of truth for web, Expo and seed) | `frontend/src/verticals/catalog.js` **(copy)** | `fba56f4` |
| `index.js` | Vertical registry: catalog plus per-vertical configs and a generic fallback | `frontend/src/verticals/index.js` **(copy)** | `fba56f4` |
| `fields.js` | Reusable field definitions for vertical configs | `frontend/src/verticals/fields.js` | `fba56f4` |
| `photography/config.js` | Pre-pivot photography config | `frontend/src/verticals/photography/config.js` **(copy)** | `fba56f4` |
| `videography/config.js` | Videography config (films and reels); merged into Photo & video | `frontend/src/verticals/videography/config.js` | `fba56f4` |
| `bar/config.js` | Bar & drinks config (per guest) | `frontend/src/verticals/bar/config.js` | `fba56f4` |
| `cakes/config.js` | Cakes & desserts config (per item or serving) | `frontend/src/verticals/cakes/config.js` | `fba56f4` |
| `catering/config.js` | Catering config (per guest, cuisines, dietary) | `frontend/src/verticals/catering/config.js` | `fba56f4` |
| `decor/config.js` | Decor & design config | `frontend/src/verticals/decor/config.js` | `fba56f4` |
| `entertainment/config.js` | Entertainment config (photo booths, magicians, kids) | `frontend/src/verticals/entertainment/config.js` | `fba56f4` |
| `florals/config.js` | Florals config (per piece or full design) | `frontend/src/verticals/florals/config.js` | `fba56f4` |
| `hair-makeup/config.js` | Hair & makeup config (per person) | `frontend/src/verticals/hair-makeup/config.js` | `fba56f4` |
| `music/config.js` | DJs & live music config (hourly or set price) | `frontend/src/verticals/music/config.js` | `fba56f4` |
| `officiant/config.js` | Officiants config | `frontend/src/verticals/officiant/config.js` | `fba56f4` |
| `planning/config.js` | Planners config (full or day-of) | `frontend/src/verticals/planning/config.js` | `fba56f4` |
| `private-chef/config.js` | Private chefs config (per guest) | `frontend/src/verticals/private-chef/config.js` | `fba56f4` |
| `rentals/config.js` | Rentals config (per item or day) | `frontend/src/verticals/rentals/config.js` | `fba56f4` |
| `staffing/config.js` | Event staff config (hourly per staff member) | `frontend/src/verticals/staffing/config.js` | `fba56f4` |
| `transportation/config.js` | Transportation config (hourly, seat count) | `frontend/src/verticals/transportation/config.js` | `fba56f4` |
| `venue/config.js` | Venues config (per day or hour, capacity) | `frontend/src/verticals/venue/config.js` | `fba56f4` |
| `wellness/config.js` | Wellness config (massage, yoga, training at home) | `frontend/src/verticals/wellness/config.js` | `fba56f4` |

##### `mobile/src/app/`, `components/`, `shims/` · 8 files

| file | what it was | original location | archived in |
|---|---|---|---|
| `mobile/src/app/events.tsx` | expo-router route `/events` → `screens/events/EventsList` | `mobile/src/app/events.tsx` | `fba56f4` |
| `mobile/src/app/events/[id].tsx` | Route `/events/[id]` → `screens/events/EventDetail` | `mobile/src/app/events/[id].tsx` | `fba56f4` |
| `mobile/src/app/events/new.tsx` | Route `/events/new` → `screens/events/NewEvent` | `mobile/src/app/events/new.tsx` | `fba56f4` |
| `mobile/src/app/occasions/[slug].tsx` | Route `/occasions/[slug]` → `screens/catalog/OccasionScreen` | `mobile/src/app/occasions/[slug].tsx` | `fba56f4` |
| `mobile/src/app/plan.tsx` | Route `/plan` → `screens/planner/Planner` | `mobile/src/app/plan.tsx` | `fba56f4` |
| `mobile/src/app/services/[vertical].tsx` | Route `/services/[vertical]` → `screens/catalog/VerticalScreen` | `mobile/src/app/services/[vertical].tsx` | `fba56f4` |
| `mobile/src/components/share/SharePlanButton.tsx` | Native "share a saved plan as an event card" | `mobile/src/components/share/SharePlanButton.tsx` | `fba56f4` |
| `mobile/src/shims/planner-dev-mock.ts` | Native stand-in for the web planner dev mock | `mobile/src/shims/planner-dev-mock.ts` | `fba56f4` |

##### `mobile/src/screens/` · 25 files

| file | what it was | original location | archived in |
|---|---|---|---|
| `catalog/Hero.tsx` | Tinted hero for vertical and occasion pages | `mobile/src/screens/catalog/Hero.tsx` | `fba56f4` |
| `catalog/OccasionScreen.tsx` | Native `/occasions/[slug]` | `mobile/src/screens/catalog/OccasionScreen.tsx` | `fba56f4` |
| `catalog/VerticalScreen.tsx` | Native `/services/[vertical]` | `mobile/src/screens/catalog/VerticalScreen.tsx` | `fba56f4` |
| `discover/VerticalPicker.tsx` | Native Discover vertical picker (all 18 verticals) | `mobile/src/screens/discover/VerticalPicker.tsx` | `fba56f4` |
| `events/AddToEvent.tsx` | "Add to event" sheet (add a vendor to an event board) | `mobile/src/screens/events/AddToEvent.tsx` | `fba56f4` |
| `events/EventDetail.tsx` | Native event workspace `/events/[id]` | `mobile/src/screens/events/EventDetail.tsx` | `fba56f4` |
| `events/EventsList.tsx` | Native `/events` list | `mobile/src/screens/events/EventsList.tsx` | `fba56f4` |
| `events/NewEvent.tsx` | Native `/events/new` form | `mobile/src/screens/events/NewEvent.tsx` | `fba56f4` |
| `events/parts.tsx` | Shared event pieces (avatars, rows, invite sheet, shelf) | `mobile/src/screens/events/parts.tsx` | `fba56f4` |
| `home/CatalogRails.tsx` | Home vertical and occasion rails | `mobile/src/screens/home/CatalogRails.tsx` | `fba56f4` |
| `home/PlannerEntry.tsx` | Home entry card to the planner | `mobile/src/screens/home/PlannerEntry.tsx` | `fba56f4` |
| `planner/Planner.tsx` | Native AI planner chat screen | `mobile/src/screens/planner/Planner.tsx` | `fba56f4` |
| `planner/AiMark.tsx` | Planner accent mark | `mobile/src/screens/planner/AiMark.tsx` | `fba56f4` |
| `planner/BriefChips.tsx` | Native brief chips plus editors | `mobile/src/screens/planner/BriefChips.tsx` | `fba56f4` |
| `planner/BudgetBreakdown.tsx` | Native budget bar and rows | `mobile/src/screens/planner/BudgetBreakdown.tsx` | `fba56f4` |
| `planner/Composer.tsx` | Native planner prompt box | `mobile/src/screens/planner/Composer.tsx` | `fba56f4` |
| `planner/EmptyVertical.tsx` | Native "no vendors near you yet" state | `mobile/src/screens/planner/EmptyVertical.tsx` | `fba56f4` |
| `planner/MyEvents.tsx` | Native saved plans | `mobile/src/screens/planner/MyEvents.tsx` | `fba56f4` |
| `planner/PlanError.tsx` | Native planner error state | `mobile/src/screens/planner/PlanError.tsx` | `fba56f4` |
| `planner/PlanningState.tsx` | Native "thinking" state | `mobile/src/screens/planner/PlanningState.tsx` | `fba56f4` |
| `planner/Recommendations.tsx` | Native ranked options per category | `mobile/src/screens/planner/Recommendations.tsx` | `fba56f4` |
| `planner/brief.ts` | Typed brief helpers plus icons for the app | `mobile/src/screens/planner/brief.ts` | `fba56f4` |
| `provider/VerticalGrid.tsx` | "What do you offer?" grid of every vertical | `mobile/src/screens/provider/VerticalGrid.tsx` | `fba56f4` |
| `provider/upload/Credits.tsx` | Native post-credits picker | `mobile/src/screens/provider/upload/Credits.tsx` | `fba56f4` |
| `provider/upload/ListingPicker.tsx` | "Posting to" listing picker (vendors with several listings) | `mobile/src/screens/provider/upload/ListingPicker.tsx` | `fba56f4` |

##### `scripts/` · 12 files

The `e2e/` files that were copied, not moved, are a snapshot of the pre-pivot multi-vendor e2e suite. The live suite in `frontend/scripts/e2e/` was trimmed to photography-only in the same commit.

| file | what it was | original location | archived in |
|---|---|---|---|
| `seed-vendor-photos.mjs` | Seeds demo portfolio posts for the test vendors of every vertical | `frontend/scripts/seed-vendor-photos.mjs` | `fba56f4` |
| `vendor-photos.json` | 77 CC-licensed demo posts (photo ids from `services/ml/eval/manifest.csv`) | `frontend/scripts/vendor-photos.json` | `fba56f4` |
| `e2e/README.md` | Pre-pivot e2e README (roles, sections) | `frontend/scripts/e2e/README.md` **(copy)** | `80615b2` |
| `e2e/context.mjs` | Shared e2e state (users, modules, cleanup, dates, fixtures) | `frontend/scripts/e2e/lib/context.mjs` **(copy)** | `80615b2` |
| `e2e/sections/anon.mjs` | Signed-out browsing section (multi-vertical) | `frontend/scripts/e2e/sections/anon.mjs` **(copy)** | `80615b2` |
| `e2e/sections/bookings.mjs` | Bookings section with every price type and capacity | `frontend/scripts/e2e/sections/bookings.mjs` **(copy)** | `80615b2` |
| `e2e/sections/events.mjs` | Events-with-friends section | `frontend/scripts/e2e/sections/events.mjs` | `fba56f4` |
| `e2e/sections/messaging.mjs` | Messaging and sharing-cards section (including event cards) | `frontend/scripts/e2e/sections/messaging.mjs` **(copy)** | `80615b2` |
| `e2e/sections/planner.mjs` | AI planner (`POST /plan`) section | `frontend/scripts/e2e/sections/planner.mjs` | `fba56f4` |
| `e2e/sections/posting.mjs` | Posting section (caterer post, occasion plus credits, second listing) | `frontend/scripts/e2e/sections/posting.mjs` **(copy)** | `80615b2` |
| `e2e/sections/preflight.mjs` | Fixture preflight (role listings, caterer…) | `frontend/scripts/e2e/sections/preflight.mjs` **(copy)** | `80615b2` |
| `e2e/sections/rls.mjs` | RLS section (including event fixtures) | `frontend/scripts/e2e/sections/rls.mjs` **(copy)** | `80615b2` |

##### `services/ml-planner/` · 22 files

The AI event planner that used to live in `services/ml/`. It has its own README with restore steps.

| file | what it was | original location | archived in |
|---|---|---|---|
| `README.md` | Archive note, a "here ← came from" table, restore steps, and the original planner README section | new file (embeds the `services/ml/README.md` section) | `80615b2` |
| `.env.example` | ML service env example including the `PLANNER_*` / Anthropic settings | `services/ml/.env.example` **(copy)** | `80615b2` |
| `requirements.txt` | ML requirements including `anthropic` | `services/ml/requirements.txt` **(copy)** | `80615b2` |
| `app/main.py` | ML API as it was, with `/plan`, `/plan/health` and CORS | `services/ml/app/main.py` **(copy)** | `80615b2` |
| `app/config.py` | ML settings as they were, with `PLANNER_*` | `services/ml/app/config.py` **(copy)** | `80615b2` |
| `app/planner/__init__.py` | Planner package doc (text → brief → budget → vendors) | `services/ml/app/planner/__init__.py` | `fba56f4` |
| `app/planner/auth.py` | Verifies the Supabase token on `/plan` | `services/ml/app/planner/auth.py` | `fba56f4` |
| `app/planner/brief.py` | Brief clean-up shared by both engines | `services/ml/app/planner/brief.py` | `fba56f4` |
| `app/planner/budget.py` | Budget split weights per event type | `services/ml/app/planner/budget.py` | `fba56f4` |
| `app/planner/claude.py` | Claude engine (structured brief extraction) | `services/ml/app/planner/claude.py` | `fba56f4` |
| `app/planner/geocode.py` | Place → lat/lng (LA table, then OpenStreetMap) | `services/ml/app/planner/geocode.py` | `fba56f4` |
| `app/planner/rules.py` | Offline rules parser (dates, budgets, guests, places) | `services/ml/app/planner/rules.py` | `fba56f4` |
| `app/planner/schema.py` | `POST /plan` request and response models | `services/ml/app/planner/schema.py` | `fba56f4` |
| `app/planner/search.py` | Compatibility shim to `finders/` | `services/ml/app/planner/search.py` | `fba56f4` |
| `app/planner/service.py` | `/plan` orchestration (understand → split → find) | `services/ml/app/planner/service.py` | `fba56f4` |
| `app/planner/vocab.py` | Event types, vendor categories, style words | `services/ml/app/planner/vocab.py` | `fba56f4` |
| `app/planner/finders/__init__.py` | Finder registry (one per vertical, generic by default) | `services/ml/app/planner/finders/__init__.py` | `fba56f4` |
| `app/planner/finders/base.py` | Shared vendor search and scoring plus Supabase reads | `services/ml/app/planner/finders/base.py` | `fba56f4` |
| `app/planner/finders/generic.py` | Generic finder for any vertical (per price type) | `services/ml/app/planner/finders/generic.py` | `fba56f4` |
| `app/planner/finders/photography.py` | Photography finder (picks a fitting package) | `services/ml/app/planner/finders/photography.py` | `fba56f4` |
| `tests/test_finders.py` | Vertical-aware planner tests (reads `catalog.js`) | `services/ml/tests/test_finders.py` | `fba56f4` |
| `tests/test_planner.py` | Rules engine, budget and Claude request-shape tests | `services/ml/tests/test_planner.py` | `fba56f4` |

##### `supabase/` · 12 files

The four migrations are **reference copies**. The originals stay in `supabase/migrations/`, because migration history must not change. `20261018000000_photography_only.sql` dropped what those migrations created.

| file | what it was | original location | archived in |
|---|---|---|---|
| `seed_all_verticals.sql` | Seed with all 18 verticals, 87 services and every JSON Schema | `supabase/seed.sql` **(copy)** | `80615b2` |
| `migrations/20261010000000_all_verticals.sql` | Pricing units, booking quantities, package minimums, vendor capacity | `supabase/migrations/20261010000000_all_verticals.sql` **(copy)** | `80615b2` |
| `migrations/20261011000100_event_groups.sql` | Events with friends: event chats, invites, candidate board, votes | `supabase/migrations/20261011000100_event_groups.sql` **(copy)** | `80615b2` |
| `migrations/20261011000200_post_credits.sql` | `album_credits` plus occasion tags | `supabase/migrations/20261011000200_post_credits.sql` **(copy)** | `80615b2` |
| `migrations/20261013000000_discover_all_verticals.sql` | `discover_vendors()` vendor-level Discover feed | `supabase/migrations/20261013000000_discover_all_verticals.sql` **(copy)** | `80615b2` |
| `demo/all_verticals_setup.sql` | Paste-ready setup for all verticals (includes the seed) | `supabase/demo/all_verticals_setup.sql` | `fba56f4` |
| `demo/sharing_events_credits_setup.sql` | Paste-ready setup for sharing, events and credits | `supabase/demo/sharing_events_credits_setup.sql` | `fba56f4` |
| `demo/demo_data_all_verticals.sql` | Demo data for photographers plus the vendors of every vertical | `supabase/demo/demo_data.sql` **(copy)** | `80615b2` |
| `demo/remove_demo_data_all_verticals.sql` | Undo script for that demo data | `supabase/demo/remove_demo_data.sql` **(copy)** | `80615b2` |
| `tests/verticals_test.sql` | SQL test: categories, attribute validation, price types, capacity | `supabase/tests/verticals_test.sql` | `fba56f4` |
| `tests/event_groups_test.sql` | SQL test: event chats, invites, board, votes | `supabase/tests/event_groups_test.sql` | `fba56f4` |
| `tests/discover_vendors_test.sql` | SQL test for `discover_vendors()` | `supabase/tests/discover_vendors_test.sql` | `fba56f4` |

**Count check:** 1 + 5 + 11 + 23 + 21 + 8 + 25 + 12 + 22 + 12 = **140** archived files, which matches the 140 `archive/event-platform/` paths in `codemap.json`.
