# Progress Log

Where the project stands, what was decided, and what's next. Update this file at the end of each work session.

**Last updated:** 2026-10-08

---

## Snapshot

| Area | State |
|---|---|
| Product plan | `docs/PLAN.md` (features) and `architecture.md` (Tim's service design). They still disagree on a few points, listed in the README. |
| Frontend | Clickable **React web prototype** in `frontend/`. **Sign-in and posting photos work against Supabase** (branch `posting`); everything else still runs on mock data. |
| Database + auth | **Supabase project "Event Organizer" is set up and tested** (phases 0–2). Design and status: `docs/DATABASE.md`. |
| Discover ML (SigLIP) | Photo embeddings, auto-tags and the `discover_feed()` ranking are built and tested (branch `siglip`). The Discover screen isn't connected to them yet. |
| Payments (Stripe) | Not started |
| Mobile app (Expo / React Native) | Not started. The web prototype is the reference design. |

---

## Done

### Frontend prototype (`frontend/`, on `main`)
Vite + React (JavaScript), mobile-first and shown in a phone frame on desktop. All data comes from `src/data/mock.js`.

- **Home:** search bar, bookings that need action, categories, photographers matched to your taste, available this weekend, top rated nearby.
- **Discover:** swipe deck by category. Tap the edges for more photos (wraps around), see "why this" reasons, use "Not into this" corrections, view your taste profile and shortlist, and get a match prompt after two likes.
- **Search:** text search, date picker ("free on your dates"), category chips, Filters sheet (price, rating, distance, Verified Pro, ID verified), Sort, and list or map view.
- **Profiles:** photographer pages with an album grid, packages, gear, reviews, availability, and "Your dates" when you arrive from a date search.
- **Album viewer** (Reels-style): swipe left/right within an album and up/down between albums. Close by swiping right on the first photo, dragging anywhere off the photo, or tapping ✕. Pinch, double-tap or Ctrl+scroll to zoom. Press and hold to hide the UI.
- **Bookings:** month calendar with status dots, then pick dates and find who's free. Also: a "Needs your attention" list, an upcoming timeline, past bookings, booking detail (state machine, deposit, counter offers, cancel with refund policy, dispute), delivery gallery, and double-blind reviews.
- **Me:** one profile page with a Hiring / Photographer role switch, client and photographer ratings, the provider setup checklist, requests, calendar, packages and portfolio. Settings has its own screen.
- **Inbox:** booking threads, inquiries and group chats.

Run it: `cd frontend && npm install && npm run dev`, then open http://localhost:5173. Add `-- --host` to test on a phone on the same Wi-Fi.

### Database (`supabase/`, on branch `database-setup`)
Applied to the hosted project `ktjvbajrfrbwpndforcy` (us-east-1, Postgres 17):

- **35 tables**, all with Row-Level Security on: profiles, categories, providers, packages, availability, albums/photos, events, bookings, offers, history, conversations/messages, reviews, swipes, shortlist, collections, follows, notifications, reports, blocks.
- **Multi-vendor ready:** photography's custom fields live in JSON Schemas on the category, so adding DJs or caterers means adding rows, not tables. `events` already exists and bookings can belong to one.
- **Auth:** a profile row is created automatically on signup. Everyone is a client; `become_provider()` creates a photographer listing. Providers can't mark themselves verified or Pro.
- **Bookings:**
  - The database makes double-booking impossible.
  - Status changes only go through functions: `request_booking` (several dates at once), `respond_to_booking` (accept, decline or counter), `respond_to_offer`, `cancel_booking` (returns the refund % from the policy), `mark_delivered`, `accept_delivery`.
  - `search_providers(dates, category, …)` powers "who's free on these dates."
- **Other functions:** `start_inquiry`, `submit_review` (double-blind; ratings update when reviews are revealed). Every booking gets a chat thread automatically, and messages update live (Realtime).
- **Scheduled jobs:**
  - expire unanswered requests after 48h
  - start shoots at their start time
  - auto-complete deliveries after 7 days
  - reveal reviews after 14 days.
- **Storage buckets:** `avatars`, `portfolio` (public); `portfolio-originals`, `raw-proofs` (private). Users can only write to their own folder.
- **Reference data:** the Photography category and 9 services; Flexible, Moderate and Strict cancellation policies.
- **Tested:**
  - `supabase/tests/smoke_test.sql` passes 22/22: signup, provider onboarding, schema validation, self-verify blocked, date search, booking, double-booking rejected, privacy between users, the full accept → deliver → complete flow, the history log, chat, double-blind reviews, ratings, cancellation, and logged-out visibility. It rolls back, so it leaves no data.
  - A separate check using only the browser's publishable key confirmed what logged-out visitors can and can't do.
- **Frontend hookup (groundwork only):**
  - `@supabase/supabase-js` is installed, and the client is in `frontend/src/lib/supabase.js`.
  - Generated types are in `frontend/src/lib/database.types.ts`.
  - Keys go in `frontend/.env.local`, which is git-ignored; `frontend/.env.example` is the template.

### Sign-in (branch `sign-in`, built on `database-setup`)
- **Sign-in screen** (`/sign-in`):
  - **Log in** and **Create account** tabs, with email and password.
  - New accounts confirm their email first (Supabase's "Confirm email" setting is on), and the screen can resend the confirmation.
  - Signing up with an email that already has an account switches to Log in with a note.
  - "Forgot password?" emails a reset link.
  - "Email me a sign-in link instead" keeps the passwordless option (link or code).
  - "Continue with Google" (switched on). The screen checks the project settings, so if Google is ever turned off nobody lands on an error page.
- **New password page** (`/reset-password`): where reset links land. It's also reachable from Settings → Set or change password, which accounts created with an email link need in order to start logging in with a password.
- **Link landing page** (`/auth/callback`): where email links and Google send people back. It shows a friendly message if a link has expired.
- **Welcome step** (`/welcome`): new accounts choose a display name and username, saved to `profiles`. Taken usernames are caught.
- **Me tab:**
  - Signed out: a sign-in prompt.
  - Signed in: the real name, username, city, bio and client rating from the database. "Edit profile" saves to Supabase.
  - The rest of the tab (photographer stats, requests and so on) is still mock data.
- **Elsewhere:** Settings → Log out signs out for real. Sending a booking request while signed out goes to sign-in, then back to the same form.
- **Code:** `src/auth.jsx` (`AuthProvider` / `useAuth`: session + profile), plus `SignIn.jsx`, `AuthCallback.jsx` and `Welcome.jsx`.
- **Tested in Chrome:** signed-out Me, the sign-in screen, the Google-off state, email validation, the booking gate, the welcome redirect and the expired-link message. The real email round-trip hasn't been tested yet; it needs the dashboard settings below.

### Posting photos (branch `posting`, built on `sign-in`)
- **Where to post:** a **Post** button on Home, a **+** on the Profile header, and "Post photos" in Photographer → Portfolio.
- **First-time setup:** you create a photographer profile (name clients see, profile link, city, what you shoot). It is created with `become_provider` and published right away, since albums belong to a photographer listing.
- **Posting:** single photo, album (up to 10) or before/after. You add a title, category, caption, location and date. Camera settings are read from the photo (`exifr`), and each one can be hidden.
- **Photo handling:**
  - The public copy is resized to 2048px and re-encoded as JPEG, which removes all metadata including GPS. It goes to the `portfolio` bucket.
  - The untouched original goes to the private `portfolio-originals` bucket.
  - The album and photo rows are saved to the database. If anything fails partway, everything uploaded so far is removed.
- **Your posts:** the Portfolio tab shows your real albums. `/my-work` opens them in the full-screen album viewer, which became a reusable `AlbumViewer` component.
- **Code:** `src/api/portfolio.js` (data layer), `src/lib/images.js` (photo processing), plus `Upload.jsx` and `MyWork.jsx`.
- **Tested:**
  - A rolled-back database test passes 7/7: publish the listing, album/photo/cover save, upload allowed to your own folder only, others can't add to your album, the public can see it, hidden settings aren't exposed.
  - In Chrome: a 4000px test image became a 2048px JPEG with no metadata.
  - Not yet tested: a real end-to-end post from a signed-in browser, and reading settings from a real camera file.
- **Not yet:** watermarking, the AI-image check, editing or deleting posts, and showing real photographers on Home, Search and Discover (those are still mock).

### Discover ML: SigLIP (branch `siglip`, built on `posting`)
- **`services/ml/`**, a Python service using `google/siglip-base-patch16-224` (open weights, runs locally, no API fees). For each photo it produces a 768-number embedding (its visual style) and auto-tags (color, light, mood, style, subject). Black & white is detected from the pixels.
- **Database** (2 migrations): pgvector, `photo_embeddings` (server-only), `photos.auto_tags`, `ml_pending_photos` / `ml_save_photo_analysis` (service role only), and **`discover_feed()`**. The feed:
  - builds a taste from your likes and saves, nudged away from passes
  - ranks unseen photos by similarity, one per album, alternating photographers
  - mixes in about 15% "something new"
  - respects "Not into this"
  - explains each pick ("Because you liked golden hour shots")
  - shows the newest photos to users with fewer than 3 likes.
- **Running it:** `python -m app.worker` (polls for new photos), or the FastAPI app (`/process-pending` for a Supabase webhook). See `services/ml/README.md` for setup and hosting options.
- **Tested:**
  - Feed test passes 10/10 (`supabase/tests/feed_test.sql`).
  - 6 unit tests pass.
  - On 11 sample photos the tags and "most similar" results were sensible, and the text search "moody black and white city" found the right photo.
  - The API endpoints work.
  - The worker hasn't yet run against the real database; it needs the service role key in `services/ml/.env`.
- **Next:** connect the Discover screen (log swipes to `swipes`, get cards from `discover_feed`), and add a "% match" for photographers based on the same taste vector.

---

## Decisions made (defaults; revisit with Tim)

1. **One Supabase project** for everything, not a database per service. This differs from `architecture.md`.
2. **Sign-in:** email + Google at launch; add Apple before an iOS release.
3. **Only providers post albums.** Clients get saves, collections and a shortlist.
4. **One booking = one continuous time slot on one day.** Multi-day jobs are several bookings, matching the multi-date request flow.
5. **USD only** at launch; money is stored in integer cents.
6. **Albums publish immediately** until the upload pipeline (watermarking, EXIF, AI check) exists. Then they'll start as `processing`.
7. **Frontend stays React web for now.** Switch to Expo when the design stops changing and real development starts (see the chat notes in the README's open decisions).

---

## Open items / known issues

- **Test users:** 12 fake accounts (7 photographers, 5 clients) with their logins are in `docs/test-users.md` / `docs/test-users.json`, which are public in the repo. Create them all with `cd frontend && node scripts/seed-test-users.mjs --with-photos` (needs the service role key in `services/ml/.env`). **Delete them before launch.**

- **ML worker setup:** put `SUPABASE_SERVICE_ROLE_KEY` and `ML_WEBHOOK_SECRET` in `services/ml/.env` (template: `.env.example`), then run `python -m app.worker --once` after posting photos. Choose a host later (see `services/ml/README.md`).
- **Supabase advisor:** turn on *leaked password protection* (Authentication → password security), now that accounts use passwords. It may require a paid plan.

- **Supabase Auth dashboard settings (needed for sign-in to work end to end):**
  - Authentication → URL Configuration: Site URL `http://localhost:5173`. Redirect URLs: `http://localhost:5173/**`, plus your computer's network address (e.g. `http://10.250.251.86:5173/**`) for phone testing.
  - Authentication → Emails → Magic Link template: add `{{ .Token }}` so the email includes the code as well as the link.
  - ~~Google~~ **done 2026-10-08.** The provider is on and Supabase forwards to Google's login page; the app's Google button is active. While the Google consent screen is in *Testing* mode, only the test users added in Google Cloud can sign in. Publish the consent screen before launch.
  - Supabase's built-in email only sends to team members of the project. Invite Tim, or set up your own SMTP (e.g. Resend), before other people can sign in.

- **Not merged yet:** the database work is on branch `database-setup`. Open a PR to merge it into `main`.
- **Optional, not applied:** `supabase/pending/split_owner_policies.sql`, a performance tidy-up flagged by Supabase. It was declined when proposed; apply it later as a new migration if wanted.
- **The frontend isn't wired to the database.** Screens still read `mock.js`.
- **No demo data in the database.** Photographers, packages and albums need real accounts; create them by signing up test users once sign-in exists.
- **Tim** still needs to be invited to the Supabase organization.
- **CLI link:** each machine needs `npx supabase login` and `npx supabase link --project-ref ktjvbajrfrbwpndforcy` before `db push`.
- **Local `main` on Brian's machine** has a stale, unpushed "read me" commit that accidentally includes `frontend/node_modules`. Reset it with `git checkout main && git reset --hard origin/main`. Nothing on GitHub is affected.
- **Docs disagree:** `docs/PLAN.md` and `architecture.md` still differ on stack, build order and booking states (see the table in the README).

---

## Next steps (suggested order)

1. Merge `database-setup` into `main`, and invite Tim to Supabase.
2. ~~Sign-in screen~~ (done on branch `sign-in`). Finish the dashboard settings above, then merge.
3. Replace mock data screen by screen: categories + Search (`search_providers`), then profiles/packages/albums, then the booking request flow (`request_booking`), then Bookings, then Inbox (Realtime).
4. Provider onboarding: `become_provider`, packages, availability, album upload to Storage.
5. Stripe phase: payments/payouts/disputes tables, Connect onboarding, Stripe Identity, webhooks (Edge Functions), deposit → `confirmed`.
6. Decide on Expo vs. web for the production app, and settle the remaining doc disagreements with Tim.

---

## Useful references

- Supabase project: "Event Organizer", ref `ktjvbajrfrbwpndforcy`, dashboard at supabase.com → Event Organizer
- Database design + status: `docs/DATABASE.md`
- Schema: `supabase/migrations/`; reference data: `supabase/seed.sql`; test: `supabase/tests/smoke_test.sql`
- Feature plan: `docs/PLAN.md`; service architecture: `architecture.md`
