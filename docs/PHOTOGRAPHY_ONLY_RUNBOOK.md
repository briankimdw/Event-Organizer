# Runbook: switching the hosted database to photography only

The code went back to photography only on 2026-10-18 (see `archive/event-platform/README.md`).
The hosted Supabase project ("Event Organizer", `ktjvbajrfrbwpndforcy`) still has the
other verticals' data until you run these steps. **Do them in this order.** Each step
says what it changes and how to check it.

The apps work before and after: they only show Photo & video listings either way.

Before you start: `services/ml/.env` has `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
(the scripts read the key from there and never print it), and you're in `frontend/`.

## 1. Back up what will be deleted

```
cd frontend
node scripts/backup-nonphoto.mjs --dry-run     # row counts per table, nothing written
node scripts/backup-nonphoto.mjs               # rows + Storage files (a few minutes)
```

- **Changes:** nothing in the database or Storage (read-only).
- **Writes:** `archive/event-platform/data-backup/<timestamp>/` (git-ignored; it holds user data):
  - `tables/<table>.json`: every row the next steps delete or change. That is the listings outside photography (the 32 test vendors, plus the 2 videographers before their merge) with their packages, posts, photos, embeddings, bookings, offers, history, reviews, chats, swipes, follows and shortlist entries; the 32 vendor accounts' own rows; every event with its members, board, votes and chat; post credits and occasion tags; all of `service_categories`.
  - `storage-paths.json` and `files/<bucket>/...`: their Storage files. Add `--no-files` to skip the downloads.
  - `manifest.json`: counts, the reason each table is in it, and any file that failed to download.
- **Check:** the script prints a count per table and ends with the folder name, for example `2026-10-18T19-30-00Z`. Look at `manifest.json` → `storage.failed` (should be empty).
- Copy the folder somewhere safe too if you want a second copy; git never sees it.

## 2. Run the cleanup SQL

1. Open `supabase/demo/photography_only_setup.sql`.
2. In its first statement, replace `'no'` with the backup folder name from step 1:
   `select set_config('photography_only.backup_done', '2026-10-18T19-30-00Z', false);`
   (Without this the file stops at once with "refusing to delete ... without a backup" and changes nothing.)
3. Paste the whole file into the Supabase SQL Editor and run it. It runs as one transaction: if anything fails, nothing changes. Running it again is harmless.

- **Changes** (the migration `supabase/migrations/20261018000000_photography_only.sql` + `supabase/seed.sql`):
  - Videography merges into photography: the vertical is renamed **"Photo & video"**, its JSON Schemas also accept the video fields (`film_minutes`, `highlight_minutes`, `raw_footage`, `styles`, `gear.cameras`, `gear.drones`, `drone_licensed`), the 5 video services (wedding-film, event-recap, social-reels, music-video, drone) move under it, Ana Torres Films and Northbound Media become Photo & video listings, and the videography vertical is deleted.
  - Dropped: `album_credits`, `event_candidates`, `event_candidate_votes`, the events-with-friends functions and triggers, and `discover_vendors()` with its helpers.
  - Deleted: the 32 non-photo listings and everything hanging off them, every event (bookings that were linked to one are kept, unlinked), chat cards that shared their posts or listings, the other 16 verticals and their services, and the occasion tags. Ratings and inbox order are recalculated.
  - Kept: the core schema (categories with schemas, price types, capacity, quantities, share cards, Discover feed) and the empty `events` / `event_members` tables.
  - Records `20261018000000 photography_only` in `supabase_migrations.schema_migrations`.
- **Check:** the last result row of the file. Every column should be `true` and `listings_left` should be **9** (7 photographers + 2 photo & video creators; more if real users made photo listings):
  `one_vertical, named_photo_and_video, fourteen_services, only_photo_listings, no_events, archived_tables_dropped`.

## 3. Delete the 32 vendor test accounts

```
node scripts/delete-nonphoto-users.mjs --dry-run   # who and what, nothing changed
node scripts/delete-nonphoto-users.mjs
```

- **Who:** the accounts in `archive/event-platform/docs/test-users-vendors.json` (caterers, venues, DJs...). Never the photographers, the 2 photo & video creators or the clients in `docs/test-users.json`. It refuses to run while step 2 hasn't been done, and skips any account that still owns a listing.
- **Changes:** per account, its Storage files (`<user id>/` in avatars, portfolio, portfolio-originals, raw-proofs), any booking it made as a client, then the auth user (the profile and the rest of its rows cascade). Then the files listed in the newest backup's `storage-paths.json` that no remaining photo or profile uses (`--backup=<folder>` picks another backup).
- **Check:** it ends with `0 archived vendor account(s) left`. In Supabase → Authentication → Users, searching `example.com` shows 14 test users (7 photographers, 2 creators, 5 clients).

## 4. (Optional) Re-run the seeds

Only needed if you want the demo data fresh or a new environment:

```
node scripts/seed-test-users.mjs        # 14 accounts + 9 Photo & video listings (skips what exists)
```

then paste `supabase/demo/demo_data.sql` into the SQL Editor (packages, hours, bookings, reviews; safe to re-run; undo with `supabase/demo/remove_demo_data.sql`).

## 5. Verify

```
node scripts/e2e/run.mjs --dry-run      # signed-out checks against the real database
node scripts/e2e/run.mjs                # everything, signed in as the test users
```

`--dry-run` should show "Photo & video": 14 live services and only photo & video listings.
Optionally paste `supabase/tests/smoke_test.sql`, `messaging_test.sql`, `share_cards_test.sql`
into the SQL Editor (they roll back; every line should end in `ok`).

## Undo

- Rows: `archive/event-platform/data-backup/<timestamp>/tables/*.json` (re-insert with the service role; ids are kept).
- Files: `.../files/<bucket>/<path>` (upload to the same bucket and path).
- Schema of the dropped features: `archive/event-platform/supabase/migrations/` (write a new migration from them; never re-run an old one).
- Code: git tag `multi-vendor-snapshot`. See `archive/event-platform/README.md`.

## Tested offline

The migration and the setup file were run in PGlite on the full migration chain with the old
seed, the old 46 test users, the old demo data and extra fixtures (posts for photographers, a
videographer and vendors, credits, occasion tags, an event with chat, board, votes and a linked
booking, share cards, swipes, corrections, collections, an inquiry):
- refused without the backup confirmation; ran with it; ran a second time with no changes;
- photography data intact (9 listings, 20 packages, 24 bookings, 28 reviews, posts, ratings); everything non-photo gone;
- the backup script (against an in-memory stand-in for the API) contained every row the migration deleted or changed;
- deleting the 32 accounts afterwards cascaded cleanly (15 users left including Brian's);
- a videographer who also had a photography listing was folded into it (packages, bookings, reviews, follows, attributes);
- the SQL tests (smoke, messaging, feed, matches, share cards, feed v2 smoke) pass after it, and on a fresh database (`supabase db reset` order).
