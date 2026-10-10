# Verticals

Every kind of vendor the marketplace supports (photography, venues, catering, DJs...)
is a **vertical**. Verticals are data, not tables: the booking engine (providers,
packages, availability, bookings, reviews) is the same for all of them. What differs
per vertical lives in four places, all keyed by the same slug:

| Where | What |
|---|---|
| `frontend/src/verticals/catalog.js` | **Source of truth**: slug, name, services, `priceUnit`, `concurrent`, `visual`, icon, group. Shared by the web app, the Expo app, the seed and the planner. |
| `supabase/seed.sql` | A `service_categories` row per vertical (+ one per service) with the JSON Schemas for `providers.attributes` and `packages.attributes`. |
| `services/ml/app/planner/` | `vocab.py` (category labels / nouns), `budget.py` (budget share per occasion), `finders/` (vendor search; the generic finder works for any vertical). |
| `docs/test-users.json` + `supabase/demo/demo_data.sql` | Throwaway test vendors and their packages, location, capacity and reviews. |

Background: `docs/EVENT_PLATFORM_PLAN.md`.

## Pricing, quantities and capacity (database)

Added by `supabase/migrations/20261010000000_all_verticals.sql`.

- **`packages.price_type`** (`public.price_type`): `fixed` · `hourly` · `per_person` · `per_item` · `daily` · `quote`.
  catalog.js `priceUnit` maps to it: session → `fixed`, hour → `hourly`, person → `per_person`, item → `per_item`, day → `daily`.
  A vertical's `priceUnit` is only the default; any package can use any type.
- **`packages.min_quantity` / `max_quantity`**: guests (or pieces) a package is for. Required in practice for
  `per_person` / `per_item` (the minimum is the default quantity); on other types `max_quantity` is a cap
  (a venue's max guests, a 30-seat party bus).
- **`bookings.quantity`**: guests / pieces on a booking. `request_booking(..., p_quantity)` computes the subtotal:

  | price_type | subtotal |
  |---|---|
  | `fixed` | price |
  | `hourly` | price × hours (`p_hours`, else the package length) |
  | `per_person` / `per_item` | price × quantity (quantity defaults to `min_quantity`; must be within min..max) |
  | `daily` | price. One booking is one day; several days = several dates (one booking each). |
  | `quote` | null: the provider counters with a price |

- **`providers.max_concurrent`** (1-50, default 1): how many events a provider can work at the same time.
  Photographers, DJs and venues stay at 1 (no overlapping bookings, exactly as before); caterers, rental
  companies and others marked `concurrent: true` in catalog.js can take more. Each active booking holds a
  `bookings.slot` (1..max_concurrent) and an exclusion constraint forbids two overlapping active bookings in
  the same slot, so the limit holds even for simultaneous requests. A provider is "free" on a day
  (`is_provider_free`, `search_providers`) while fewer than `max_concurrent` active bookings touch that day.
  Owners can update `max_concurrent` themselves; onboarding should set it from the catalog's `concurrent` flag.

## All verticals

`attributes` fields per vertical (from the JSON Schemas in `supabase/seed.sql`; every schema has
`additionalProperties: false`, so unknown keys are rejected). Enums:
`dietary` = vegetarian, vegan, gluten-free, dairy-free, nut-free, halal, kosher ·
catering `service_style(s)` = buffet, plated, family-style, stations, passed-appetizers, food-truck, drop-off ·
venue `setting` = indoor, outdoor, indoor-outdoor · bar `bar_types` = full-bar, beer-wine, cocktails, mocktails, coffee ·
entertainment `age_groups` = kids, teens, adults, all-ages ·
staffing `roles` / `role` = servers, bartenders, valet, security, cleanup, coordinators, hosts.
`units_per_guest` (cakes, florals, rentals packages) is how many pieces a typical guest needs
(a chair = 1, a centerpiece for tables of 8 = 0.125); the planner uses it to estimate quantities.

| Slug | Name | Price unit → default `price_type` | Concurrent | Provider attributes | Package attributes |
|---|---|---|---|---|---|
| `photography` | Photography | session → `fixed` | no (1) | `gear` object, `specialties` text[], `watermark_default` bool | `edited_photos` int, `editing_level` text, `turnaround_days` int, `deliverables` text[], `second_shooter_included` bool |
| `videography` | Videography | session → `fixed` | no (1) | `specialties` text[], `styles` text[], `gear` object, `drone_licensed` bool | `film_minutes` int, `highlight_minutes` int, `raw_footage` bool, `turnaround_days` int, `deliverables` text[], `second_shooter_included` bool |
| `venue` | Venues | day → `daily` | no (1) | `setting` enum, `capacity_seated` int, `capacity_standing` int, `amenities` text[], `address` text, `parking` text, `in_house_catering` bool, `outside_catering_allowed` bool, `alcohol_allowed` bool, `curfew` text | `hours_included` int, `spaces` text[], `includes` text[], `weekday_only` bool |
| `catering` | Catering | person → `per_person` | yes (set `max_concurrent` > 1) | `cuisines` text[], `dietary` enum[], `service_styles` enum[], `min_guests` int, `max_guests` int, `staff_included` bool | `service_style` enum, `courses` int, `menu` text[], `dietary` enum[], `staff_included` bool, `tableware_included` bool |
| `private-chef` | Private chefs | person → `per_person` | no (1) | `cuisines` text[], `dietary` enum[], `max_guests` int, `training` text | `courses` int, `menu` text[], `dietary` enum[], `groceries_included` bool, `cleanup_included` bool, `serving_staff_included` bool |
| `cakes` | Cakes & desserts | item → `per_item` | yes (set `max_concurrent` > 1) | `specialties` text[], `dietary` enum[], `delivery` bool, `tastings` bool | `servings` int, `tiers` int, `flavors` text[], `dietary` enum[], `delivery_included` bool, `setup_included` bool, `units_per_guest` number |
| `bar` | Bar & drinks | person → `per_person` | yes (set `max_concurrent` > 1) | `bar_types` enum[], `provides_alcohol` bool, `liability_insured` bool, `max_guests` int | `hours_included` int, `bartenders` int, `signature_cocktails` int, `alcohol_included` bool, `menu` text[], `glassware_included` bool |
| `music` | DJs & live music | hour → `hourly` | no (1) | `acts` text[], `genres` text[], `languages` text[], `members` int, `equipment_included` bool, `lighting_available` bool | `sets` int, `set_minutes` int, `musicians` int, `equipment_included` bool, `lighting_included` bool, `ceremony_music` bool, `mc_included` bool, `song_requests` bool |
| `entertainment` | Entertainment | hour → `hourly` | no (1) | `acts` text[], `age_groups` enum[], `space_needed` text, `outdoor_ok` bool | `performers` int, `includes` text[], `prints_included` bool, `setup_minutes` int |
| `florals` | Florals | item → `per_item` | yes (set `max_concurrent` > 1) | `styles` text[], `flowers` text[], `foam_free` bool, `delivery` bool | `pieces` int, `flowers` text[], `color_palette` text[], `vessels_included` bool, `delivery_included` bool, `setup_included` bool, `units_per_guest` number |
| `decor` | Decor & design | session → `fixed` | yes (set `max_concurrent` > 1) | `styles` text[], `themes` text[], `inventory_owned` bool | `theme` text, `includes` text[], `color_palette` text[], `setup_included` bool, `teardown_included` bool |
| `hair-makeup` | Hair & makeup | person → `per_person` | no (1) | `products` text[], `techniques` text[], `travel` bool, `team_size` int | `services` text[], `trial_included` bool, `on_location` bool, `touch_up_hours` int, `lashes_included` bool |
| `rentals` | Rentals | item → `per_item` | yes (set `max_concurrent` > 1) | `inventory` object[], `delivery` bool, `setup` bool | `item` text, `dimensions` text, `color` text, `available` int, `bundle` object[], `units_per_guest` number, `delivery_included` bool, `setup_included` bool |
| `planning` | Planners | session → `fixed` | yes (set `max_concurrent` > 1) | `specialties` text[], `languages` text[], `certifications` text[], `team_size` int | `months_of_planning` int, `day_of_hours` int, `meetings` int, `vendor_referrals` bool, `budget_tracking` bool, `includes` text[] |
| `officiant` | Officiants | session → `fixed` | no (1) | `ceremony_types` text[], `languages` text[], `ordained_by` text | `ceremony_minutes` int, `meetings` int, `custom_ceremony` bool, `rehearsal_included` bool, `license_filing` bool |
| `transportation` | Transportation | hour → `hourly` | yes (set `max_concurrent` > 1) | `fleet` object[], `licensed` bool | `vehicle` text, `passengers` int, `min_hours` int, `chauffeur_included` bool, `includes` text[] |
| `staffing` | Event staff | hour → `hourly` | yes (set `max_concurrent` > 1) | `roles` enum[], `team_size` int, `insured` bool | `role` enum, `staff` int, `min_hours` int, `attire` text, `includes` text[] |
| `wellness` | Wellness | session → `fixed` | no (1) | `modalities` text[], `certifications` text[], `comes_to_you` bool, `brings_equipment` bool | `session_minutes` int, `max_people` int, `equipment_included` bool, `includes` text[] |

## How to add a new vendor category

1. **Catalog.** Add an entry to `VERTICALS` in `frontend/src/verticals/catalog.js`: a new unique `slug`
   (lowercase, hyphens), name, noun/plural, icon, group, `priceUnit`, `concurrent`, `visual`, and its
   `services` (service slugs are global: they must not exist in any other vertical). Add it to the
   `needs` of any `OCCASIONS` that use it.
2. **Seed row + schemas.** In `supabase/seed.sql`, add a `('slug', 'Name', 'vertical', <position>, provider_schema,
   package_schema)` row to the verticals insert and its services to the services list, with `sort_order`
   matching catalog order. Keep schemas small, `additionalProperties: false`, short strings with `maxLength`,
   lists with `maxItems`, enums only for values the app filters on. Guest/piece limits go in
   `packages.min_quantity` / `max_quantity`, not attributes. Re-run the seed (it updates existing rows) on
   every environment, e.g. paste it into the Supabase SQL Editor. Then extend `supabase/tests/verticals_test.sql`
   (the slug list, service count and one bad attribute).
3. **Planner.** In `services/ml/app/planner/vocab.py` add the slug to `CATEGORIES` (label = catalog name)
   and `VERTICAL_INFO` (noun, plural, budget word, visual). In `budget.py` give it a share in the `SPLITS` of
   the occasions that need it. In `rules.py` add the words people use for it to `CATEGORY_PATTERNS`.
   Optionally map event types to its preferred service in `finders/generic.py` `PREFERRED_SERVICE`.
   The generic `VendorFinder` handles every price type; only add a `finders/<slug>.py` subclass of
   `BaseFinder` (registered in `finders/__init__.py` `FINDER_CLASSES`) if it needs special rules.
   `tests/test_finders.py` checks the planner against catalog.js; run
   `cd services/ml && .venv/Scripts/python -m pytest -q`.
4. **Test vendors + demo data.** Add two vendors to the `vendors` list in `docs/test-users.json` (same
   shape as the others, with `vertical`, `business`, `slug`, `services`; fake `@example.com` email,
   random password) and to the table in `docs/test-users.md`. In `supabase/demo/demo_data.sql` add their
   attributes, location, radius and capacity to `vendor_listings`, their services, packages
   (`pg_temp.vpkg`) and a completed, reviewed booking (`pg_temp.done`); add their usernames to
   `supabase/demo/remove_demo_data.sql`. Then run `node frontend/scripts/seed-test-users.mjs` and paste
   `demo_data.sql` into the SQL Editor.
5. **App.** The web and Expo apps read the catalog; add any per-vertical field config for the new
   attributes (forms and filters) so vendors can fill them in.
