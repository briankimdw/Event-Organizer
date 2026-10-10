# Event platform plan

How photographer-match grows from a photographer marketplace into a multi-vendor
event-services platform, and how the code is organized for it.

## The catalog

Every vendor type ("vertical") and occasion lives in one plain-JS file,
`frontend/src/verticals/catalog.js`, shared by the web app, the Expo app, the
database seed and the AI planner (same slugs everywhere).

**18 verticals** (87 services), browsable in 7 groups:

| Group | Verticals |
|---|---|
| Capture the day | Photography, Videography |
| Place & setup | Venues, Rentals |
| Food & drinks | Catering, Private chefs, Cakes & desserts, Bar & drinks |
| Music & entertainment | DJs & live music, Entertainment |
| Look & style | Florals, Decor & design, Hair & makeup |
| Planning & logistics | Planners, Officiants, Transportation, Event staff |
| Treat yourself | Wellness |

**10 occasions**, each listing the verticals it usually needs: wedding, birthday,
graduation, proposal, corporate, baby shower, quinceañera, dinner party,
bachelor/ette, holiday party.

## What makes a vertical different

- **Pricing unit:** a session (fixed), per hour, per person, per item, or per day.
- **Capacity:** a photographer works one event at a time. A caterer or rental company can serve several (`providers.max_concurrent`).
- **Custom fields:** each vertical has its own JSON Schema for provider and package `attributes`, such as cuisines and guest counts for catering or capacity and amenities for venues.
- **Visual or not:** visual verticals get portfolios, the Explore grid and SigLIP style matching. Non-visual ones (DJs, planners, officiants, staff) lead with packages and reviews.

## Phases

1. **Vertical-agnostic app, with all verticals (in progress):** categories, schemas, pricing units, capacity, test vendors, a vertical switcher in Search and the map, provider onboarding, and the Home / Discover redesign.
2. **Event workspace:** `/events/:id` with a per-category checklist (needed → shortlisted → requested → booked), a budget tracker, the event's vendors, a group chat with co-planners and vendors, and a day-of timeline.
3. **AI planner v2:** "Build my event" creates the event and shortlists 3 vendors per category, then **Request all**. Claude gets tools (`search_vendors`, `check_availability`, `estimate_cost`). The AI only drafts; nothing is requested or paid without the user's tap.
4. **Payments:** Stripe deposits per vendor, with funds held until delivery. This must land before the event workspace goes live.
5. **Coordination:** vendors see the shared timeline, vendor-to-vendor messages, and an event summary.
6. **Mobile:** the Expo app in `mobile/` reuses `frontend/src/api`, `lib` and `verticals` directly and replaces the web app as the main client.

## File layout

```
frontend/src/
  verticals/      catalog.js (shared source of truth) + per-vertical field configs
  api/            data layer: plain JS, shared with mobile
  lib/            format, dates, useQuery: plain JS, shared with mobile
  screens/        web screens
  components/     web UI (home/, discover/, verticals/, map/, planner/, upload/...)
mobile/           Expo app (expo-router); imports frontend/src/{api,lib,verticals}
supabase/
  migrations/     schema (…_all_verticals.sql adds pricing units + capacity)
  seed.sql        categories + JSON Schemas for every vertical
  demo/           demo data (paste into the SQL editor)
  tests/          rolled-back SQL tests
services/ml/app/planner/
  finders/        one vendor search per vertical (generic by default)
```

**Adding a vertical touches four places:** a `catalog.js` entry, a seed row with its schemas, a finder (optional; the generic one works), and test vendors. See `docs/VERTICALS.md`.
