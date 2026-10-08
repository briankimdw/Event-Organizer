# Service Marketplace: Architecture

A platform to find, compare, book and pay service providers. Photographers first, then event services (musicians, caterers, florists, venues, etc.), with an AI event planner.

**Stack:** Python (FastAPI) services, React frontend, Postgres, Redis, S3, event bus. Service-based (not a monolith).

---

## 1. Guiding decisions

- **Few services, clear boundaries.** Split only where scaling or failure needs differ. Seven services plus workers; don't split further until something hurts.
- **Category-agnostic core from day one.** A provider has a `category`; each category adds schema-validated fields (JSONB). Packages, availability, bookings and reviews never reference "photographer" directly.
- **Stripe Connect for money.** Never hold funds yourself (money-transmitter regulation).
- **Booking loop before social/swipe.** Revenue comes from bookings; the feed and recommendations are growth features.

## 2. Stack

| Layer | Choice |
|---|---|
| Backend | Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic |
| Frontend | React + TypeScript, Vite (or Next.js for SEO on public provider pages), TanStack Query, generated OpenAPI client |
| Jobs | Celery or Arq on Redis |
| Event bus | RabbitMQ or SNS+SQS |
| Data | Postgres per service (PostGIS, pgvector), Redis, S3 |
| ML | PyTorch / open_clip, separate GPU-capable worker |
| Payments | Stripe Connect (Express accounts), Stripe Identity or Persona for ID verification |

## 3. System overview

```
        React web app (Next.js/Vite)
                  |
        API Gateway (Kong / Traefik + BFF)
        auth check, rate limiting, routing
                  |
 +--------+--------+---------+----------+---------+--------+
 |Identity|Provider| Booking | Payments |Messaging| Media  |
 |        |Catalog |         |          |         |        |
 +---+----+---+----+----+----+----+-----+----+----+---+----+
     |        |         |         |          |        |
     +--------+---- Event bus (RabbitMQ / SNS+SQS) ---+
                          |
                 +--------+---------+
                 | Discovery/Recs   |   AI Planner
                 | (search, swipe)  |   (LLM + tools)
                 +------------------+
```

## 4. Services

| Service | Owns | Notes |
|---|---|---|
| **Identity** | users, auth, roles, ID verification status | OAuth/OIDC, JWTs; wraps Stripe Identity/Persona |
| **Provider Catalog** | provider profiles, categories and per-category fields, packages, portfolio posts, reviews | Reviews only creatable via a booking-completed event |
| **Booking** | availability, requests, bookings, state machine, cancellation policies, disputes | Most critical service; exclusion constraint prevents double-booking |
| **Payments** | Stripe Connect accounts, charges, transfers, payouts, refunds, ledger | Only service that talks to Stripe; idempotent webhooks |
| **Messaging** | conversations, messages, contact masking and detection | WebSockets, Redis pub/sub |
| **Media** | uploads, derivatives, EXIF, watermarking, deliveries, AI-image detection | Worker-heavy; presigned S3 uploads |
| **Discovery/Recs** | search index, embeddings, swipe events, taste vectors | Postgres + pgvector first, Typesense/OpenSearch later |
| **AI Planner** (phase 4) | event plans, LLM orchestration | Calls other services as a user-scoped client; no payment tools |

## 5. What is an event bus?

A message hub that services use to announce that something happened, without calling each other directly. Like a restaurant order board: the kitchen posts "order 12 ready" and whoever cares reacts.

- **Without a bus:** when a booking is paid, Payments must call Booking, Messaging, Catalog and Notifications one by one, handle each failure, and know about every other service.
- **With a bus:** Payments publishes `payment.captured {booking_id}`. Booking, Messaging and Notifications each subscribe and react. Payments doesn't know who is listening.
- Messages wait in a queue until processed, so a service that is briefly down catches up when it returns.
- Use it for **facts that already happened** (`booking.completed`, `media.processed`). Use HTTP for questions needing an immediate answer ("what's this package's price?").
- Subscribers must tolerate duplicate delivery (idempotency).
- **Transactional outbox:** write the event to your own DB in the same transaction as the data change; a relay publishes it afterward. This prevents saving a booking without announcing it.

## 6. Service rules

1. **Database per service, no cross-service joins.** Share data via APIs or events; keep local snapshots (e.g. Booking stores package price at request time).
2. **Events for facts, HTTP for questions.**
3. **Sagas for money flows.** Booking orchestrates; Payments reports success/failure; compensating actions release the calendar hold if payment fails.
4. **One shared contract library.** Events and API schemas defined once (Pydantic/OpenAPI/AsyncAPI); TypeScript client generated from it.
5. **Authorization at the edge and in each service.** Gateway validates the JWT; every service still checks ownership.

## 7. Core domain model

**Identity and profiles**
- `User` (auth, roles: customer / provider / admin)
- `ProviderProfile` (category, bio, location, service radius as PostGIS geography, verification status, tier)
- `ProviderCategoryDetails` (JSONB: gear, instruments, dietary capabilities, etc.)

**Catalog and booking**
- `Package` (provider, title, price, duration, deliverables as JSONB)
- `AvailabilityRule`, `AvailabilityException`, and booking blocks (compute free slots on read)
- `BookingRequest` -> `Booking` -> `Payment`, `Dispute`, `Review`
- `Event` (planner entity): total budget, allocations, many booking requests

**Social and media**
- `Post` (carousel of `MediaAsset`s, tags, location, gear, before/after flag)
- `MediaAsset` (original key, derivatives, perceptual hash, AI-detection score, review status, watermark flag)
- `Follow`, `Like`, `Save`, `Comment`, `Conversation`, `Message`
- `SwipeEvent` (user, asset, direction, timestamp, shown-reason)

Reviews are tied to `Booking.state = completed`, enforcing the fraud-prevention rule structurally. Customer ratings use the same table with a `direction` field.

## 8. Booking state machine

```
requested -> accepted -> paid -> in_progress -> delivered
    |           |          |                        |
 declined    cancelled  cancelled              completed (auto after N days
 /expired    (policy)   (policy refund)        or on customer confirm)
                                                    |
                                                disputed -> resolved
```

- Explicit transitions table plus audit log; every transition emits an event.
- **Calendar locking:** on `accepted`, create a tentative block with a TTL (24-48 h) pending payment. A Postgres exclusion constraint on `(provider_id, tstzrange)` makes double-booking impossible at the DB level.
- **Cancellation policies** are provider-chosen templates (flexible / moderate / strict) that compute refunds from time-to-event.

## 9. Payments and escrow

- Stripe Connect Express accounts for provider onboarding and KYC.
- **Separate charges and transfers:** charge the customer at acceptance, keep funds on the platform balance, transfer to the provider on `completed` minus commission.
- Card authorizations only last about 7 days, so charge up front. For events booked far ahead: deposit plus final payment scheduled before the event.
- Platform dispute window (e.g. 72 h after delivery) with evidence upload; Stripe chargebacks feed the same dispute record.
- Handle webhooks idempotently; store every Stripe event ID.

## 10. Media pipeline

1. Client requests a presigned upload URL and uploads the original directly to S3.
2. A worker is triggered that:
   - extracts EXIF into structured gear/settings fields, strips GPS from public derivatives
   - generates responsive derivatives (WebP/AVIF) and applies watermark if enabled
   - computes a perceptual hash (duplicate/stolen-image detection)
   - runs AI-generation detection, auto-tagging, and embedding
3. Serve derivatives only via CDN; originals stay private.

**Client deliveries** use a separate bucket with lifecycle rules (delete after X days). For the cloud-export idea, start with presigned ZIP downloads, then "Save to Google Drive/Dropbox" using the user's OAuth token (not persisted), rather than running Rclone server-side per user.

## 11. Search and discovery

- **Phase 1:** Postgres full-text + PostGIS for "providers near X who serve Y on date Z at <= price," with availability filtered via SQL against booking blocks.
- **Phase 2:** Typesense or OpenSearch (typo tolerance, facets, ranking), synced via the event bus.
- Ranking = relevance + distance + rating (Bayesian average) + capped, transparent verified/boost multiplier.
- Photo-spot map and settings search ("f/1.2", "long exposure") come from structured EXIF fields.

## 12. Recommendation / swipe system

Built so the model is swappable ("figure out the model later"):

- **Embeddings:** CLIP-style embedding per image in pgvector.
- **Taste vector:** weighted average of liked embeddings minus passed ones, with time decay.
- **Exploration:** contextual bandit or epsilon-greedy over clusters so ~15-20% of the feed is new styles.
- **Explanations:** derived from the nearest liked cluster or tags ("because you liked moody low-key portraits").
- **Corrections:** "not this part" downweights a specific tag/cluster, not just the image.
- All behind a `RecommendationService` interface so a learned two-tower model can replace it later.

## 13. AI event planner

LLM with **tool calling**, not free-form generation.

- **Tools:** `search_providers(category, date, location, price_range)`, `get_availability`, `propose_budget_split`, `draft_booking_request`.
- **Flow:** parse request -> structured `EventPlan` (services, guests, date, budget) -> budget allocation -> candidates per category -> user review.
- **Hard safety rule:** the AI has no payment or booking-commit tools. It creates drafts only; the user confirms in the UI, which calls the normal booking API with the user's own session. "AI never pays" is enforced in code, not just in the prompt.
- Validate LLM output against schemas, version the plan so users can readjust, and log tool calls.

## 14. Chat contact policy

Decisions: (1) hide contact info until paid, (2) detect and nudge, (3) make staying on-platform worth it.

**Hide until paid**
- Messaging stores the raw message plus a `visible_body`. It subscribes to `payment.captured` and sets `contact_unlocked = true` for that conversation.
- Before unlock, a pipeline (regex for phone/email, normalization for obfuscations like "dot", "at", spelled-out digits, optional classifier for handles) redacts matches in `visible_body`.
- After unlock, details can be shared freely. Optionally add masked in-app calling (Twilio Proxy) for day-of coordination.

**Detect and nudge**
- The pipeline returns a `risk_score` and reason. Low: deliver normally. Medium: redact and show a "keep your booking protected" banner. High (repeat offenders): rate-limit and flag to an admin queue.
- Emit `messaging.circumvention_flagged` so Catalog can factor it into provider trust signals.

**Worth staying**
- Escrow in Payments, verified reviews in Catalog, disputes in Booking, and `POST /bookings/{id}/rebook` for one-click rebooking.
- The biggest leak point is repeat bookings after a good first one, so make rebooking, saved packages and loyalty perks easy on-platform.

## 15. Trust and safety

- **Provider verification:** ID document plus selfie liveness via Stripe Identity or Persona rather than custom facial recognition (biometric laws such as Illinois BIPA and GDPR special categories). Store only pass/fail.
- **AI-image flagging:** a signal, not a verdict. Above threshold, route to manual review where the photographer submits the RAW file; compare EXIF/RAW metadata; provide an appeal path.
- **Moderation:** report flows, admin console, rate limits, DM spam detection.
- **Privacy:** client photos default private, per-booking access, expiring signed URLs, encryption at rest, documented retention policy.

## 16. Infrastructure and operations

- Single cloud region, managed services (RDS Postgres, ElastiCache, S3, ECS/Fargate or Cloud Run). `docker-compose` locally. Kubernetes later, if ever.
- Real-time messaging via WebSockets (managed service or small gateway with Redis pub/sub).
- Durable job queue with retries and dead-letter queues.
- Observability: structured logs, OpenTelemetry traces, Sentry, alerts on payment webhook failures and booking state anomalies.
- Security: short-lived JWTs plus refresh tokens, Apple/Google sign-in, ownership checks in every query, secrets in a managed vault.

## 17. Repo layout (monorepo)

```
/services
  /identity  /catalog  /booking  /payments
  /messaging /media    /discovery /planner
/libs
  /common        (auth utils, logging, outbox, event base classes)
  /contracts     (event + API schemas)
/web             (React app)
/infra           (docker-compose, Terraform/Pulumi)
```

## 18. React frontend

- Feature-based folders (`features/booking`, `features/discovery`, `features/chat`, ...).
- Generated typed API client + TanStack Query for server state; minimal global state (Zustand).
- Next.js for public provider and portfolio pages (SEO, share previews), logged-in app behind it. React Native can reuse the API client later.
- Stripe Elements for payment UI and Stripe Connect embedded onboarding for providers.

## 19. Build phases

| Phase | Scope | Why |
|---|---|---|
| **0** | Gateway, Identity, Catalog (profiles, packages), Media (portfolio upload) | Supply-side content |
| **1** | Booking, Payments, Messaging with contact masking, completed-only reviews | Core revenue loop |
| **2** | Search with filters/map, verified-pro subscription, notifications, deliveries | Monetization and retention |
| **3** | Feed, follows, swipe and recommendations, AI flagging | Engagement |
| **4** | Second category using only config/schema, then the AI event planner | Validates the generic core |

If phase 4 requires changing core tables, the category abstraction wasn't clean enough.

## 20. Biggest risks

1. **Cold start:** supply and demand must meet in the same city. Launch in one metro.
2. **Disintermediation:** people take payment off-platform once connected. Escrow, calendar, reviews and easy rebooking must be genuinely valuable.
3. **Scope:** marketplace, social network, ML recommender, gear marketplace and event planner are each a company. Ship phase 1 before the rest.
