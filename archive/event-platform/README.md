# Archive: the multi-vendor event platform

On **2026-10-18** photographer-match went back to **photography only**: one vertical,
**"Photo & video"** (slug `photography`), for creators who sell photo and/or video work.
Everything that only served the wider event-services marketplace was moved here. It is
**kept for later, not built, not tested and not imported** by the apps.

**The full previous state is the git tag `multi-vendor-snapshot`** (commit `c7028db`): every
file below sits there in its original place, working together. Use the tag when you want
to see or run the old app; use this folder to find pieces quickly.

## What was archived

| Feature | What it was |
|---|---|
| 17 other verticals | Venues, catering, private chefs, cakes, bar, DJs & music, entertainment, florals, decor, hair & makeup, rentals, planners, officiants, transportation, event staff, wellness (videography was merged into Photo & video instead) |
| Events with friends | `/events`: an event with its own group chat, invites, a "Who we're hiring" board with votes, bookings linked to the event, event share cards |
| AI event planner | `POST /plan` in the ML service + the Planner screen: budget split per occasion, vendor finders per vertical, Claude or a rules parser |
| Occasions + service browse pages | `/occasions/:slug`, `/services/:vertical`, occasion tags on posts |
| Post credits | Tagging the other vendors who worked an event on a post (`album_credits`), "Tagged in" on profiles |
| Vendor cards in Discover | `discover_vendors()`: swiping vendors without posts, every vertical in the deck picker |

## What's here

| Folder | Contents | Came from |
|---|---|---|
| `frontend/src/` | Screens, components, API modules and vertical configs of the archived features (`verticals/catalog.js` with the 18 verticals and 10 occasions) | `frontend/src/` |
| `mobile/src/` | The Expo screens of the archived features | `mobile/src/` |
| `services/ml-planner/` | The AI planner (`app/planner/`), its tests, and `main.py` / `config.py` / `.env.example` / `requirements.txt` as they were with `/plan`. Own README. | `services/ml/` |
| `supabase/migrations/` | **Copies** for reference of `20261010000000_all_verticals`, `20261011000100_event_groups`, `20261011000200_post_credits`, `20261013000000_discover_all_verticals`. The originals stay in `supabase/migrations/` (migration history must not change). | `supabase/migrations/` |
| `supabase/seed_all_verticals.sql` | The seed with all 18 verticals, 87 services and every JSON Schema | `supabase/seed.sql` |
| `supabase/demo/` | `all_verticals_setup.sql`, `sharing_events_credits_setup.sql` (paste-ready setup files), `demo_data_all_verticals.sql`, `remove_demo_data_all_verticals.sql` | `supabase/demo/` |
| `supabase/tests/` | `verticals_test.sql`, `event_groups_test.sql`, `discover_vendors_test.sql` | `supabase/tests/` |
| `scripts/` | `seed-vendor-photos.mjs` + `vendor-photos.json` (77 CC-licensed demo posts for the vendors); `e2e/` the e2e sections for events, the planner, the caterer (capacity, per-person pricing, posting with occasions and credits, a second listing) and the old README / roles | `frontend/scripts/` |
| `docs/` | `EVENT_PLATFORM_PLAN.md`, `VERTICALS.md` (how to add a vertical), `test-users-vendors.json` (the 32 test vendors, **without passwords**: their accounts are deleted); `QA_CHECKLIST.md` and `UI_SWEEP.md`, the web QA and UI overflow sweep records of the multi-vendor app (2026-10-10/11, moved 2026-10-20) | `docs/` |
| `data-backup/` | **Not in git** (`.gitignore`). Created by `frontend/scripts/backup-nonphoto.mjs`: the deleted rows as JSON and their Storage files, one folder per run | the hosted database |

## What stayed (on purpose)

The database schema stays multi-vertical so a vertical can come back **as data**:
`service_categories` with per-vertical JSON Schemas, `providers.vertical_id`,
`providers.max_concurrent` and the slot-based capacity rule, every price type
(`fixed`, `hourly`, `per_person`, `per_item`, `daily`, `quote`), `packages.min/max_quantity`,
`bookings.quantity`, share cards (post, vendor, event), and the Discover feed functions.
The `events` and `event_members` tables, `bookings.event_id`, conversation kind `'event'`
and `messages.shared_event_id` also stay (empty). Only `album_credits`, `event_candidates`,
`event_candidate_votes`, the events-with-friends functions/triggers and `discover_vendors()`
with its helpers were dropped. Details: `supabase/migrations/20261018000000_photography_only.sql`.

## How the cleanup was done

See `docs/PHOTOGRAPHY_ONLY_RUNBOOK.md`: back up (`backup-nonphoto.mjs`) → paste
`supabase/demo/photography_only_setup.sql` → delete the 32 vendor accounts
(`delete-nonphoto-users.mjs`).

## How to restore a piece

General rule: take the files from the tag (`git checkout multi-vendor-snapshot -- <path>`)
or from here, then re-wire what the photography-only work removed. Never re-run an old
migration: write a new one.

- **A vertical (e.g. catering):**
  1. Add its `service_categories` rows (vertical + services + schemas) from
     `supabase/seed_all_verticals.sql` to `supabase/seed.sql` and run it.
  2. Restore its entry in the app catalog (`frontend/src/verticals/`; the old
     `catalog.js` and `<slug>/config.js` are in `frontend/src/verticals/` here).
  3. Test vendors: give the matching entries in `docs/test-users-vendors.json` new random
     passwords, add them under `"vendors"` in `docs/test-users.json` and run
     `node scripts/seed-test-users.mjs` (it still handles a `vendors` list with a `vertical` each).
  4. Demo data: copy that vertical's parts of `supabase/demo/demo_data_all_verticals.sql`.
  5. `docs/VERTICALS.md` here is the full checklist.
  6. Old rows (listings, posts, bookings...) are in the `data-backup/<timestamp>/tables/*.json`
     files; re-insert what you need with the service role (ids are preserved in the JSON).
- **Events with friends:** write a new migration from `supabase/migrations/20261011000100_event_groups.sql`
  (the tables `events` / `event_members` still exist; re-create `event_candidates`, the votes,
  the functions and triggers), then restore the screens from `frontend/` and `mobile/` here and
  the e2e section `scripts/e2e/sections/events.mjs`.
- **Post credits:** new migration from `20261011000200_post_credits.sql`, plus
  `frontend/src/api/portfolio.credits-and-occasions.js` and `components/upload/Credits.jsx`.
- **AI planner:** see `services/ml-planner/README.md`.
- **Vendor cards in Discover:** new migration from `20261013000000_discover_all_verticals.sql`
  and the Discover components here.
