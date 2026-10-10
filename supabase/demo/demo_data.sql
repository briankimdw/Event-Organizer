-- Demo data for the dev project: packages, add-ons, gear, working hours,
-- bookings in every state, double-blind reviews, chats, follows and a shortlist,
-- built on the test users from docs/test-users.json (create those first with
-- frontend/scripts/seed-test-users.mjs). Covers the photographers and the vendors
-- of every other vertical (caterers, venues, DJs...); the vendor part needs
-- migration 20261010000000_all_verticals and the new seed.sql first
-- (supabase/demo/all_verticals_setup.sql applies both).
--
-- Everything is looked up by username / slug, so it works on any project.
-- Safe to run more than once: each section skips work that's already there.
-- Undo with supabase/demo/remove_demo_data.sql.
--
-- Also gives Brian's own account (username briankimdw) some bookings, chats and
-- a shortlist so the client side of the app has something to show.

-- ---------------------------------------------------------------------------
-- Helpers (temporary: they disappear when the session ends)
-- ---------------------------------------------------------------------------
create or replace function pg_temp.uid(p_username text) returns uuid language sql stable as $$
  select id from public.profiles where username::text = p_username
$$;

create or replace function pg_temp.pid(p_slug text) returns uuid language sql stable as $$
  select id from public.providers where slug::text = p_slug
$$;

create or replace function pg_temp.cat(p_slug text) returns uuid language sql stable as $$
  select id from public.service_categories where slug = p_slug
$$;

-- One package (skipped if the provider already has one with that name).
create or replace function pg_temp.pkg(
  p_slug text, p_cat text, p_name text, p_type text, p_price_dollars integer, p_hours numeric,
  p_deposit integer, p_attrs jsonb, p_sort integer, p_desc text default null
) returns void language plpgsql as $$
begin
  if pg_temp.pid(p_slug) is null then return; end if;
  if exists (select 1 from public.packages where provider_id = pg_temp.pid(p_slug) and name = p_name) then return; end if;
  insert into public.packages (provider_id, category_id, name, description, price_type, price_cents, duration_minutes, deposit_pct, attributes, sort_order)
  values (pg_temp.pid(p_slug), pg_temp.cat(p_cat), p_name, p_desc, p_type::public.price_type,
          case when p_type = 'quote' then null else p_price_dollars * 100 end,
          case when p_hours is null then null else round(p_hours * 60)::integer end,
          p_deposit, p_attrs, p_sort);
end $$;

-- A vendor package: price in cents, any price type (per_person, per_item, daily...),
-- with the guest / piece limits (min_quantity / max_quantity). Skipped if it exists.
create or replace function pg_temp.vpkg(
  p_slug text, p_cat text, p_name text, p_type text, p_price_cents integer, p_hours numeric,
  p_min integer, p_max integer, p_deposit integer, p_attrs jsonb, p_sort integer
) returns void language plpgsql as $$
begin
  if pg_temp.pid(p_slug) is null then return; end if;
  if exists (select 1 from public.packages where provider_id = pg_temp.pid(p_slug) and name = p_name) then return; end if;
  insert into public.packages (provider_id, category_id, name, price_type, price_cents, duration_minutes,
                               min_quantity, max_quantity, deposit_pct, attributes, sort_order)
  values (pg_temp.pid(p_slug), pg_temp.cat(p_cat), p_name, p_type::public.price_type, p_price_cents,
          case when p_hours is null then null else round(p_hours * 60)::integer end,
          p_min, p_max, p_deposit, p_attrs, p_sort);
end $$;

create or replace function pg_temp.addon(p_slug text, p_name text, p_price_dollars integer, p_sort integer) returns void language plpgsql as $$
begin
  if pg_temp.pid(p_slug) is null then return; end if;
  if exists (select 1 from public.package_addons where provider_id = pg_temp.pid(p_slug) and name = p_name) then return; end if;
  insert into public.package_addons (provider_id, name, price_cents, sort_order)
  values (pg_temp.pid(p_slug), p_name, p_price_dollars * 100, p_sort);
end $$;

-- A booking that walks through p_path (e.g. requested -> accepted -> confirmed),
-- with each step dated from p_step_days (days relative to today, negative = past).
-- Skipped if this client already has a booking with this provider on that day.
-- p_quantity: guests / pieces for per_person and per_item packages (default: the package minimum).
create or replace function pg_temp.booking(
  p_client text, p_slug text, p_package text, p_day_offset integer, p_start time,
  p_path text[], p_step_days integer[], p_location text, p_notes text default null,
  p_addons text[] default '{}', p_quantity integer default null
) returns uuid language plpgsql as $$
declare
  v_client uuid := pg_temp.uid(p_client);
  v_provider public.providers;
  v_pkg public.packages;
  v_day date := current_date + p_day_offset;
  v_start timestamptz;
  v_minutes integer;
  v_quantity integer;
  v_subtotal integer;
  v_addons integer;
  v_total integer;
  v_policy jsonb;
  v_id uuid;
  i integer;
begin
  select * into v_provider from public.providers where slug::text = p_slug;
  select * into v_pkg from public.packages where provider_id = v_provider.id and name = p_package;
  if v_client is null or v_provider.id is null or v_pkg.id is null then return null; end if;

  v_start := (v_day + p_start) at time zone v_provider.timezone;
  if exists (select 1 from public.bookings b where b.client_id = v_client and b.provider_id = v_provider.id
             and (lower(b.time_range) at time zone v_provider.timezone)::date = v_day) then
    return null;
  end if;

  -- Same price rules as request_booking().
  v_minutes := coalesce(v_pkg.duration_minutes, case when v_pkg.price_type::text = 'daily' then 720 else 120 end);
  v_quantity := case when v_pkg.price_type::text in ('per_person', 'per_item')
                     then coalesce(p_quantity, v_pkg.min_quantity, 1) else p_quantity end;
  v_subtotal := case v_pkg.price_type::text
                  when 'fixed' then v_pkg.price_cents
                  when 'daily' then v_pkg.price_cents
                  when 'hourly' then round(v_pkg.price_cents * v_minutes / 60.0)::integer
                  when 'per_person' then v_pkg.price_cents * v_quantity
                  when 'per_item' then v_pkg.price_cents * v_quantity end;
  select coalesce(sum(price_cents), 0)::integer into v_addons
  from public.package_addons where provider_id = v_provider.id and name = any (p_addons);
  v_total := case when v_subtotal is null then null else v_subtotal + v_addons end;
  select rules into v_policy from public.cancellation_policies where id = v_provider.cancellation_policy_id;

  insert into public.bookings (
    client_id, provider_id, package_id, category_id, status, time_range, timezone, location_text, notes, quantity,
    subtotal_cents, addons_cents, total_cents, deposit_cents, package_snapshot, policy_snapshot, expires_at, created_at
  ) values (
    v_client, v_provider.id, v_pkg.id, v_pkg.category_id, p_path[1]::public.booking_status,
    tstzrange(v_start, v_start + make_interval(mins => v_minutes)), v_provider.timezone, p_location, p_notes, v_quantity,
    v_subtotal, v_addons, v_total,
    case when v_total is null then null else round(v_total * v_pkg.deposit_pct / 100.0)::integer end,
    to_jsonb(v_pkg), coalesce(v_policy, '[]'::jsonb), now() + interval '14 days',
    now() + make_interval(days => p_step_days[1])
  ) returning id into v_id;

  insert into public.booking_addons (booking_id, addon_id, name, price_cents)
  select v_id, a.id, a.name, a.price_cents from public.package_addons a
  where a.provider_id = v_provider.id and a.name = any (p_addons);

  for i in 2 .. coalesce(array_length(p_path, 1), 1) loop
    update public.bookings set
      status = p_path[i]::public.booking_status,
      delivered_at = case when p_path[i] = 'delivered' then now() + make_interval(days => p_step_days[i]) else delivered_at end,
      completed_at = case when p_path[i] = 'completed' then now() + make_interval(days => p_step_days[i]) else completed_at end,
      cancelled_at = case when p_path[i] like 'cancelled%' then now() + make_interval(days => p_step_days[i]) else cancelled_at end
    where id = v_id;
  end loop;

  -- Date the history entries (the trigger stamped them all "now").
  update public.booking_events e set created_at = now() + make_interval(days => p_step_days[s.n])
  from (select n, p_path[n] as st from generate_series(1, array_length(p_path, 1)) n) s
  where e.booking_id = v_id and e.to_status::text = s.st;

  return v_id;
end $$;

-- Both sides' reviews for a completed booking, revealed (updates the ratings).
create or replace function pg_temp.reviews(p_booking uuid, p_client_rating smallint, p_client_text text,
                                           p_provider_rating smallint, p_provider_text text, p_days_ago integer)
returns void language plpgsql as $$
declare b public.bookings; v_owner uuid;
begin
  if p_booking is null then return; end if;
  select * into b from public.bookings where id = p_booking;
  select profile_id into v_owner from public.providers where id = b.provider_id;
  insert into public.reviews (booking_id, provider_id, author_id, subject_profile_id, direction, rating, body, created_at, revealed_at)
  values
    (b.id, b.provider_id, b.client_id, v_owner, 'client_to_provider', p_client_rating, p_client_text,
     now() - make_interval(days => p_days_ago), now() - make_interval(days => p_days_ago)),
    (b.id, b.provider_id, v_owner, b.client_id, 'provider_to_client', p_provider_rating, p_provider_text,
     now() - make_interval(days => p_days_ago), now() - make_interval(days => p_days_ago))
  on conflict (booking_id, direction) do nothing;
end $$;

-- Messages in a booking's thread (only if the thread is still empty).
create or replace function pg_temp.chat(p_booking uuid, p_lines jsonb) returns void language plpgsql as $$
declare v_conv uuid; v_client uuid; v_owner uuid; l jsonb;
begin
  if p_booking is null then return; end if;
  select c.id, b.client_id, p.profile_id into v_conv, v_client, v_owner
  from public.conversations c join public.bookings b on b.id = c.booking_id join public.providers p on p.id = b.provider_id
  where c.booking_id = p_booking;
  if v_conv is null or exists (select 1 from public.messages where conversation_id = v_conv) then return; end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    insert into public.messages (conversation_id, sender_id, body, created_at)
    values (v_conv, case when l ->> 'from' = 'client' then v_client else v_owner end, l ->> 'text',
            now() + make_interval(days => (l ->> 'day')::integer, mins => coalesce((l ->> 'min')::integer, 0)));
  end loop;
  update public.conversations set last_message_at = (select max(created_at) from public.messages where conversation_id = v_conv) where id = v_conv;
end $$;

-- A past booking that went all the way to completed (requested 20 days before,
-- delivered the day after), reviewed by both sides 3 days after the event.
create or replace function pg_temp.done(
  p_client text, p_slug text, p_package text, p_day_offset integer, p_start time, p_location text,
  p_quantity integer, p_rating smallint, p_text text, p_provider_text text default null
) returns void language plpgsql as $$
declare b uuid;
begin
  b := pg_temp.booking(p_client, p_slug, p_package, p_day_offset, p_start,
         array['requested','accepted','confirmed','in_progress','delivered','completed'],
         array[p_day_offset - 20, p_day_offset - 19, p_day_offset - 19, p_day_offset, p_day_offset + 1, p_day_offset + 2],
         p_location, null, '{}', p_quantity);
  perform pg_temp.reviews(b, p_rating, p_text, 5::smallint, p_provider_text, -p_day_offset - 3);
end $$;

-- ---------------------------------------------------------------------------
-- Avatars (stock portraits) for the test accounts that don't have one
-- ---------------------------------------------------------------------------
update public.profiles p set avatar_path = 'https://i.pravatar.cc/300?img=' || v.n
from (values ('mayachen', 47), ('jonahshoots', 13), ('priya.frames', 32), ('leo.spaces', 59), ('sofia.wild', 44),
             ('diego.alvarez', 33), ('hanakim.studio', 45), ('jordanlee', 52), ('sampatel', 60), ('rosa.d', 25),
             ('kai.film', 15), ('taylorb', 9)) as v (username, n)
where p.username::text = v.username and p.avatar_path is null;

-- ---------------------------------------------------------------------------
-- Photographer listings: gear, specialties, service area, policy, badges
-- ---------------------------------------------------------------------------
update public.providers p set
  attributes = v.attrs::jsonb,
  service_radius_km = v.radius,
  travel_fee_per_km_cents = v.fee,
  cancellation_policy_id = (select id from public.cancellation_policies where provider_id is null and name = v.policy),
  identity_verified = v.verified,
  is_pro = v.pro
from (values
  ('maya-chen-photo', '{"specialties":["Wedding","Portrait","Engagement"],"gear":{"bodies":["Sony A7 IV","Sony A7C"],"lenses":["Sony FE 35mm f/1.4 GM","Sony FE 85mm f/1.8","Sony FE 24-70mm f/2.8 GM II"]}}', 50, 150, 'Moderate', true, true),
  ('jonah-reyes', '{"specialties":["Street","Event","Nightlife"],"gear":{"bodies":["Fujifilm X100V","Fujifilm X-T5"],"lenses":["XF 23mm f/1.4 R LM WR","XF 56mm f/1.2 R WR"]}}', 40, 100, 'Flexible', true, false),
  ('priya-frames', '{"specialties":["Graduation","Headshots","Family"],"gear":{"bodies":["Canon EOS R6 Mark II"],"lenses":["Canon RF 50mm f/1.2L","Canon RF 70-200mm f/2.8L"]}}', 40, 125, 'Flexible', true, true),
  ('leo-spaces', '{"specialties":["Real estate","Product","Architecture"],"gear":{"bodies":["Nikon Z7 II"],"lenses":["Nikkor Z 14-24mm f/2.8 S","Nikkor Z MC 105mm f/2.8"]}}', 30, 200, 'Strict', true, false),
  ('sofia-wild', '{"specialties":["Landscape","Coaching","Meetups"],"gear":{"bodies":["Sony A7R V"],"lenses":["Sony FE 16-35mm f/2.8 GM","Sony FE 100-400mm GM"]}}', 150, 0, 'Flexible', false, false),
  ('diego-alvarez', '{"specialties":["Wedding","Event","Quinceañera"],"gear":{"bodies":["Canon EOS R5","Canon EOS R6"],"lenses":["Canon RF 28-70mm f/2L","Canon RF 85mm f/1.2L"]}}', 60, 100, 'Moderate', true, true),
  ('hana-kim-studio', '{"specialties":["Headshots","Portrait","Editorial"],"gear":{"bodies":["Sony A7R V"],"lenses":["Sony FE 50mm f/1.2 GM","Sony FE 90mm f/2.8 Macro G"]}}', 25, 150, 'Flexible', true, false)
) as v (slug, attrs, radius, fee, policy, verified, pro)
where p.slug::text = v.slug and p.attributes = '{}'::jsonb;

-- Where each photographer is based (the map draws service_radius_km around it).
update public.providers p set base_location = extensions.st_setsrid(extensions.st_makepoint(v.lng, v.lat), 4326)::extensions.geography
from (values ('maya-chen-photo', 34.0869, -118.2702), ('jonah-reyes', 34.0403, -118.2353), ('priya-frames', 34.1478, -118.1445),
             ('leo-spaces', 34.0195, -118.4912), ('sofia-wild', 34.0259, -118.7798), ('diego-alvarez', 33.7701, -118.1937),
             ('hana-kim-studio', 34.0618, -118.3004)) as v (slug, lat, lng)
where p.slug::text = v.slug and p.base_location is null;

-- Sofia also offers coaching and meetups.
insert into public.provider_services (provider_id, category_id)
select pg_temp.pid(s.slug), pg_temp.cat(s.cat)
from (values ('sofia-wild', 'coaching'), ('sofia-wild', 'meetups'), ('diego-alvarez', 'wedding'), ('diego-alvarez', 'event'))
  as s (slug, cat)
where pg_temp.pid(s.slug) is not null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Packages + add-ons
-- ---------------------------------------------------------------------------
select pg_temp.pkg('maya-chen-photo', 'wedding', 'Elopement', 'fixed', 1200, 2, 30, '{"edited_photos":150,"editing_level":"Natural color grade","turnaround_days":14,"deliverables":["Online gallery","Print release"]}', 1);
select pg_temp.pkg('maya-chen-photo', 'wedding', 'Full-Day Wedding', 'fixed', 4500, 8, 30, '{"edited_photos":600,"editing_level":"Full retouch on highlights","turnaround_days":42,"deliverables":["Online gallery","Sneak peek in 72h","Print release"]}', 2);
select pg_temp.pkg('maya-chen-photo', 'portrait', 'Portrait Session', 'fixed', 350, 1, 50, '{"edited_photos":40,"editing_level":"Natural color grade","turnaround_days":7,"deliverables":["Online gallery"]}', 3);
select pg_temp.addon('maya-chen-photo', 'Extra hour', 250, 1);
select pg_temp.addon('maya-chen-photo', 'Second shooter', 600, 2);
select pg_temp.addon('maya-chen-photo', 'Rush delivery (7 days)', 300, 3);
select pg_temp.addon('maya-chen-photo', 'Print set (20 × 8x10)', 150, 4);

select pg_temp.pkg('jonah-reyes', 'event', 'Event Coverage', 'hourly', 150, 3, 25, '{"edited_photos":120,"editing_level":"Film-style grade","turnaround_days":5,"deliverables":["Online gallery"]}', 1);
select pg_temp.pkg('jonah-reyes', 'portrait', 'Street Portrait Walk', 'fixed', 220, 1.5, 50, '{"edited_photos":25,"editing_level":"Film-style grade","turnaround_days":5,"deliverables":["Online gallery"]}', 2);
select pg_temp.addon('jonah-reyes', 'Extra hour', 150, 1);
select pg_temp.addon('jonah-reyes', 'Next-day delivery', 120, 2);

select pg_temp.pkg('priya-frames', 'graduation', 'Graduation Session', 'fixed', 400, 1.5, 50, '{"edited_photos":50,"editing_level":"Skin retouch included","turnaround_days":10,"deliverables":["Online gallery","Print release"]}', 1);
select pg_temp.pkg('priya-frames', 'headshots', 'Headshots', 'fixed', 275, 0.75, 50, '{"edited_photos":10,"editing_level":"Full retouch","turnaround_days":3,"deliverables":["Online gallery","LinkedIn crops"]}', 2);
select pg_temp.addon('priya-frames', 'Extra outfit / location', 90, 1);
select pg_temp.addon('priya-frames', 'Rush delivery (48h)', 100, 2);

select pg_temp.pkg('leo-spaces', 'real-estate', 'Listing Shoot', 'fixed', 300, 2, 30, '{"edited_photos":30,"editing_level":"HDR blend + sky replace","turnaround_days":2,"deliverables":["MLS-ready set","Web set"]}', 1);
select pg_temp.pkg('leo-spaces', 'product', 'Product Catalog', 'quote', null, null, 30, '{"editing_level":"Clipping paths, retouch","turnaround_days":7,"deliverables":["White background set"]}', 2);
select pg_temp.addon('leo-spaces', 'Twilight exterior', 175, 1);

select pg_temp.pkg('sofia-wild', 'coaching', '1:1 Coaching', 'hourly', 90, 2, 100, '{"editing_level":"Editing walkthrough","deliverables":["Settings cheat sheet"]}', 1);
select pg_temp.pkg('sofia-wild', 'meetups', 'Sunrise Meetup', 'fixed', 45, 2, 100, '{"deliverables":["Group spot guide"]}', 2);

select pg_temp.pkg('diego-alvarez', 'wedding', 'Wedding Day', 'fixed', 3200, 7, 25, '{"edited_photos":500,"editing_level":"Natural color grade","turnaround_days":35,"deliverables":["Online gallery","Highlight slideshow"]}', 1);
select pg_temp.pkg('diego-alvarez', 'event', 'Party / Event', 'hourly', 175, 4, 25, '{"edited_photos":200,"editing_level":"Natural color grade","turnaround_days":10,"deliverables":["Online gallery"]}', 2);
select pg_temp.addon('diego-alvarez', 'Second shooter', 450, 1);
select pg_temp.addon('diego-alvarez', 'Extra hour', 200, 2);

select pg_temp.pkg('hana-kim-studio', 'headshots', 'Studio Headshots', 'fixed', 225, 0.75, 50, '{"edited_photos":6,"editing_level":"Full retouch","turnaround_days":4,"deliverables":["Online gallery","LinkedIn crops"]}', 1);
select pg_temp.pkg('hana-kim-studio', 'portrait', 'Editorial Portrait', 'fixed', 480, 2, 50, '{"edited_photos":25,"editing_level":"Full retouch","turnaround_days":10,"deliverables":["Online gallery","Print release"]}', 2);
select pg_temp.addon('hana-kim-studio', 'Extra look', 80, 1);
select pg_temp.addon('hana-kim-studio', 'Hair & makeup touch-ups', 150, 2);

-- ---------------------------------------------------------------------------
-- Working hours (0 = Sunday) and a few blocked-off days
-- ---------------------------------------------------------------------------
insert into public.availability_rules (provider_id, weekday, start_time, end_time)
select pg_temp.pid(v.slug), d, v.s, v.e
from (values
  ('maya-chen-photo', array[2,3,4,5,6,0], '09:00'::time, '20:00'::time),
  ('jonah-reyes', array[1,2,3,4,5,6], '12:00', '23:00'),
  ('priya-frames', array[1,2,3,4,5,6], '08:00', '18:00'),
  ('leo-spaces', array[1,2,3,4,5], '08:00', '18:00'),
  ('sofia-wild', array[0,6], '05:00', '12:00'),
  ('diego-alvarez', array[4,5,6,0], '10:00', '23:00'),
  ('hana-kim-studio', array[1,2,3,4,5,6], '10:00', '19:00')
) as v (slug, days, s, e), unnest(v.days) d
where pg_temp.pid(v.slug) is not null
  and not exists (select 1 from public.availability_rules r where r.provider_id = pg_temp.pid(v.slug));

insert into public.blackouts (provider_id, during)
select pg_temp.pid(v.slug),
       tstzrange((current_date + v.from_day)::timestamp at time zone 'America/Los_Angeles',
                 (current_date + v.to_day + 1)::timestamp at time zone 'America/Los_Angeles')
from (values ('maya-chen-photo', 9, 10), ('jonah-reyes', 4, 5), ('priya-frames', 14, 14),
             ('hana-kim-studio', 7, 8), ('diego-alvarez', 20, 22)) as v (slug, from_day, to_day)
where pg_temp.pid(v.slug) is not null
  and not exists (select 1 from public.blackouts b where b.provider_id = pg_temp.pid(v.slug));

-- ---------------------------------------------------------------------------
-- Vendor listings (every other vertical; accounts from the "vendors" list in
-- docs/test-users.json). Needs migration 20261010000000_all_verticals + seed.sql
-- (or supabase/demo/all_verticals_setup.sql). Attributes follow each vertical's
-- JSON Schema; cap = max_concurrent (> 1 where catalog.js says concurrent: true).
-- ---------------------------------------------------------------------------
update public.profiles p set avatar_path = 'https://i.pravatar.cc/300?img=' || v.n
from (values ('ana.films', 5),
             ('northbound.media', 11),
             ('glasshouse.dtla', 20),
             ('rancholasflores', 26),
             ('goldenspoon', 51),
             ('seoulfood.truck', 49),
             ('chef.julien', 12),
             ('chef.priyanka', 23),
             ('sugarbloom', 41),
             ('crumbclub', 57),
             ('shakenstirred', 31),
             ('beanthere.cart', 53),
             ('djnova', 68),
             ('velvetstrings', 38),
             ('snaphappy.booth', 14),
             ('marvelous.max', 7),
             ('wildflower.co', 10),
             ('stemstudio', 59),
             ('popparty', 16),
             ('lumen.design', 18),
             ('glowbymina', 29),
             ('studio.rizos', 24),
             ('socalrentals', 61),
             ('amplify.av', 65),
             ('everly.events', 43),
             ('agenda.collective', 3),
             ('rev.sam', 54),
             ('lena.celebrant', 36),
             ('starline.limo', 67),
             ('coastclassics', 39),
             ('servicepros', 30),
             ('parkright.valet', 58),
             ('kneadedbliss', 35),
             ('sunriseflow', 27)) as v (username, n)
where p.username::text = v.username and p.avatar_path is null;

drop table if exists pg_temp.vendor_listings;
create temp table vendor_listings as
select * from (values
  ('ana-torres-films', '{"specialties":["Weddings","Elopements"],"styles":["Cinematic","Documentary"],"gear":{"cameras":["Sony FX3","Sony A7S III"],"drones":["DJI Mini 4 Pro"]},"drone_licensed":true}', 80, 1, 34.09, -118.265),
  ('northbound-media', '{"specialties":["Reels","Music videos","Aerials"],"styles":["Energetic","Bold color"],"gear":{"cameras":["RED Komodo","Sony FX6"],"drones":["DJI Inspire 3"]},"drone_licensed":true}', 60, 1, 34.1808, -118.309),
  ('glasshouse-dtla', '{"setting":"indoor-outdoor","capacity_seated":160,"capacity_standing":220,"amenities":["Bridal suite","Sound system","Rooftop terrace","Wheelchair accessible"],"address":"1100 E 3rd St, Los Angeles, CA","parking":"Valet + street parking","in_house_catering":false,"outside_catering_allowed":true,"alcohol_allowed":true,"curfew":"23:00"}', 0, 1, 34.042, -118.233),
  ('rancho-las-flores', '{"setting":"outdoor","capacity_seated":250,"capacity_standing":300,"amenities":["Vineyard lawn","Restored barn","Getting-ready cottage","On-site parking"],"address":"28700 Agoura Rd, Agoura Hills, CA","parking":"Free lot for 150 cars","in_house_catering":true,"outside_catering_allowed":true,"alcohol_allowed":true,"curfew":"22:00"}', 0, 1, 34.1364, -118.7745),
  ('golden-spoon-catering', '{"cuisines":["Mexican","Californian"],"dietary":["vegetarian","vegan","gluten-free"],"service_styles":["buffet","plated","family-style"],"min_guests":40,"max_guests":400,"staff_included":true}', 60, 3, 34.0336, -118.205),
  ('seoul-food-truck', '{"cuisines":["Korean","Korean-Mexican"],"dietary":["vegetarian","dairy-free"],"service_styles":["food-truck","drop-off"],"min_guests":15,"max_guests":250,"staff_included":false}', 50, 2, 34.058, -118.301),
  ('chef-julien', '{"cuisines":["French","Californian"],"dietary":["vegetarian","gluten-free","nut-free"],"max_guests":20,"training":"Le Cordon Bleu Paris"}', 40, 1, 34.09, -118.3617),
  ('spice-table', '{"cuisines":["Indian","Sri Lankan"],"dietary":["vegetarian","vegan","gluten-free","halal"],"max_guests":30}', 35, 1, 34.0211, -118.3965),
  ('sugar-and-bloom', '{"specialties":["Buttercream","Pressed flowers","Macarons"],"dietary":["gluten-free","vegan"],"delivery":true,"tastings":true}', 40, 4, 34.145, -118.15),
  ('crumb-club', '{"specialties":["Decorated cookies","Cupcakes"],"dietary":["vegan","nut-free"],"delivery":true,"tastings":false}', 30, 4, 34.0782, -118.2606),
  ('shaken-and-stirred', '{"bar_types":["full-bar","cocktails","mocktails"],"provides_alcohol":true,"liability_insured":true,"max_guests":300}', 60, 3, 33.759, -118.144),
  ('bean-there-coffee', '{"bar_types":["coffee","mocktails"],"provides_alcohol":false,"liability_insured":true,"max_guests":250}', 40, 2, 34.111, -118.192),
  ('dj-nova', '{"acts":["DJ","MC"],"genres":["Hip-hop","R&B","Cumbia","House","Top 40"],"languages":["English","Spanish"],"members":1,"equipment_included":true,"lighting_available":true}', 80, 1, 33.9617, -118.3531),
  ('velvet-strings', '{"acts":["String quartet","Solo violin"],"genres":["Classical","Pop covers","Jazz standards"],"members":4,"equipment_included":true,"lighting_available":false}', 100, 1, 34.1063, -118.2848),
  ('snap-happy-booth', '{"acts":["Photo booth","360 booth"],"age_groups":["all-ages"],"space_needed":"10 x 10 ft near an outlet","outdoor_ok":true}', 60, 1, 34.0953, -118.127),
  ('marvelous-max', '{"acts":["Magician","Balloon twisting"],"age_groups":["kids","adults"],"space_needed":"A small stage area","outdoor_ok":true}', 50, 1, 34.1508, -118.449),
  ('wildflower-and-co', '{"styles":["Garden","Romantic","Wild"],"flowers":["Garden roses","Ranunculus","Sweet peas","Olive branches"],"foam_free":true,"delivery":true}', 60, 3, 33.985, -118.4695),
  ('stem-studio', '{"styles":["Modern","Minimalist","Sculptural"],"flowers":["Anthurium","Orchids","Dried palms"],"foam_free":false,"delivery":true}', 40, 2, 34.0407, -118.2468),
  ('pop-and-party', '{"styles":["Organic balloons","Pastel","Bold"],"themes":["Baby shower","Quinceañera","Kids birthday"],"inventory_owned":true}', 50, 3, 33.9401, -118.1332),
  ('lumen-event-design', '{"styles":["Warm","Editorial","Minimal"],"themes":["Candlelit","Modern romance"],"inventory_owned":true}', 60, 2, 34.025, -118.48),
  ('glow-by-mina', '{"products":["Charlotte Tilbury","Armani Beauty","Kryolan"],"techniques":["Airbrush","Strip lashes"],"travel":true,"team_size":3}', 60, 1, 34.0736, -118.4004),
  ('studio-rizos', '{"products":["MAC","Olaplex"],"techniques":["Curly cuts","Updos","Gel nails"],"travel":true,"team_size":2}', 50, 1, 34.0239, -118.172),
  ('socal-party-rentals', '{"inventory":[{"item":"Gold Chiavari chair","quantity":600,"price_cents":800},{"item":"60\" round table","quantity":80,"price_cents":1500},{"item":"20x40 frame tent","quantity":6}],"delivery":true,"setup":true}', 80, 10, 34.0006, -118.1598),
  ('amplify-av', '{"inventory":[{"item":"PA speaker pair","quantity":12},{"item":"Wireless mic","quantity":30},{"item":"Projector + 10 ft screen","quantity":6}],"delivery":true,"setup":true}', 70, 6, 34.1899, -118.4514),
  ('everly-events', '{"specialties":["Weddings","Proposals"],"languages":["English","French"],"certifications":["Certified Wedding Planner (AACWP)"],"team_size":4}', 100, 4, 34.0522, -118.4737),
  ('agenda-collective', '{"specialties":["Corporate","Product launches","Holiday parties"],"languages":["English"],"team_size":9}', 80, 5, 34.056, -118.417),
  ('ceremonies-by-sam', '{"ceremony_types":["Non-religious","Christian","Interfaith"],"languages":["English"],"ordained_by":"Universal Life Church"}', 80, 1, 34.005, -118.332),
  ('lena-hart-celebrant', '{"ceremony_types":["Non-religious","Spiritual"],"languages":["English","Spanish"],"ordained_by":"American Marriage Ministries"}', 120, 1, 34.0936, -118.6017),
  ('starline-limo', '{"fleet":[{"vehicle":"Stretch Lincoln limo","passengers":10,"quantity":3},{"vehicle":"Party bus","passengers":30,"quantity":2}],"licensed":true}', 100, 5, 33.9192, -118.4165),
  ('coast-classic-cars', '{"fleet":[{"vehicle":"1957 Rolls-Royce Silver Cloud","passengers":4,"quantity":1},{"vehicle":"24-seat shuttle","passengers":24,"quantity":2}],"licensed":true}', 80, 3, 33.8358, -118.3406),
  ('service-pros-la', '{"roles":["servers","bartenders","cleanup"],"team_size":60,"insured":true}', 70, 8, 33.9164, -118.3526),
  ('parkright-valet', '{"roles":["valet","security"],"team_size":40,"insured":true}', 60, 6, 34.1425, -118.2551),
  ('kneaded-bliss', '{"modalities":["Swedish","Deep tissue","Prenatal"],"certifications":["California CAMTC certified"],"comes_to_you":true,"brings_equipment":true}', 40, 1, 34.1396, -118.387),
  ('sunrise-flow-yoga', '{"modalities":["Vinyasa","Yin","Strength"],"certifications":["RYT-500","NASM-CPT"],"comes_to_you":true,"brings_equipment":true}', 50, 1, 33.8847, -118.4109)
) as v (slug, attrs, radius, cap, lat, lng);

-- Fields, service area, policy and badges (only while the listing is still blank).
update public.providers p set
  attributes = v.attrs::jsonb,
  service_radius_km = v.radius,
  cancellation_policy_id = (select id from public.cancellation_policies where provider_id is null
    and name = case c.slug when 'venue' then 'Strict' when 'planning' then 'Strict'
                           when 'wellness' then 'Flexible' when 'private-chef' then 'Flexible' else 'Moderate' end),
  identity_verified = true,
  is_pro = v.slug in ('glasshouse-dtla', 'golden-spoon-catering', 'dj-nova', 'wildflower-and-co', 'everly-events', 'starline-limo')
from vendor_listings v, public.service_categories c
where p.slug::text = v.slug and c.id = p.vertical_id and p.attributes = '{}'::jsonb;

-- Capacity: how many events they can work at once.
update public.providers p set max_concurrent = v.cap
from vendor_listings v
where p.slug::text = v.slug and p.max_concurrent <> v.cap;

-- Where each vendor is based (venues have a 0 km radius: they don't travel).
update public.providers p set base_location = extensions.st_setsrid(extensions.st_makepoint(v.lng, v.lat), 4326)::extensions.geography
from vendor_listings v
where p.slug::text = v.slug and p.base_location is null;

-- Services they offer (the seed script adds these too; this keeps the demo self-contained).
insert into public.provider_services (provider_id, category_id)
select pg_temp.pid(s.slug), pg_temp.cat(s.cat)
from (values ('ana-torres-films', 'wedding-film'), ('ana-torres-films', 'event-recap'), ('northbound-media', 'social-reels'), ('northbound-media', 'music-video'),
             ('northbound-media', 'drone'), ('northbound-media', 'event-recap'), ('glasshouse-dtla', 'wedding-venue'), ('glasshouse-dtla', 'party-space'),
             ('glasshouse-dtla', 'studio-space'), ('rancho-las-flores', 'wedding-venue'), ('rancho-las-flores', 'garden-estate'), ('rancho-las-flores', 'party-space'),
             ('golden-spoon-catering', 'full-service-catering'), ('golden-spoon-catering', 'buffet'), ('golden-spoon-catering', 'plated-dinner'), ('seoul-food-truck', 'food-truck'),
             ('seoul-food-truck', 'drop-off-catering'), ('seoul-food-truck', 'brunch'), ('chef-julien', 'chef-dinner'), ('chef-julien', 'tasting-menu'),
             ('spice-table', 'chef-dinner'), ('spice-table', 'meal-prep'), ('spice-table', 'cooking-class'), ('sugar-and-bloom', 'wedding-cake'),
             ('sugar-and-bloom', 'celebration-cake'), ('sugar-and-bloom', 'dessert-table'), ('crumb-club', 'cupcakes-cookies'), ('crumb-club', 'celebration-cake'),
             ('shaken-and-stirred', 'mobile-bar'), ('shaken-and-stirred', 'mixology'), ('shaken-and-stirred', 'bartender'), ('bean-there-coffee', 'coffee-cart'),
             ('dj-nova', 'dj'), ('dj-nova', 'mc'), ('velvet-strings', 'string-quartet'), ('velvet-strings', 'solo-musician'),
             ('snap-happy-booth', 'photo-booth'), ('marvelous-max', 'magician'), ('marvelous-max', 'kids-entertainer'), ('wildflower-and-co', 'bridal-bouquet'),
             ('wildflower-and-co', 'centerpieces'), ('wildflower-and-co', 'ceremony-florals'), ('wildflower-and-co', 'floral-installation'), ('stem-studio', 'centerpieces'),
             ('stem-studio', 'floral-installation'), ('pop-and-party', 'balloon-decor'), ('pop-and-party', 'backdrops'), ('pop-and-party', 'themed-decor'),
             ('lumen-event-design', 'lighting-design'), ('lumen-event-design', 'tablescapes'), ('lumen-event-design', 'backdrops'), ('glow-by-mina', 'bridal-makeup'),
             ('glow-by-mina', 'event-makeup'), ('glow-by-mina', 'lashes-brows'), ('studio-rizos', 'hair-styling'), ('studio-rizos', 'event-makeup'),
             ('studio-rizos', 'nails'), ('socal-party-rentals', 'tables-chairs'), ('socal-party-rentals', 'tents'), ('socal-party-rentals', 'linens'),
             ('socal-party-rentals', 'bounce-houses'), ('amplify-av', 'av-equipment'), ('everly-events', 'full-planning'), ('everly-events', 'day-of-coordination'),
             ('everly-events', 'proposal-planning'), ('agenda-collective', 'corporate-planning'), ('agenda-collective', 'day-of-coordination'), ('ceremonies-by-sam', 'wedding-officiant'),
             ('ceremonies-by-sam', 'vow-renewal'), ('ceremonies-by-sam', 'elopement-officiant'), ('lena-hart-celebrant', 'wedding-officiant'), ('lena-hart-celebrant', 'elopement-officiant'),
             ('starline-limo', 'limo'), ('starline-limo', 'party-bus'), ('coast-classic-cars', 'classic-car'), ('coast-classic-cars', 'guest-shuttle'),
             ('service-pros-la', 'servers'), ('service-pros-la', 'cleanup-crew'), ('parkright-valet', 'valet'), ('parkright-valet', 'security'),
             ('kneaded-bliss', 'massage'), ('kneaded-bliss', 'spa-day'), ('sunrise-flow-yoga', 'yoga'), ('sunrise-flow-yoga', 'personal-training')
) as s (slug, cat)
where pg_temp.pid(s.slug) is not null and pg_temp.cat(s.cat) is not null
on conflict do nothing;

-- Vendor packages: vpkg(listing, service, name, price type, price in cents, hours,
-- min guests/pieces, max guests/pieces, deposit %, attributes, order).
select pg_temp.vpkg('ana-torres-films', 'wedding-film', 'Wedding Highlight Film', 'fixed', 280000, 8, null, null, 30, '{"film_minutes":20,"highlight_minutes":5,"raw_footage":false,"turnaround_days":60,"deliverables":["Highlight film","Full ceremony edit"]}', 1);
select pg_temp.vpkg('ana-torres-films', 'event-recap', 'Event Recap', 'fixed', 90000, 4, null, null, 30, '{"highlight_minutes":3,"turnaround_days":14,"deliverables":["3-minute recap","Vertical cut for socials"]}', 2);
select pg_temp.addon('ana-torres-films', 'Drone coverage', 400, 1);
select pg_temp.addon('ana-torres-films', 'Second shooter', 650, 2);

select pg_temp.vpkg('northbound-media', 'social-reels', 'Same-Day Reels', 'hourly', 22500, 3, null, null, 30, '{"highlight_minutes":1,"turnaround_days":1,"deliverables":["3 vertical reels"]}', 1);
select pg_temp.vpkg('northbound-media', 'drone', 'Drone Aerials', 'fixed', 60000, 2, null, null, 30, '{"raw_footage":true,"turnaround_days":7,"deliverables":["Graded aerial clips"]}', 2);
select pg_temp.addon('northbound-media', 'Rush edit (48h)', 250, 1);

select pg_temp.vpkg('glasshouse-dtla', 'wedding-venue', 'Saturday Wedding Day', 'daily', 650000, 12, 50, 160, 50, '{"hours_included":12,"spaces":["Main loft","Rooftop terrace"],"includes":["Tables & chairs for 160","Bridal suite","Day-of venue manager"]}', 1);
select pg_temp.vpkg('glasshouse-dtla', 'party-space', 'Weekday Event Rental', 'daily', 350000, 8, 20, 220, 50, '{"hours_included":8,"spaces":["Main loft"],"includes":["Cocktail tables","Sound system"],"weekday_only":true}', 2);
select pg_temp.addon('glasshouse-dtla', 'Extra hour', 600, 1);
select pg_temp.addon('glasshouse-dtla', 'Ceremony rehearsal slot', 400, 2);

select pg_temp.vpkg('rancho-las-flores', 'garden-estate', 'Garden Estate Day', 'daily', 850000, 12, 50, 250, 50, '{"hours_included":12,"spaces":["Vineyard lawn","Barn"],"includes":["Ceremony chairs","Farm tables","Bistro lighting"]}', 1);
select pg_temp.vpkg('rancho-las-flores', 'party-space', 'Barn Party', 'daily', 420000, 8, 30, 150, 50, '{"hours_included":8,"spaces":["Barn"],"includes":["Farm tables","Bistro lighting"]}', 2);
select pg_temp.addon('rancho-las-flores', 'Getting-ready cottage (morning)', 500, 1);

select pg_temp.vpkg('golden-spoon-catering', 'plated-dinner', 'Plated Dinner', 'per_person', 6500, 5, 40, 300, 30, '{"service_style":"plated","courses":3,"menu":["Seasonal salad","Short rib or chile relleno","Tres leches"],"dietary":["vegetarian","gluten-free"],"staff_included":true,"tableware_included":true}', 1);
select pg_temp.vpkg('golden-spoon-catering', 'buffet', 'Taco & Grill Buffet', 'per_person', 4500, 4, 40, 400, 30, '{"service_style":"buffet","courses":2,"menu":["Carne asada","Al pastor","Grilled veggies","Churros"],"dietary":["vegetarian","vegan","gluten-free"],"staff_included":true,"tableware_included":false}', 2);
select pg_temp.addon('golden-spoon-catering', 'Passed appetizers (per event)', 600, 1);
select pg_temp.addon('golden-spoon-catering', 'Late-night snack', 450, 2);

select pg_temp.vpkg('seoul-food-truck', 'food-truck', 'Food Truck Night', 'per_person', 2800, 3, 50, 250, 30, '{"service_style":"food-truck","courses":1,"menu":["Bulgogi tacos","Spicy pork bowl","Tofu bowl"],"dietary":["vegetarian"]}', 1);
select pg_temp.vpkg('seoul-food-truck', 'drop-off-catering', 'Brunch Drop-off', 'per_person', 2200, 1, 15, 120, 30, '{"service_style":"drop-off","menu":["Kimchi fried rice","Fruit platter","Mini pastries"],"dietary":["vegetarian","dairy-free"],"tableware_included":true}', 2);
select pg_temp.addon('seoul-food-truck', 'Extra truck hour', 250, 1);

select pg_temp.vpkg('chef-julien', 'chef-dinner', 'Seasonal Dinner Party', 'per_person', 12500, 4, 6, 20, 50, '{"courses":4,"menu":["Burrata & stone fruit","Halibut beurre blanc","Chocolate pot de crème"],"groceries_included":true,"cleanup_included":true,"serving_staff_included":false}', 1);
select pg_temp.vpkg('chef-julien', 'tasting-menu', '7-Course Tasting Menu', 'per_person', 19500, 5, 4, 12, 50, '{"courses":7,"groceries_included":true,"cleanup_included":true,"serving_staff_included":true}', 2);
select pg_temp.addon('chef-julien', 'Wine pairing (per guest)', 65, 1);

select pg_temp.vpkg('spice-table', 'chef-dinner', 'Indian Feast Dinner', 'per_person', 8500, 4, 6, 30, 50, '{"courses":3,"menu":["Chaat bar","Butter chicken & dal","Cardamom kulfi"],"dietary":["vegetarian","halal"],"groceries_included":true,"cleanup_included":true}', 1);
select pg_temp.vpkg('spice-table', 'cooking-class', 'Hands-on Cooking Class', 'per_person', 7500, 3, 4, 12, 50, '{"courses":2,"groceries_included":true,"cleanup_included":true}', 2);

select pg_temp.vpkg('sugar-and-bloom', 'wedding-cake', '3-Tier Wedding Cake', 'per_item', 65000, 2, 1, 3, 50, '{"servings":100,"tiers":3,"flavors":["Vanilla bean","Lemon raspberry","Chocolate"],"delivery_included":true,"setup_included":true}', 1);
select pg_temp.vpkg('sugar-and-bloom', 'celebration-cake', 'Celebration Cake', 'per_item', 9500, 1, 1, 10, 50, '{"servings":20,"tiers":1,"flavors":["Vanilla","Chocolate","Ube"]}', 2);
select pg_temp.vpkg('sugar-and-bloom', 'dessert-table', 'Dessert Table', 'fixed', 85000, 3, null, 150, 50, '{"servings":100,"flavors":["Macarons","Mini tarts","Cake pops"],"delivery_included":true,"setup_included":true}', 3);
select pg_temp.addon('sugar-and-bloom', 'Cake tasting box', 45, 1);

select pg_temp.vpkg('crumb-club', 'cupcakes-cookies', 'Cupcakes', 'per_item', 500, 1, 24, 600, 50, '{"servings":1,"flavors":["Vanilla","Red velvet","Cookies & cream"],"units_per_guest":1,"delivery_included":false}', 1);
select pg_temp.vpkg('crumb-club', 'cupcakes-cookies', 'Decorated Sugar Cookies', 'per_item', 600, 1, 24, 600, 50, '{"servings":1,"units_per_guest":1}', 2);
select pg_temp.vpkg('crumb-club', 'celebration-cake', 'Birthday Cake', 'per_item', 8500, 1, 1, 5, 50, '{"servings":20,"tiers":1,"flavors":["Funfetti","Chocolate"]}', 3);
select pg_temp.addon('crumb-club', 'Delivery', 35, 1);

select pg_temp.vpkg('shaken-and-stirred', 'mobile-bar', 'Open Bar Package', 'per_person', 3800, 4, 50, 300, 30, '{"hours_included":4,"bartenders":2,"signature_cocktails":2,"alcohol_included":true,"menu":["Spicy margarita","Paloma","Beer & wine"],"glassware_included":true}', 1);
select pg_temp.vpkg('shaken-and-stirred', 'bartender', 'Bartending Service (BYO alcohol)', 'hourly', 5500, 4, null, null, 30, '{"bartenders":1,"alcohol_included":false,"glassware_included":false}', 2);
select pg_temp.addon('shaken-and-stirred', 'Extra bartender', 220, 1);
select pg_temp.addon('shaken-and-stirred', 'Champagne toast', 300, 2);

select pg_temp.vpkg('bean-there-coffee', 'coffee-cart', 'Espresso Bar', 'per_person', 900, 3, 50, 250, 30, '{"hours_included":3,"bartenders":1,"alcohol_included":false,"menu":["Latte","Cold brew","Horchata latte"]}', 1);
select pg_temp.addon('bean-there-coffee', 'Custom latte art logo', 150, 1);

select pg_temp.vpkg('dj-nova', 'dj', 'DJ Set', 'hourly', 25000, 4, null, null, 30, '{"sets":1,"set_minutes":240,"musicians":1,"equipment_included":true,"lighting_included":false,"song_requests":true}', 1);
select pg_temp.vpkg('dj-nova', 'mc', 'Wedding DJ + MC', 'fixed', 180000, 6, null, null, 30, '{"sets":1,"set_minutes":360,"musicians":1,"equipment_included":true,"lighting_included":true,"ceremony_music":true,"mc_included":true,"song_requests":true}', 2);
select pg_temp.addon('dj-nova', 'Dance floor uplighting', 300, 1);
select pg_temp.addon('dj-nova', 'Extra hour', 250, 2);

select pg_temp.vpkg('velvet-strings', 'string-quartet', 'Ceremony Quartet', 'fixed', 110000, 1.5, null, null, 30, '{"sets":1,"set_minutes":60,"musicians":4,"ceremony_music":true,"song_requests":true}', 1);
select pg_temp.vpkg('velvet-strings', 'solo-musician', 'Cocktail Hour Soloist', 'hourly', 20000, 2, null, null, 30, '{"sets":1,"set_minutes":90,"musicians":1,"song_requests":true}', 2);
select pg_temp.addon('velvet-strings', 'Custom arrangement', 250, 1);

select pg_temp.vpkg('snap-happy-booth', 'photo-booth', 'Open-air Photo Booth', 'hourly', 17500, 3, null, null, 30, '{"performers":1,"includes":["Unlimited prints","Props","Online gallery"],"prints_included":true,"setup_minutes":45}', 1);
select pg_temp.vpkg('snap-happy-booth', 'photo-booth', '360 Video Booth', 'hourly', 25000, 3, null, null, 30, '{"performers":2,"includes":["Slow-motion clips","Instant sharing"],"prints_included":false,"setup_minutes":60}', 2);
select pg_temp.addon('snap-happy-booth', 'Custom print template', 75, 1);

select pg_temp.vpkg('marvelous-max', 'kids-entertainer', 'Kids Magic Show', 'fixed', 35000, 1, null, 40, 50, '{"performers":1,"includes":["45-minute show","Balloon animals"],"setup_minutes":15}', 1);
select pg_temp.vpkg('marvelous-max', 'magician', 'Strolling Close-up Magic', 'hourly', 22500, 2, null, null, 50, '{"performers":1,"includes":["Table-to-table magic"]}', 2);

select pg_temp.vpkg('wildflower-and-co', 'centerpieces', 'Centerpieces', 'per_item', 8500, 2, 5, 60, 30, '{"pieces":1,"flowers":["Garden roses","Ranunculus"],"color_palette":["Blush","Ivory"],"vessels_included":true,"delivery_included":true,"setup_included":true,"units_per_guest":0.125}', 1);
select pg_temp.vpkg('wildflower-and-co', 'bridal-bouquet', 'Bridal Bouquet', 'per_item', 22500, 1, 1, 10, 30, '{"pieces":1,"flowers":["Garden roses","Sweet peas"],"delivery_included":true}', 2);
select pg_temp.vpkg('wildflower-and-co', 'ceremony-florals', 'Ceremony Arch', 'fixed', 120000, 3, null, null, 30, '{"pieces":1,"color_palette":["Blush","Ivory","Sage"],"delivery_included":true,"setup_included":true}', 3);
select pg_temp.addon('wildflower-and-co', 'Bridesmaid bouquet', 95, 1);
select pg_temp.addon('wildflower-and-co', 'Boutonniere', 25, 2);

select pg_temp.vpkg('stem-studio', 'centerpieces', 'Bud Vase Trio', 'per_item', 3500, 1, 10, 100, 30, '{"pieces":3,"flowers":["Orchids","Anthurium"],"vessels_included":true,"delivery_included":true,"units_per_guest":0.125}', 1);
select pg_temp.vpkg('stem-studio', 'floral-installation', 'Hanging Installation', 'quote', null, 4, null, null, 30, '{"setup_included":true,"delivery_included":true}', 2);

select pg_temp.vpkg('pop-and-party', 'balloon-decor', 'Balloon Garland', 'fixed', 45000, 2, null, null, 50, '{"includes":["12 ft organic garland"],"color_palette":["Your colors"],"setup_included":true,"teardown_included":false}', 1);
select pg_temp.vpkg('pop-and-party', 'backdrops', 'Backdrop + Balloon Wall', 'fixed', 75000, 3, null, null, 50, '{"theme":"Custom","includes":["8 ft arch backdrop","Balloon garland","Neon sign"],"setup_included":true,"teardown_included":true}', 2);
select pg_temp.addon('pop-and-party', 'Teardown', 100, 1);
select pg_temp.addon('pop-and-party', 'Custom neon sign', 175, 2);

select pg_temp.vpkg('lumen-event-design', 'lighting-design', 'Uplighting (20 fixtures)', 'fixed', 90000, 6, null, null, 30, '{"includes":["20 wireless uplights","Color matching"],"setup_included":true,"teardown_included":true}', 1);
select pg_temp.vpkg('lumen-event-design', 'tablescapes', 'Tablescape Design', 'quote', null, 6, null, null, 30, '{"includes":["Linens","Candles","Chargers"],"setup_included":true,"teardown_included":true}', 2);
select pg_temp.addon('lumen-event-design', 'Pin-spot lighting', 350, 1);

select pg_temp.vpkg('glow-by-mina', 'bridal-makeup', 'Bridal Hair & Makeup', 'fixed', 45000, 2.5, null, null, 50, '{"services":["Hair","Makeup","Lashes"],"trial_included":true,"on_location":true,"touch_up_hours":0,"lashes_included":true}', 1);
select pg_temp.vpkg('glow-by-mina', 'event-makeup', 'Bridal Party Glam', 'per_person', 15000, 4, 2, 8, 50, '{"services":["Hair","Makeup"],"on_location":true,"lashes_included":true}', 2);
select pg_temp.addon('glow-by-mina', 'Touch-ups (per hour)', 120, 1);

select pg_temp.vpkg('studio-rizos', 'hair-styling', 'Quince Glam', 'fixed', 28000, 3, null, null, 50, '{"services":["Hair","Makeup","Nails"],"trial_included":false,"on_location":true,"lashes_included":true}', 1);
select pg_temp.vpkg('studio-rizos', 'hair-styling', 'Event Hair Styling', 'per_person', 9500, 1, 1, 6, 50, '{"services":["Hair"],"on_location":true}', 2);

select pg_temp.vpkg('socal-party-rentals', 'tables-chairs', 'Chiavari Chairs', 'per_item', 800, 12, 20, 600, 30, '{"item":"Gold Chiavari chair","color":"Gold","available":600,"units_per_guest":1,"delivery_included":true,"setup_included":true}', 1);
select pg_temp.vpkg('socal-party-rentals', 'tables-chairs', 'Round Tables (seat 8)', 'per_item', 1500, 12, 3, 80, 30, '{"item":"60\" round table","dimensions":"60\" round","available":80,"units_per_guest":0.125,"delivery_included":true,"setup_included":true}', 2);
select pg_temp.vpkg('socal-party-rentals', 'linens', 'Table Linens', 'per_item', 1800, 12, 3, 200, 30, '{"item":"120\" round linen","color":"Ivory","available":200,"units_per_guest":0.125}', 3);
select pg_temp.vpkg('socal-party-rentals', 'bounce-houses', 'Bounce House', 'per_item', 22500, 6, 1, 4, 30, '{"item":"Castle bounce house","dimensions":"15 x 15 ft","available":4,"delivery_included":true,"setup_included":true}', 4);
select pg_temp.addon('socal-party-rentals', 'Evening pickup', 75, 1);

select pg_temp.vpkg('amplify-av', 'av-equipment', 'PA Speaker Package', 'per_item', 25000, 8, 1, 6, 30, '{"item":"PA speaker pair + mixer","available":12,"delivery_included":true,"setup_included":true}', 1);
select pg_temp.vpkg('amplify-av', 'av-equipment', 'Wireless Mic', 'per_item', 4500, 8, 1, 30, 30, '{"item":"Shure wireless handheld","available":30}', 2);
select pg_temp.vpkg('amplify-av', 'av-equipment', 'Projector + Screen', 'per_item', 17500, 8, 1, 6, 30, '{"item":"Projector + 10 ft screen","available":6,"delivery_included":true,"setup_included":true}', 3);
select pg_temp.addon('amplify-av', 'On-site AV tech (per event)', 300, 1);

select pg_temp.vpkg('everly-events', 'full-planning', 'Full Wedding Planning', 'fixed', 650000, 12, null, null, 25, '{"months_of_planning":12,"day_of_hours":12,"meetings":10,"vendor_referrals":true,"budget_tracking":true}', 1);
select pg_temp.vpkg('everly-events', 'day-of-coordination', 'Day-of Coordination', 'fixed', 180000, 10, null, null, 25, '{"months_of_planning":1,"day_of_hours":10,"meetings":2,"vendor_referrals":false}', 2);
select pg_temp.vpkg('everly-events', 'proposal-planning', 'Proposal Planning', 'fixed', 95000, 3, null, null, 50, '{"months_of_planning":1,"day_of_hours":3,"meetings":1,"includes":["Location scouting","Hidden photographer","Floral setup"]}', 3);
select pg_temp.addon('everly-events', 'Rehearsal coordination', 400, 1);

select pg_temp.vpkg('agenda-collective', 'corporate-planning', 'Corporate Event Production', 'quote', null, 8, null, null, 30, '{"months_of_planning":3,"vendor_referrals":true,"budget_tracking":true}', 1);
select pg_temp.vpkg('agenda-collective', 'corporate-planning', 'Offsite Coordination', 'fixed', 250000, 8, null, null, 30, '{"months_of_planning":1,"day_of_hours":8,"meetings":3,"budget_tracking":true}', 2);

select pg_temp.vpkg('ceremonies-by-sam', 'wedding-officiant', 'Custom Wedding Ceremony', 'fixed', 65000, 1, null, null, 50, '{"ceremony_minutes":25,"meetings":2,"custom_ceremony":true,"rehearsal_included":true,"license_filing":true}', 1);
select pg_temp.vpkg('ceremonies-by-sam', 'elopement-officiant', 'Elopement Ceremony', 'fixed', 25000, 0.5, null, null, 100, '{"ceremony_minutes":10,"meetings":0,"license_filing":true}', 2);
select pg_temp.addon('ceremonies-by-sam', 'Rehearsal (separate day)', 150, 1);

select pg_temp.vpkg('lena-hart-celebrant', 'elopement-officiant', 'Elopement Ceremony', 'fixed', 35000, 1, null, null, 100, '{"ceremony_minutes":15,"meetings":1,"custom_ceremony":true,"license_filing":true}', 1);
select pg_temp.vpkg('lena-hart-celebrant', 'wedding-officiant', 'Bilingual Wedding Ceremony', 'fixed', 80000, 1, null, null, 50, '{"ceremony_minutes":30,"meetings":2,"custom_ceremony":true,"rehearsal_included":false,"license_filing":true}', 2);

select pg_temp.vpkg('starline-limo', 'limo', 'Stretch Limo', 'hourly', 14500, 3, null, null, 30, '{"vehicle":"Stretch Lincoln limo","passengers":10,"min_hours":3,"chauffeur_included":true,"includes":["Bottled water","Red carpet"]}', 1);
select pg_temp.vpkg('starline-limo', 'party-bus', 'Party Bus (30 guests)', 'hourly', 29500, 4, null, 30, 30, '{"vehicle":"Party bus","passengers":30,"min_hours":4,"chauffeur_included":true,"includes":["Sound system","LED lighting"]}', 2);
select pg_temp.addon('starline-limo', 'Champagne toast', 120, 1);

select pg_temp.vpkg('coast-classic-cars', 'classic-car', '1957 Rolls-Royce Getaway', 'hourly', 22500, 2, null, null, 50, '{"vehicle":"1957 Rolls-Royce Silver Cloud","passengers":4,"min_hours":2,"chauffeur_included":true,"includes":["Just Married sign"]}', 1);
select pg_temp.vpkg('coast-classic-cars', 'guest-shuttle', 'Guest Shuttle (24 seats)', 'hourly', 16500, 4, null, 24, 30, '{"vehicle":"24-seat shuttle","passengers":24,"min_hours":4,"chauffeur_included":true}', 2);

select pg_temp.vpkg('service-pros-la', 'servers', 'Serving Team (4 servers)', 'hourly', 16000, 5, null, null, 30, '{"role":"servers","staff":4,"min_hours":4,"attire":"All black","includes":["Captain on site"]}', 1);
select pg_temp.vpkg('service-pros-la', 'cleanup-crew', 'Cleanup Crew (3 people)', 'hourly', 10500, 3, null, null, 30, '{"role":"cleanup","staff":3,"min_hours":3,"includes":["Trash removal"]}', 2);

select pg_temp.vpkg('parkright-valet', 'valet', 'Valet Team (3 attendants)', 'hourly', 13500, 5, null, null, 30, '{"role":"valet","staff":3,"min_hours":4,"attire":"Branded polos"}', 1);
select pg_temp.vpkg('parkright-valet', 'security', 'Licensed Security Guard', 'hourly', 5500, 5, null, null, 30, '{"role":"security","staff":1,"min_hours":4,"attire":"Suit"}', 2);

select pg_temp.vpkg('kneaded-bliss', 'massage', 'In-home Massage (60 min)', 'fixed', 14000, 1, null, 1, 50, '{"session_minutes":60,"max_people":1,"equipment_included":true}', 1);
select pg_temp.vpkg('kneaded-bliss', 'spa-day', 'Bridal Party Spa Day', 'per_person', 12000, 4, 3, 10, 50, '{"session_minutes":45,"max_people":10,"equipment_included":true,"includes":["Massage","Hand treatment"]}', 2);
select pg_temp.addon('kneaded-bliss', 'Hot stones', 30, 1);

select pg_temp.vpkg('sunrise-flow-yoga', 'yoga', 'Private Group Yoga', 'fixed', 18000, 1, null, 12, 50, '{"session_minutes":60,"max_people":12,"equipment_included":true}', 1);
select pg_temp.vpkg('sunrise-flow-yoga', 'personal-training', 'Personal Training Session', 'fixed', 9500, 1, null, 2, 50, '{"session_minutes":60,"max_people":2,"equipment_included":true}', 2);

-- ---------------------------------------------------------------------------
-- Bookings, reviews and chats
-- ---------------------------------------------------------------------------
do $$
declare b uuid;
begin
  -- Past, completed and reviewed (these give everyone real ratings).
  b := pg_temp.booking('jordanlee', 'maya-chen-photo', 'Portrait Session', -60, '17:30', array['requested','accepted','confirmed','in_progress','delivered','completed'], array[-75,-74,-74,-60,-53,-50], 'Griffith Observatory');
  perform pg_temp.reviews(b, 5::smallint, 'Maya made it feel effortless. Photos came back a week early!', 5::smallint, 'On time, clear about what they wanted. Great client.', 48);
  b := pg_temp.booking('rosa.d', 'maya-chen-photo', 'Elopement', -45, '16:00', array['requested','accepted','confirmed','in_progress','delivered','completed'], array[-90,-89,-88,-45,-35,-30], 'Malibu Rocky Oaks');
  perform pg_temp.reviews(b, 5::smallint, 'Calm, organized, and the golden hour portraits are unreal.', 5::smallint, 'Lovely couple, easy to work with.', 28);
  b := pg_temp.booking('kai.film', 'maya-chen-photo', 'Portrait Session', -20, '18:00', array['requested','accepted','confirmed','in_progress','delivered','completed'], array[-30,-30,-29,-20,-14,-12], 'Echo Park Lake');
  perform pg_temp.reviews(b, 4::smallint, 'Beautiful work. Communication was a little slow during peak season.', 5::smallint, null, 10);

  b := pg_temp.booking('sampatel', 'jonah-reyes', 'Event Coverage', -40, '19:00', array['requested','accepted','confirmed','in_progress','delivered','completed'], array[-50,-50,-49,-40,-37,-35], 'Arts District, Los Angeles');
  perform pg_temp.reviews(b, 5::smallint, 'Jonah captured our launch party perfectly. Total pro.', 4::smallint, 'Good event, venue access was a bit late.', 33);
  b := pg_temp.booking('briankimdw', 'jonah-reyes', 'Street Portrait Walk', -39, '18:30', array['requested','accepted','confirmed','in_progress','delivered','completed'], array[-49,-49,-48,-39,-35,-33], 'Arts District');
  perform pg_temp.reviews(b, 5::smallint, 'Great eye for night light, super relaxed walk.', 5::smallint, 'Fun shoot, great energy.', 31);

  b := pg_temp.booking('jordanlee', 'priya-frames', 'Graduation Session', -120, '17:00', array['requested','accepted','confirmed','in_progress','delivered','completed'], array[-130,-129,-129,-120,-112,-110], 'UCLA campus');
  perform pg_temp.reviews(b, 5::smallint, 'Super easy to work with, the gallery was gorgeous.', 5::smallint, 'Came prepared with a shot list. Perfect.', 108);
  b := pg_temp.booking('taylorb', 'priya-frames', 'Headshots', -25, '10:00', array['requested','accepted','confirmed','in_progress','delivered','completed'], array[-30,-30,-29,-25,-23,-21], 'Pasadena studio');
  perform pg_temp.reviews(b, 5::smallint, 'Fast turnaround and great direction for someone camera-shy.', 4::smallint, null, 19);

  b := pg_temp.booking('sampatel', 'leo-spaces', 'Listing Shoot', -33, '14:00', array['requested','accepted','confirmed','in_progress','delivered','completed'], array[-40,-40,-39,-33,-31,-29], 'Venice, CA', null, array['Twilight exterior']);
  perform pg_temp.reviews(b, 4::smallint, 'Sharp, clean images. The twilight shots sold the house.', 5::smallint, 'Property was ready on time, thanks!', 27);

  b := pg_temp.booking('kai.film', 'sofia-wild', '1:1 Coaching', -18, '06:00', array['requested','accepted','confirmed','in_progress','delivered','completed'], array[-25,-25,-24,-18,-18,-17], 'El Matador Beach');
  perform pg_temp.reviews(b, 5::smallint, 'Finally nailed long exposure. Patient teacher.', 5::smallint, null, 15);

  b := pg_temp.booking('rosa.d', 'diego-alvarez', 'Party / Event', -50, '17:00', array['requested','accepted','confirmed','in_progress','delivered','completed'], array[-70,-69,-69,-50,-42,-40], 'Long Beach');
  perform pg_temp.reviews(b, 5::smallint, 'Diego caught every moment with our abuela. We cried looking at the gallery.', 5::smallint, 'Wonderful family.', 38);
  b := pg_temp.booking('taylorb', 'diego-alvarez', 'Party / Event', -15, '18:00', array['requested','accepted','confirmed','in_progress','delivered','completed'], array[-22,-22,-21,-15,-10,-8], 'San Pedro');
  perform pg_temp.reviews(b, 4::smallint, 'Great candid shots, a few were a little dark.', 5::smallint, null, 6);

  b := pg_temp.booking('jordanlee', 'hana-kim-studio', 'Studio Headshots', -28, '11:00', array['requested','accepted','confirmed','in_progress','delivered','completed'], array[-35,-35,-34,-28,-24,-22], 'Koreatown studio');
  perform pg_temp.reviews(b, 5::smallint, 'Moody, editorial, exactly what my portfolio needed.', 5::smallint, null, 20);

  -- Brian as the client: one delivered, one confirmed, one waiting for an answer,
  -- one counter offer, one cancelled.
  b := pg_temp.booking('briankimdw', 'priya-frames', 'Graduation Session', -12, '17:00', array['requested','accepted','confirmed','in_progress','delivered'], array[-30,-29,-29,-12,-4], 'UCLA campus', 'Two outfits, some by Royce Hall.', array['Extra outfit / location']);
  perform pg_temp.chat(b, '[{"from":"client","text":"Hi Priya! Can we do a couple by Royce Hall?","day":-29},
                          {"from":"provider","text":"Absolutely, golden hour there is perfect. See you at 5!","day":-29,"min":20},
                          {"from":"provider","text":"Your gallery is up! Let me know if you want any tweaks.","day":-4}]');
  b := pg_temp.booking('briankimdw', 'maya-chen-photo', 'Full-Day Wedding', 250, '14:00', array['requested','accepted','confirmed'], array[-18,-18,-17], 'Malibu Rocky Oaks', 'Ceremony at 4pm, reception until 11.', array['Second shooter']);
  perform pg_temp.chat(b, '[{"from":"provider","text":"Hi Brian! Thanks for booking. Can you send me the venue address and a rough timeline?","day":-17},
                          {"from":"client","text":"Of course, ceremony is at 4pm at Malibu Rocky Oaks. I''ll send the full run sheet this week.","day":-17,"min":45},
                          {"from":"provider","text":"Perfect. I''ll scout the grounds the week before.","day":-16}]');
  b := pg_temp.booking('briankimdw', 'leo-spaces', 'Listing Shoot', 13, '16:00', array['requested'], array[-1], 'Echo Park', 'Two-bedroom with a view, would love twilight shots.', array['Twilight exterior']);
  b := pg_temp.booking('briankimdw', 'hana-kim-studio', 'Editorial Portrait', 21, '13:00', array['requested','countered'], array[-2,-1], 'Koreatown studio', 'Looking for moody editorial portraits for a personal site.');
  if b is not null and not exists (select 1 from public.booking_offers where booking_id = b) then
    insert into public.booking_offers (booking_id, proposed_total_cents, message, created_by, created_at)
    select b, 52000, 'Happy to do it! I''d add a second look and background, so $520 total.', p.profile_id, now() - interval '1 day'
    from public.providers p where p.slug::text = 'hana-kim-studio';
  end if;
  b := pg_temp.booking('briankimdw', 'diego-alvarez', 'Party / Event', -3, '18:00', array['requested','cancelled_by_client'], array[-20,-15], 'Long Beach');

  -- Requests waiting for photographers to answer (log in as them to see these).
  b := pg_temp.booking('jordanlee', 'maya-chen-photo', 'Portrait Session', 16, '16:00', array['requested'], array[0], 'UCLA campus', 'Two outfits, would love some shots by Royce Hall.');
  b := pg_temp.booking('sampatel', 'maya-chen-photo', 'Elopement', 34, '10:00', array['requested'], array[0], 'Culver City courthouse', 'Small courthouse ceremony, about 12 guests.');
  b := pg_temp.booking('taylorb', 'jonah-reyes', 'Street Portrait Walk', 25, '07:00', array['requested'], array[0], 'Arts District', 'First time booking a photographer!');
  b := pg_temp.booking('rosa.d', 'priya-frames', 'Headshots', 9, '10:00', array['requested','accepted','confirmed'], array[-6,-6,-5], 'Pasadena studio');
  b := pg_temp.booking('kai.film', 'diego-alvarez', 'Wedding Day', 60, '13:00', array['requested','accepted','confirmed'], array[-10,-9,-9], 'Rancho Palos Verdes', null, array['Second shooter']);
end $$;

-- Vendors: one completed, reviewed booking each (so every listing has a rating),
-- then a few upcoming ones. Rosa's niece's quinceañera (70 days ago) and Sam's
-- launch party (45 days ago) used several vendors on the same day.
do $$
declare b uuid;
begin
  perform pg_temp.done('kai.film', 'ana-torres-films', 'Event Recap', -52, '17:00', 'Echo Park', null, 5::smallint, 'The recap made my friends cry. Delivered in under two weeks.');
  perform pg_temp.done('sampatel', 'northbound-media', 'Same-Day Reels', -38, '19:00', 'Arts District', null, 5::smallint, 'Reels were posted before the party ended. Wild.');
  perform pg_temp.done('kai.film', 'glasshouse-dtla', 'Weekday Event Rental', -30, '16:00', 'The Glasshouse DTLA', 80, 5::smallint, 'Gorgeous space, and Elena handled every vendor load-in.');
  perform pg_temp.done('rosa.d', 'rancho-las-flores', 'Barn Party', -70, '15:00', 'Rancho Las Flores', 120, 5::smallint, 'The barn with the bistro lights was magical for my niece''s quince.');
  perform pg_temp.done('rosa.d', 'golden-spoon-catering', 'Taco & Grill Buffet', -70, '17:00', 'Rancho Las Flores', 120, 5::smallint, 'Everyone went back for seconds. The al pastor!');
  -- Same evening, same caterer (capacity 3): the two bookings overlap.
  perform pg_temp.done('sampatel', 'golden-spoon-catering', 'Plated Dinner', -70, '18:00', 'Culver City', 60, 4::smallint, 'Great food, plates came out a little slowly.');
  perform pg_temp.done('jordanlee', 'seoul-food-truck', 'Food Truck Night', -21, '18:00', 'Westwood', 75, 5::smallint, 'Best grad party food ever. Line was long but fast.');
  perform pg_temp.done('taylorb', 'chef-julien', 'Seasonal Dinner Party', -14, '19:00', 'Los Feliz', 8, 5::smallint, 'Restaurant-level dinner at home, and he left the kitchen spotless.');
  perform pg_temp.done('kai.film', 'spice-table', 'Indian Feast Dinner', -26, '18:30', 'Little Tokyo', 10, 5::smallint, 'Priyanka explained every dish. The kulfi was unreal.');
  perform pg_temp.done('rosa.d', 'sugar-and-bloom', 'Celebration Cake', -70, '14:00', 'Rancho Las Flores', 1, 5::smallint, 'Pressed-flower cake matched the decor perfectly.');
  perform pg_temp.done('taylorb', 'crumb-club', 'Cupcakes', -33, '12:00', 'Los Angeles', 48, 4::smallint, 'Delicious, the frosting colors were a shade off.');
  perform pg_temp.done('sampatel', 'shaken-and-stirred', 'Open Bar Package', -45, '18:00', 'Arts District', 90, 5::smallint, 'The trailer bar was the photo spot of the night.');
  perform pg_temp.done('jordanlee', 'bean-there-coffee', 'Espresso Bar', -12, '09:00', 'UCLA', 60, 5::smallint, 'Horchata lattes for the whole study group. Legends.');
  perform pg_temp.done('rosa.d', 'dj-nova', 'DJ Set', -70, '18:00', 'Rancho Las Flores', null, 5::smallint, 'Kept abuela and the teens on the dance floor all night.');
  perform pg_temp.done('briankimdw', 'velvet-strings', 'Cocktail Hour Soloist', -24, '17:00', 'Pasadena', null, 5::smallint, 'Beautiful violin covers, guests kept asking who it was.');
  perform pg_temp.done('kai.film', 'snap-happy-booth', 'Open-air Photo Booth', -9, '19:00', 'Little Tokyo', null, 4::smallint, 'Fun props and quick prints. Setup ran 15 minutes late.');
  perform pg_temp.done('taylorb', 'marvelous-max', 'Kids Magic Show', -17, '14:00', 'Sherman Oaks', null, 5::smallint, 'Twenty 6-year-olds sat still for 45 minutes. Actual magic.');
  perform pg_temp.done('rosa.d', 'wildflower-and-co', 'Centerpieces', -70, '12:00', 'Rancho Las Flores', 15, 5::smallint, 'Loose, garden-y and exactly the colors we asked for.');
  perform pg_temp.done('sampatel', 'stem-studio', 'Bud Vase Trio', -45, '15:00', 'Arts District', 12, 4::smallint, 'Very chic. Wish they had a few more stems per vase.');
  perform pg_temp.done('jordanlee', 'pop-and-party', 'Balloon Garland', -19, '11:00', 'Westwood', null, 5::smallint, 'The garland was huge and survived the wind.');
  perform pg_temp.done('sampatel', 'lumen-event-design', 'Uplighting (20 fixtures)', -45, '14:00', 'Arts District', null, 5::smallint, 'The room looked twice as expensive with Theo''s lighting.');
  perform pg_temp.done('rosa.d', 'studio-rizos', 'Quince Glam', -70, '10:00', 'East Los Angeles', null, 5::smallint, 'Her curls held through the whole vals.');
  perform pg_temp.done('taylorb', 'glow-by-mina', 'Bridal Party Glam', -40, '08:00', 'Beverly Hills', 4, 5::smallint, 'Natural, glowy, and it lasted all day.');
  perform pg_temp.done('rosa.d', 'socal-party-rentals', 'Chiavari Chairs', -70, '09:00', 'Rancho Las Flores', 120, 4::smallint, 'Chairs arrived on time, two were scuffed.');
  perform pg_temp.done('sampatel', 'amplify-av', 'PA Speaker Package', -45, '13:00', 'Arts District', 1, 5::smallint, 'Speeches were crystal clear. Ravi stayed till the end.');
  perform pg_temp.done('kai.film', 'everly-events', 'Proposal Planning', -60, '17:00', 'Griffith Observatory', null, 5::smallint, 'She said yes, and Olivia hid the photographer perfectly.');
  perform pg_temp.done('sampatel', 'agenda-collective', 'Offsite Coordination', -80, '09:00', 'Ojai', null, 4::smallint, 'Smooth offsite, the agenda ran a bit long.');
  perform pg_temp.done('kai.film', 'ceremonies-by-sam', 'Elopement Ceremony', -11, '16:00', 'Echo Park Lake', null, 5::smallint, 'Short, sweet and so personal.');
  perform pg_temp.done('jordanlee', 'lena-hart-celebrant', 'Elopement Ceremony', -95, '18:00', 'Topanga State Park', null, 5::smallint, 'Bilingual ceremony so both families understood every word.');
  perform pg_temp.done('sampatel', 'starline-limo', 'Party Bus (30 guests)', -45, '20:00', 'Arts District', null, 4::smallint, 'Great bus and driver, pickup was 10 minutes late.');
  perform pg_temp.done('rosa.d', 'coast-classic-cars', '1957 Rolls-Royce Getaway', -45, '19:00', 'Malibu Rocky Oaks', null, 5::smallint, 'The Rolls made our elopement photos.');
  perform pg_temp.done('sampatel', 'service-pros-la', 'Serving Team (4 servers)', -45, '17:00', 'Arts District', null, 5::smallint, 'Polished team, nobody had an empty glass.');
  perform pg_temp.done('rosa.d', 'parkright-valet', 'Valet Team (3 attendants)', -70, '16:00', 'Rancho Las Flores', null, 5::smallint, 'Parked 60 cars without a single complaint.');
  perform pg_temp.done('taylorb', 'kneaded-bliss', 'In-home Massage (60 min)', -7, '10:00', 'Los Angeles', null, 5::smallint, 'Best massage I''ve had, and she brought everything.');
  perform pg_temp.done('kai.film', 'sunrise-flow-yoga', 'Private Group Yoga', -15, '07:00', 'Manhattan Beach', null, 5::smallint, 'Sunrise flow on the sand with friends. Perfect birthday morning.');

  -- Brian's wedding day (same day as his booking with Maya): caterer waiting, DJ confirmed.
  b := pg_temp.booking('briankimdw', 'golden-spoon-catering', 'Plated Dinner', 250, '17:00', array['requested'], array[-1], 'Malibu Rocky Oaks', '120 guests, 8 vegetarian, 2 gluten-free.', '{}', 120);
  b := pg_temp.booking('briankimdw', 'dj-nova', 'Wedding DJ + MC', 250, '17:00', array['requested','accepted','confirmed'], array[-10,-9,-9], 'Malibu Rocky Oaks', 'Cumbia during dinner please!');
  b := pg_temp.booking('briankimdw', 'wildflower-and-co', 'Centerpieces', 250, '12:00', array['requested'], array[0], 'Malibu Rocky Oaks', 'Blush and ivory, 15 tables.', '{}', 15);
  -- Another event that evening for the same caterer: fine, Golden Spoon can do 3 at once.
  b := pg_temp.booking('jordanlee', 'golden-spoon-catering', 'Taco & Grill Buffet', 250, '18:00', array['requested'], array[0], 'Westwood', 'Family reunion.', '{}', 50);

  -- Requests waiting for vendors to answer (log in as them to see these).
  b := pg_temp.booking('taylorb', 'chef-julien', 'Seasonal Dinner Party', 20, '19:00', array['requested'], array[0], 'Silver Lake', 'Engagement dinner for 10.', '{}', 10);
  b := pg_temp.booking('sampatel', 'agenda-collective', 'Corporate Event Production', 45, '09:00', array['requested'], array[0], 'Culver City', 'Holiday party for 150 people.');
  b := pg_temp.booking('kai.film', 'snap-happy-booth', 'Open-air Photo Booth', 30, '19:00', array['requested'], array[0], 'Little Tokyo', 'Birthday party, about 40 guests.');
  b := pg_temp.booking('rosa.d', 'rancho-las-flores', 'Garden Estate Day', 200, '11:00', array['requested'], array[0], 'Rancho Las Flores', 'Our wedding! About 180 guests.', '{}', 180);
end $$;

-- An open question to a photographer, outside any booking.
do $$
declare v_conv uuid; v_brian uuid := pg_temp.uid('briankimdw'); v_jonah uuid := pg_temp.uid('jonahshoots');
begin
  if v_brian is null or v_jonah is null then return; end if;
  if exists (select 1 from public.conversations c join public.conversation_members m on m.conversation_id = c.id
             where c.kind = 'inquiry' and c.provider_id = pg_temp.pid('jonah-reyes') and m.profile_id = v_brian) then return; end if;
  insert into public.conversations (kind, provider_id) values ('inquiry', pg_temp.pid('jonah-reyes')) returning id into v_conv;
  insert into public.conversation_members (conversation_id, profile_id) values (v_conv, v_brian), (v_conv, v_jonah);
  insert into public.messages (conversation_id, sender_id, body, created_at) values
    (v_conv, v_brian, 'Hey Jonah, do you shoot product launches? About 80 guests, evening event.', now() - interval '3 days'),
    (v_conv, v_jonah, 'Yep! Event Coverage is a good fit. What date are you thinking?', now() - interval '3 days' + interval '25 minutes');
  update public.conversations set last_message_at = now() - interval '3 days' + interval '25 minutes' where id = v_conv;
end $$;

-- ---------------------------------------------------------------------------
-- Follows and Brian's shortlist
-- ---------------------------------------------------------------------------
insert into public.follows (follower_id, provider_id)
select pg_temp.uid(f.u), pg_temp.pid(f.p)
from (values ('briankimdw', 'maya-chen-photo'), ('briankimdw', 'jonah-reyes'), ('briankimdw', 'sofia-wild'),
             ('jordanlee', 'maya-chen-photo'), ('rosa.d', 'maya-chen-photo'), ('kai.film', 'maya-chen-photo'),
             ('kai.film', 'sofia-wild'), ('sampatel', 'jonah-reyes'), ('taylorb', 'priya-frames'),
             ('jordanlee', 'hana-kim-studio'), ('rosa.d', 'diego-alvarez'),
             ('briankimdw', 'golden-spoon-catering'), ('briankimdw', 'dj-nova'), ('rosa.d', 'rancho-las-flores'),
             ('rosa.d', 'wildflower-and-co'), ('sampatel', 'agenda-collective'), ('kai.film', 'everly-events')) as f (u, p)
where pg_temp.uid(f.u) is not null and pg_temp.pid(f.p) is not null
on conflict do nothing;

insert into public.saved_providers (user_id, provider_id)
select pg_temp.uid('briankimdw'), pg_temp.pid(s)
from unnest(array['maya-chen-photo', 'hana-kim-studio', 'diego-alvarez', 'glasshouse-dtla', 'golden-spoon-catering',
                   'wildflower-and-co', 'sugar-and-bloom']) s
where pg_temp.uid('briankimdw') is not null and pg_temp.pid(s) is not null
on conflict do nothing;

-- Summary
select (select count(*) from public.packages) as packages, (select count(*) from public.package_addons) as addons,
       (select count(*) from public.bookings) as bookings, (select count(*) from public.reviews) as reviews,
       (select count(*) from public.messages) as messages, (select count(*) from public.follows) as follows;
