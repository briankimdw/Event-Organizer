# photographer-match

A marketplace to **find, compare, book and pay photographers and videographers**. Since 2026-10-18 it is **photography only**: one vertical, **"Photo & video"**, where a creator can sell photo and/or video work.

For a while it grew into a multi-vendor event-services platform (caterers, venues, DJs..., events with friends, an AI event planner). That work is archived in [`archive/event-platform/`](archive/event-platform/README.md) (git tag `multi-vendor-snapshot`) so it can come back later.

The main rule across all the docs still holds: **the booking core is category-agnostic.** Providers, packages, availability, bookings and reviews never reference "photographer" directly; a vertical is rows in `service_categories` with schema-validated fields, so another one can return without a schema change.

## Status

| Part | State |
|---|---|
| `frontend/` | React web app, every screen reads from Supabase ([`docs/FRONTEND_DATA.md`](docs/FRONTEND_DATA.md)) |
| `mobile/` | Expo app sharing the web app's data layer ([`mobile/README.md`](mobile/README.md)) |
| Database + auth | Supabase set up and tested (`supabase/`, design in [`docs/DATABASE.md`](docs/DATABASE.md)). Switching the hosted project to photography only: [`docs/PHOTOGRAPHY_ONLY_RUNBOOK.md`](docs/PHOTOGRAPHY_ONLY_RUNBOOK.md) |
| `services/ml/` | SigLIP embeddings + auto-tags for the Discover feed, and the AI photo tools for the editor ([`services/ml/README.md`](services/ml/README.md), API: [`docs/AI_TOOLS.md`](docs/AI_TOOLS.md)) |
| Docs | Two design docs, not yet reconciled (see below). Session-by-session status: [`docs/PROGRESS.md`](docs/PROGRESS.md) |
| Codebase map | Every file: what it's for, when it was made, and where it's used: [`docs/CODEBASE_MAP.md`](docs/CODEBASE_MAP.md) |

## Docs

- [`architecture.md`](architecture.md): service-based backend design. Covers services and their boundaries, the event bus, the booking state machine, payments and escrow, the media pipeline, recommendations, the AI planner, chat contact masking, trust and safety, and build phases.
- [`docs/PLAN.md`](docs/PLAN.md): product and feature spec for the photographer vertical. Covers posting, swipe Discover, profiles, booking flow, delivery galleries, payments, monetization, extra features, and the multi-service event expansion (now archived).
- [`archive/event-platform/README.md`](archive/event-platform/README.md): what the archived event platform contained and how to restore a piece.
- [`orchestrator/README.md`](orchestrator/README.md): plan-driven Claude Code orchestrator. You write and approve a plan in `plans/`, it implements and verifies it locally, then opens a PR for review.

### Open decisions: where the docs disagree

| Topic | `architecture.md` | `docs/PLAN.md` |
|---|---|---|
| Backend | ~8 FastAPI services, Postgres per service, Redis, RabbitMQ/SNS+SQS event bus | Supabase (Postgres, Auth, Storage, Realtime) plus one FastAPI ML service |
| Client | React web (Vite or Next.js); React Native later | Expo mobile-first, plus Next.js web |
| Repo layout | `/services`, `/libs`, `/web`, `/infra` | pnpm + Turborepo: `apps/`, `packages/`, `services/`, `supabase/` |
| Build order | Booking loop first; feed and swipe in phase 3 | Posting and social first; booking in phase 3 |
| Booking states | `requested → accepted → paid → in_progress → delivered → completed` | `requested → (accept, pay deposit) → confirmed → in_progress → delivered → completed` |
| Delivery export | Presigned ZIP, then "Save to Drive/Dropbox" with the user's token; no server-side rclone | rclone worker streams files to Google Drive, Dropbox or OneDrive |
| Contact masking in chat | Hide phone and email until paid, detect and nudge | Not covered |

Both docs agree on Stripe Connect with funds held until delivery, ID verification through Stripe Identity (separate from the paid Pro tier), reviews only after a completed booking, AI-image flagging with RAW-file review, a swappable recommender with exploration and corrections, and an AI planner that can never pay or book on its own.

## Web app

`frontend/` is a Vite + React (JavaScript) app. Every screen reads from and writes to Supabase (data layer: [`docs/FRONTEND_DATA.md`](docs/FRONTEND_DATA.md)). It shows a phone frame on desktop and fills the screen on a phone.

```bash
cd frontend
cp .env.example .env.local   # then fill in the Supabase URL and publishable key
bash ./start                 # npm install when needed, then http://localhost:5173
bash ./start --host          # also reachable from a phone on the same Wi-Fi
```

What it covers:

- **Home:** search, bookings that need action, categories, photographers matched to your taste, available this weekend, top rated nearby.
- **Discover:** swipe deck filtered by category. Each card is a mini portfolio with "why this" reasons, "Not into this" corrections, a taste profile, a shortlist, and a match prompt after you like a photographer twice.
- **Search:** filters (date, price, rating, Verified Pro), sorted by taste match, with list and map views.
- **Provider profile:** badges, availability, packages, gear, reviews, cancellation policy, "Ask a question".
- **Booking:** request flow (package, date, add-ons, travel fee, deposit), status timeline, deposit payment, counter offers, cancellation refunds, disputes.
- **After the shoot:** delivery screen (for now the full gallery is shared through a link in the booking chat) and double-blind reviews.
- **Inbox:** booking threads, inquiries and group chats.
- **Me:** client view (rating, saved items, settings) and provider view (identity verification, payouts, incoming requests, calendar, packages, portfolio upload with EXIF and AI-review flow).

Test accounts and demo data: [`docs/test-users.md`](docs/test-users.md). End-to-end checks against the real database: [`frontend/scripts/e2e/README.md`](frontend/scripts/e2e/README.md).

## Backend

`backend/` is a FastAPI app (port 8001; the ML service uses 8000) used for booking gallery uploads, with its own sign-in checks ([`backend/AUTH.md`](backend/AUTH.md)). Start it with `bash backend/start` (it needs `backend/.env` with `SUPABASE_URL` and `SUPABASE_KEY`). The wider service split in `architecture.md` is still an open decision (see above).

## Working in this repo

- Two people work in this repo, so push work to a branch and open a pull request instead of pushing straight to `main`.
- Don't commit secrets. `.env` is already ignored.
