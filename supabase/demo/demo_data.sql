-- Demo data for the dev project: packages, add-ons, gear, working hours,
-- bookings in every state, double-blind reviews, chats, follows and a shortlist,
-- built on the test users from docs/test-users.json (create those first with
-- frontend/scripts/seed-test-users.mjs).
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
create or replace function pg_temp.booking(
  p_client text, p_slug text, p_package text, p_day_offset integer, p_start time,
  p_path text[], p_step_days integer[], p_location text, p_notes text default null,
  p_addons text[] default '{}'
) returns uuid language plpgsql as $$
declare
  v_client uuid := pg_temp.uid(p_client);
  v_provider public.providers;
  v_pkg public.packages;
  v_day date := current_date + p_day_offset;
  v_start timestamptz;
  v_minutes integer;
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

  v_minutes := coalesce(v_pkg.duration_minutes, 120);
  v_subtotal := case v_pkg.price_type when 'fixed' then v_pkg.price_cents
                  when 'hourly' then round(v_pkg.price_cents * v_minutes / 60.0)::integer end;
  select coalesce(sum(price_cents), 0)::integer into v_addons
  from public.package_addons where provider_id = v_provider.id and name = any (p_addons);
  v_total := case when v_subtotal is null then null else v_subtotal + v_addons end;
  select rules into v_policy from public.cancellation_policies where id = v_provider.cancellation_policy_id;

  insert into public.bookings (
    client_id, provider_id, package_id, category_id, status, time_range, timezone, location_text, notes,
    subtotal_cents, addons_cents, total_cents, deposit_cents, package_snapshot, policy_snapshot, expires_at, created_at
  ) values (
    v_client, v_provider.id, v_pkg.id, v_pkg.category_id, p_path[1]::public.booking_status,
    tstzrange(v_start, v_start + make_interval(mins => v_minutes)), v_provider.timezone, p_location, p_notes,
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
             ('jordanlee', 'hana-kim-studio'), ('rosa.d', 'diego-alvarez')) as f (u, p)
where pg_temp.uid(f.u) is not null and pg_temp.pid(f.p) is not null
on conflict do nothing;

insert into public.saved_providers (user_id, provider_id)
select pg_temp.uid('briankimdw'), pg_temp.pid(s)
from unnest(array['maya-chen-photo', 'hana-kim-studio', 'diego-alvarez']) s
where pg_temp.uid('briankimdw') is not null and pg_temp.pid(s) is not null
on conflict do nothing;

-- Summary
select (select count(*) from public.packages) as packages, (select count(*) from public.package_addons) as addons,
       (select count(*) from public.bookings) as bookings, (select count(*) from public.reviews) as reviews,
       (select count(*) from public.messages) as messages, (select count(*) from public.follows) as follows;
