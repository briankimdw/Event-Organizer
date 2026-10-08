# Service Marketplace Plan (Photographers First)

## Context
This is a greenfield repo (`C:\Users\Brian\photographer-match`, empty). The goal is a platform where people **find, compare, book and pay service providers**.

- **Launch vertical:** photographers. The social side is portfolio posts with gear and settings, plus a swipe-based taste recommender.
- **Later:** expand to every vendor type for an event (musicians, caterers, makeup artists, florists, venues…). An **AI event planner** will plan and book a whole event within a budget, and the user approves and pays every booking.

**Stack decisions:** Expo (React Native) mobile-first, Next.js web, Supabase (Postgres, Auth, Storage, Realtime, pgvector), a Python FastAPI ML service and a 2-person team.

**Most important architectural rule:** build the booking core **category-agnostic from day 1**. Use `providers`, `service_categories`, `packages`, `availability`, `bookings` and `reviews`, not photographer-specific tables. Photography is the first category, with its own extra fields. Every later vertical then reuses the same engine.

---

## 1. Feature Spec: Photographer Vertical

### 1.1 Posting work
- Single photos or **carousels** (up to 10 images).
- **Before/after posts:** paired images with a slider viewer to show off editing skill (`photos.pair_role = before|after`).
- **Gear and settings** auto-extracted from EXIF: body, lens, focal length, aperture, shutter, ISO, flash and date. Users can edit or hide fields.
  - EXIF strings are fuzzy-matched to a normalized `gear_items` catalog.
  - **GPS is stripped from files by default.**
- **Tags:** genre (portrait, street, wedding, landscape…), user tags and ML auto-tags (subject, colors, mood).
- **Location:** city or a named spot. An optional pin links the post to a Photo Spot (see §4).
- **Watermark option:** per post or as a profile default. A watermark is burned into the display variants; originals stay private and are never served publicly.
- **AI-generated image detection:**
  - Every upload runs through a detector (**model TBD**, behind a `detector` interface).
  - Scores above a threshold go to a **manual review queue**. The owner can submit the **RAW file** (CR3/NEF/ARW/DNG) as proof.
  - Reviewers compare the RAW's EXIF, maker notes and content, then approve with a **"Real Photo" label** or mark it AI-generated.
  - RAW proofs are stored in a private bucket and auto-deleted after review.

### 1.2 Swipe Discover (recommendation model is TBD)
- A card deck: right = like, left = pass, up = save, tap = details and EXIF.
- Requirements the eventual model must meet:
  - **learn taste** from swipes;
  - include **exploration** (a reserved share of new or unfamiliar styles) so the feed does not over-fit;
  - provide **explanations** ("Because you liked moody, low-light street shots");
  - accept **user corrections** ("Not into this: [black & white] [wide-angle] [this photographer]"), which feed back as strong negative signals.
- **What we build now, before choosing the model:**
  1. Log every swipe, dwell time, position, session and correction to an append-only `swipes` table. This becomes the training data for any future model.
  2. Store a content embedding plus auto-tags for every photo, which any model can use.
  3. Put a `Ranker` interface in the ML service (`get_feed(user_id, n) → [photo_id, reason]`) so models can be swapped and A/B tested.
  4. Ship a simple baseline: a taste-vector cosine plus a 15% exploration slot, tag-based reasons and diversification. Replace it once the model is chosen (options are listed in Appendix A).
- The same taste profile later ranks **photographers for hire**, matching clients to photographers whose style they like. This is the link between the social side and the booking side.

### 1.3 Profiles
- **Provider profile:**
  - portfolio grid, gear bag (bodies and lenses), bio, location and specialities;
  - **pricing and packages** (if offering services) and **service area** (home base plus radius, or a list of regions);
  - an availability preview and an identity-verified badge;
  - the Verified Pro badge (paid, see §3);
  - a rating summary.
- **Client profile:** name, avatar, rating as a client, saved items and collections.
- **Two-sided ratings (like Uber):**
  - After a booking reaches `completed`, **both parties** can review each other within 14 days.
  - Reviews are tied 1:1 to a booking. A review is impossible without a paid, completed booking, which blocks fake and bot reviews.
  - Both reviews are revealed at once (double-blind) so neither side can retaliate.
  - Providers can see client ratings when deciding whether to accept a request.

### 1.4 Sharing and social
- Follow and following; likes, comments and saves to Collections.
- **DMs:** 1:1 and group, on Supabase Realtime. Users can share posts, profiles and gear pages into a DM.
- **"Contact / Ask a question"** on provider profiles opens a DM inquiry. This also appears in the provider's CRM inquiries (§4).
- External share: deep links (`/p/{id}`, `/u/{username}`) with Open Graph preview cards, served by Next.js. Universal links open the app.
- Block and report on every user, post, comment and message.

### 1.5 Identity verification (separate from the paid Verified Pro tier)
- **Purpose:** trust and safety, so the person matches their ID.
- **Required** before a provider can accept paid bookings or receive payouts.
- **Method:** **Stripe Identity**, which does a government ID check plus a selfie liveness match against the ID photo. Stripe handles biometric data, so we store only the verification status and ID, not images.
- The privacy policy must disclose biometric processing. Laws such as Illinois BIPA, Texas and Washington require explicit opt-in consent and a retention schedule.
- Stripe Connect's own KYC also covers payout identity.
- **Optional for clients.** A "Verified client" badge increases provider trust.

### 1.6 Services and booking
- **Service categories (photography):** wedding, graduation, portrait, event, real estate, product, headshots, plus coaching and meetups (see §4).
- **Packages:**
  - price type (fixed, hourly or quote-based);
  - included hours, number of edited photos, editing level, turnaround days and deliverables;
  - add-ons (extra hour, second shooter, rush delivery, prints);
  - deposit % and a travel fee beyond the service radius.
  - Category-specific fields are validated against the category's JSON schema (see §2).
- **Availability calendar:** working hours, blackout dates and buffer time between bookings. Accepted bookings automatically block the calendar. Optional Google/Apple calendar sync comes later.
- **Booking flow** (state machine):
  `requested` → provider can `decline`, `counter` (custom quote) or `accept`
  → client pays deposit → `confirmed` (calendar slot locked)
  → event date → `in_progress`
  → provider uploads photos → `delivered`
  → client accepts, or 7 days pass → `completed` → funds released and reviews open.
  - The side branches are `cancelled_by_client`, `cancelled_by_provider`, `disputed` and `refunded`.
  - Requests expire if the provider does not respond within 48h.
  - The calendar slot is held tentatively during `requested` to prevent double booking (an exclusion constraint on the time range).
- **Messaging** happens in a booking thread: the DM conversation linked to `booking_id`.
- **Photo delivery:**
  - A private delivery gallery per booking. The client can view, favorite and download single photos or a zip.
  - Files are kept for **X days**: the default is 30, and providers can pay to extend under Pro. Expiry warning emails go out at T-7 and T-1 days.
  - **Export to the client's own cloud:**
    - Native one-click export to **Google Drive, Dropbox and OneDrive** through their OAuth APIs. A background worker streams files from Storage to the user's cloud.
    - Internally the worker can use **rclone** (rclone `rcd` in a container, with per-job remote configs built from the user's OAuth token). This gives one code path for 40+ providers.
    - Advanced users get presigned S3-compatible URLs, plus copy-paste rclone instructions.
- **Payments (Stripe Connect Express):**
  - **Hold funds until delivery:** use **separate charges and transfers**. The client is charged to the platform account. A transfer to the provider (minus commission) runs only when the booking hits `completed`.
  - The deposit is charged at booking and the balance is charged X days before the event; both are held.
  - Alternatively, a portion such as 50% of the deposit can be released at `confirmed` to help providers' cash flow. This is configurable.
  - **Risk:** long holds (weddings booked a year out) need a check with Stripe and legal on hold limits, refund windows and money-transmission rules. Fallback: charge the deposit at booking and set the connected account's payouts to manual with a delay.
  - **Cancellation policies** are set by the provider from tiers (Flexible, Moderate, Strict, Custom), showing the refund % by days before the event. The policy is shown before payment and snapshotted onto the booking.
  - **Disputes:**
    - The client opens a dispute before `completed` (or within 7 days of delivery). This freezes the transfer.
    - Both sides upload evidence, and an admin decides: full release, partial refund or full refund.
    - Card chargebacks (`charge.dispute.created`) are handled through the same admin queue.
  - Commission is applied when the transfer amount is computed (the total minus the platform fee).
- **Data policy:** a written retention schedule covering delivery galleries (X days), RAW proofs (deleted after review), DMs, identity verification (status only), deleted accounts (purged within 30 days) and backups. In-app account deletion is required by Apple and Google.

---

## 2. Architecture

```
photographer-match/                 pnpm + Turborepo monorepo
├─ apps/
│  ├─ mobile/   Expo + Expo Router, Reanimated/Gesture Handler (swipe), expo-image,
│  │            @stripe/stripe-react-native, TanStack Query, Supabase JS
│  └─ web/      Next.js: public profiles/posts (SEO + OG), checkout pages,
│               Stripe onboarding return, provider dashboard, /admin
├─ packages/
│  ├─ shared/   zod schemas, generated DB types, category field schemas, constants
│  ├─ api/      typed query helpers + React Query hooks used by both apps
│  └─ ui/       design tokens
├─ services/
│  ├─ ml/       FastAPI: embeddings, auto-tag, AI-detection, NSFW, pHash, Ranker
│  └─ workers/  delivery export (rclone), zip builder, watermarking, retention cleanup
└─ supabase/
   ├─ migrations/   schema, RLS, pgvector, booking state functions
   ├─ functions/    Edge Functions: stripe-webhook, payments, identity, push, affiliate-redirect
   └─ tests/        pgTAP RLS + booking state tests
```

**Generic marketplace data model (key tables)**

| Area | Tables |
|---|---|
| Users | `profiles` (role flags: is_provider, is_admin), `identity_verifications` (status, stripe_vs_id), `pro_subscriptions` |
| Categories | `service_categories` (slug, parent, name, `field_schema` jsonb for category-specific package fields, e.g. photography: edited_photo_count, editing_level; caterer later: per_head_price, dietary_options) |
| Providers | `providers` (profile_id, stripe_account_id, service_area geo + radius_km, cancellation_policy, verified_pro), `provider_categories` |
| Offerings | `packages` (provider_id, category_id, price_type, price_cents, deposit_pct, duration, `attributes` jsonb validated by category schema), `package_addons` |
| Calendar | `availability_rules`, `blackouts`, `calendar_holds` (tstzrange, with an exclusion constraint against overlaps) |
| Booking | `bookings` (client, provider, package, `event_id` nullable, time range, location, status, totals, policy_snapshot), `booking_events` (audit log of state changes) |
| Money | `payments` (charge/refund, stripe ids), `transfers`, `disputes` (+ `dispute_evidence`) |
| Delivery | `deliveries` (booking_id, expires_at), `delivery_files`, `export_jobs` (target: gdrive/dropbox/onedrive, status) |
| Reviews | `reviews` (booking_id, author_id, subject_id, direction provider→client or client→provider, rating, text, revealed_at) |
| Social | `posts`, `photos` (pair_role, watermark, ai_score, authenticity_status), `photo_exif`, `photo_embeddings` (pgvector), `tags`, `follows`, `likes`, `comments`, `collections`, `conversations`, `messages`, `reports`, `blocks`, `notifications` |
| ML | `swipes`, `feedback_corrections`, `user_taste`, `ai_review_cases` (+ RAW proof path) |
| Gear | `gear_items`, `gear_ownership` (verified via EXIF), `gear_reviews`, `affiliate_clicks` |
| Events (Phase 6) | `events` (owner, type, date, guest_count, location, budget_cents), `event_needs` (category, budget_allocation, status, booking_id) |

- Row-Level Security applies everywhere.
- Booking and payment state changes happen **only** through server-side functions (Edge Functions or Postgres RPCs), never through direct client updates.

**Async pipeline:**
1. Upload goes to Storage, and a post is inserted as `processing`.
2. A DB trigger enqueues a job (Supabase Queues/pgmq).
3. ML and workers run variants, watermark, blurhash, embedding, tags, NSFW, AI-detection and the pHash duplicate check.
4. The post becomes `published`, `flagged` or `under_ai_review`.

**Hosting:**
- Supabase.
- Vercel for web.
- ML and workers on Fly.io, Modal or Railway (Docker).
- EAS Build, Submit and Update for mobile.
- Sentry and PostHog (analytics plus feature flags for ranking A/B tests).
- Resend for email.

---

## 3. Monetization
1. **Booking commission:** a platform fee on every transfer, about 10% to start. Promo rates are possible for early providers.
2. **Verified Pro (paid badge tier):**
   - Joining is free for everyone at launch to grow supply.
   - Pro adds a badge, a "Verified Pro" filter, a ranking boost in Hire search, more uploads, analytics, business tools, longer delivery storage and a custom portfolio link.
   - This is **separate** from identity verification, which is free and required to get paid.
   - Boosted placement must be labeled ("Promoted" or "Pro") to stay honest and FTC-compliant.
3. **Affiliate links:** gear pages and posts get a "Buy" button through the `affiliate-redirect` function, which logs the click and redirects with a tag. Partners include Amazon, B&H, Adorama and KEH. Each gets an FTC disclosure.
4. **Advertising spots:** providers pay for promoted placement in Hire results or a sponsored card in Discover (clearly labeled).
5. **Brand sponsorships:** camera brands sponsor challenges or contests and gear guides.
6. **Later:** a used-gear marketplace fee, paid tutorials and coaching commission.

**Note:** Pro is a digital subscription. On iOS and Android it must go through in-app purchase, or be sold on the web only. Bookings are real-world services, so Stripe is allowed there.

---

## 4. Extra Features (post-core)
- **Community:**
  - **Photo challenges and contests:** themed (for example "Golden hour", "Shot on 35mm"), with community voting (one vote per account, verified accounts only, anti-brigading).
  - Brand-sponsored prizes.
  - **Feedback requests:** a "Critique me" post type with structured feedback prompts (composition, exposure, edit).
  - **Tutorials:** a long-form post type covering the thought process, settings, lighting diagram and before/after.
  - **Meetups and coaching:** list them as a bookable service category. This reuses the booking engine at no extra cost.
- **Gear:**
  - Gear pages (every photo shot with a lens, typical settings).
  - **Gear reviews from verified owners.** Ownership is verified when the user has posted photos whose EXIF shows that body or lens.
  - **Gear comparison** (specs plus side-by-side sample photos).
  - **Used gear marketplace** (later; it needs escrow and shipping, but can reuse the hold-funds payment flow).
- **Discovery:**
  - **Photo spot map:** clustered pins of spots, with photos, best time of day and common settings.
  - **Settings search:** "f/1.2", "long exposure > 1s", "ISO 6400+", "shot on X100V".
- **AI:**
  - AI-image detection with a "Real Photo" label (§1.1).
  - Auto-tagging (genre, subject, colors).
  - **AI shooting suggestions:** on a photo, Claude vision plus EXIF generates tips such as "try a slower shutter to blur the waterfall".
- **Business tools (Pro):**
  - invoicing, for off-platform clients too, via Stripe Invoicing;
  - an earnings dashboard (gross, fees, payouts, by month and category);
  - a **CRM** (client list, inquiries from DMs, pipeline stages, follow-up reminders and notes).

---

## 5. Expansion: Multi-Service Event Platform

- **The "Event" object:**
  - A user creates an event: type (wedding, birthday, graduation, corporate…), date, location, guest count and **total budget**.
  - The event holds `event_needs` (photographer, musician, caterer, MUA, florist, venue…). Each need has a budget allocation and links to a booking.
  - An event dashboard shows a timeline, spend vs. budget, the status of each vendor, a shared mood board and group chat with co-planners.
- **New categories** reuse profiles, packages, availability, booking, payments, reviews, delivery (where relevant) and the CRM.
  - Each category adds its own `field_schema`: for example caterer = per-head price, dietary options and minimum guests; venue = capacity, indoor/outdoor and hours; musician = genres, set length and equipment.
  - The portfolio and swipe system generalizes. Swiping on florals, cake designs or venues uses the same embedding and Ranker pipeline.
- **AI event planner (Claude API with tool use):**
  - Input in plain language: "Musician, hair stylist, caterer and photographer for a 60-person wedding on June 18 under $10k".
  - The agent's tools are read-only searches plus draft proposals:
    - `parse_event` produces structured needs;
    - `suggest_budget_split` uses typical splits per event type from historical data;
    - `search_providers(category, date, location, price_range, style)` does an availability-aware search;
    - `check_availability`;
    - `draft_plan` returns a proposed set of providers and packages with alternatives;
    - `adjust_plan` handles requests like "cheaper photographer" or "swap to a band".
  - **Guardrails (hard, enforced in code, not just the prompt):**
    - The agent has **no payment or booking tools**. It can only create *draft* booking requests.
    - The user reviews each item and taps "Send request". Payment goes through the normal checkout after the provider accepts.
    - The agent never contacts providers on its own.
  - Plans are stored as `event_plan_drafts` so users can iterate and compare versions.
  - Use the latest Claude models via the API; check current model IDs and pricing at build time.

---

## 6. Roadmap (2 people: A = mobile/web UX, B = backend/ML/payments)

**Phase 0: Foundations (weeks 1–2)**
- Monorepo, Expo, Next.js and CI (typecheck, lint, test).
- Supabase local dev and generated types.
- Auth (email magic link, Apple and Google).
- Profile onboarding with the "I'm a provider" path.
- Sentry, PostHog and the EAS dev client.

**Phase 1: Posting and social MVP (weeks 3–7)**
- (B) Schema for posts, photos, EXIF, tags and gear with RLS. Upload pipeline and the ML service (embeddings, tags, NSFW, pHash, AI-detector stub, watermark worker).
- (A) Upload flow (carousel, before/after, EXIF pre-fill, watermark toggle).
- (A) Feeds (Following, Trending), post detail with the gear and settings panel, profiles and portfolio grid.
- (A) Likes, comments, saves, follows and settings search.
- (B) Gear catalog seed (about 300 bodies and lenses) plus the EXIF matcher.
- (B) AI-review queue with RAW upload. Basic admin pages.
- Seed content: recruit 30–50 local photographers before opening to clients.

**Phase 2: Discover, DMs and sharing (weeks 8–11)**
- (A) Swipe deck UI (haptics, undo, prefetch), "why this" chips and correction controls.
- (B) Swipe logging, the `Ranker` interface and the baseline ranker with exploration.
- (B) DMs and "Contact provider" (Realtime) and push notifications.
- (A) Deep links and OG pages.
- TestFlight and Play internal beta.

**Phase 3: Booking engine (weeks 12–19), the core of the business**
- (B) Generic schema for categories, providers, packages, availability, calendar holds and bookings. State machine RPCs with pgTAP tests.
- (B) Stripe Connect Express onboarding, Stripe Identity verification, separate charges and transfers with hold-until-complete, the cancellation-policy refund engine, disputes and webhooks (idempotent).
- (A) Provider dashboard (packages, calendar, requests, accept, counter, decline).
- (A) Client Hire tab (map and list filtered by category, date, price, rating, service area and taste match), request flow and PaymentSheet.
- (B+A) Delivery galleries, zip download, expiry jobs and Google Drive/Dropbox export via the rclone worker.
- (A) Two-sided double-blind reviews.
- Legal: Terms of Service, privacy policy (biometric consent), provider agreement, cancellation and refund policy, data retention policy.
- Soft launch in one city.

**Phase 4: Launch hardening (weeks 20–23)**
- Admin console: verification, AI review, reports, disputes and gear merges.
- Rate limits and abuse checks.
- In-app account deletion and data export.
- Store submissions and the production web launch.

**Phase 5: Monetization and growth (post-launch)**
- Verified Pro subscription (IAP plus web).
- Business tools (earnings dashboard, invoicing, CRM).
- Promoted placements and affiliate links.
- Challenges and contests, critique posts, tutorials, photo spot map, gear reviews and comparison, and AI shooting suggestions.
- Choose and train the real recommendation model (Appendix A).

**Phase 6: Multi-service expansion**
- Add categories with their field schemas. Onboard vendors in the launch city: start with makeup artists and DJs/musicians, the closest fits to photographers.
- Events, budget and the event dashboard.
- AI event planner (draft-only).
- Later: used gear marketplace.

---

## 7. Verification
- **CI:**
  - Vitest (TypeScript) and pytest (ML and workers);
  - **pgTAP**: RLS policies, every booking state transition, a double-booking rejection and the review-only-after-completed rule;
  - Maestro E2E flows for mobile.
- **Phase 1:**
  - Upload a photo with known EXIF. Check the extracted settings, GPS stripping, gear match, watermark on the public variant and an unwatermarked private original.
  - A forced high AI-score image lands in the review queue, and RAW upload works.
- **Phase 2:**
  - A simulated user who likes only landscapes sees the landscape share in the top-20 rise.
  - Exploration slots are still present.
  - A correction on a tag removes it from later results.
- **Phase 3 (Stripe test mode):**
  - Run the full path: onboard an Express account → Identity test verification → request → accept → deposit (4242 card) → delivery → client accepts.
  - Check that the transfer equals the total minus the fee, and that both reviews unlock.
  - Also cover:
    - cancellations at each policy tier, with correct refund amounts;
    - a dispute that freezes the transfer;
    - `stripe trigger` replays, which must be idempotent;
    - delivery expiry deleting files;
    - a Google Drive export completing.
- **Phase 6:**
  - Give the planner agent a prompt. Assert it returns a plan within budget using only available providers, and that no booking or payment is created without user taps. Check this by code review of the tool list plus a test.

---

## Appendix A: Open decisions (to settle later)
- **Recommendation model options:**
  1. Taste vector plus heuristic (the baseline);
  2. a learned ranker (LightGBM LambdaRank on swipe logs, once there are about 50k swipes);
  3. a two-tower model, or fine-tuning the image encoder on like data, at scale.
  - Each option uses a contextual-bandit style exploration slot.
  - Decide after there is beta data.
- **AI-image detector:** evaluate open models and commercial APIs (e.g. Hive, Sightengine), plus C2PA/Content Credentials checks for camera-signed images. Benchmark on our own uploads.
- **Long-duration fund holds:** confirm hold limits, refund timing and compliance with Stripe and legal before Phase 3 pricing is final.
- **Delivery retention default** (X days) and the Pro storage tiers.
- **Commission % and Pro pricing.**
