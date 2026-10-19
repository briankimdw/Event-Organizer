-- PHOTOGRAPHY ONLY SETUP: paste this whole file into the Supabase SQL Editor and run it.
--
--   !!! DESTRUCTIVE. It deletes the listings, posts, bookings, reviews and chats of every
--   !!! vertical except photography, every event, and the post credits. Back up first:
--   !!!     cd frontend && node scripts/backup-nonphoto.mjs
--   !!! then put the backup folder name it prints in the first statement below
--   !!! (instead of 'no'). Until you do, the file stops with an error and changes nothing.
--
-- Full runbook (backup -> this file -> delete the test accounts -> verify):
-- docs/PHOTOGRAPHY_ONLY_RUNBOOK.md
--
-- The following files concatenated in this order (if you change one, update this file too):
--   0. the backup confirmation (photography_only.backup_done)
--   1. supabase/migrations/20261018000000_photography_only.sql  (merge videography into
--      "Photo & video", drop the archived features, delete the other verticals' data)
--   2. supabase/seed.sql  (the Photo & video vertical, its 14 services and schemas)
--   3. records 1 in supabase_migrations.schema_migrations, so a later `supabase db push`
--      doesn't apply it a second time.
--
-- The editor runs the file as one transaction: if anything fails, nothing is changed.
-- Safe to run more than once (the second run finds nothing left to delete).

-- ============================================================================
-- 0. Backup confirmation: replace 'no' with the backup folder name, e.g. '2026-10-18T19-30-00Z'
-- ============================================================================
select set_config('photography_only.backup_done', 'no', false);

-- ============================================================================
-- 1. supabase/migrations/20261018000000_photography_only.sql
-- ============================================================================
-- ============================================================================
-- PHOTOGRAPHY ONLY (2026-10-18)                    !!! DESTRUCTIVE: BACK UP FIRST !!!
-- ============================================================================
-- The product goes back to photography: one vertical, "Photo & video" (slug
-- `photography`), for creators who sell photo and/or video work. The rest of the
-- event platform (other verticals, events with friends, the hiring board, post
-- credits, occasions, vendor-card Discover) is archived in archive/event-platform/
-- (git tag `multi-vendor-snapshot` = commit c7028db has it all in place).
--
-- BEFORE RUNNING THIS ON A DATABASE WITH DATA:
--   1. cd frontend && node scripts/backup-nonphoto.mjs
--      (exports every row this deletes, plus the storage files, to
--      archive/event-platform/data-backup/<timestamp>/)
--   2. Paste supabase/demo/photography_only_setup.sql (it contains this file) and
--      put the backup folder name in its first statement. Without that, this
--      migration REFUSES to delete anything (see "0. Guard") and nothing changes.
-- Runbook: docs/PHOTOGRAPHY_ONLY_RUNBOOK.md.
--
-- What it does, in order (every step is re-runnable; run it twice, nothing changes
-- the second time):
--   0. Guard: stops when there is non-photo data and no backup was confirmed.
--   1. Merges videography into photography:
--      - photography's JSON Schemas also accept the video fields (film_minutes,
--        highlight_minutes, raw_footage; styles, gear.cameras, gear.drones,
--        drone_licensed) and its name becomes "Photo & video";
--      - the video services (wedding-film, event-recap, social-reels, music-video,
--        drone) move under photography;
--      - videography listings move to photography. If the same person already has
--        a photography listing (unique (profile_id, vertical_id)), the video listing
--        is folded into it (packages, posts, bookings, reviews, chats, follows...)
--        and then removed;
--      - the videography vertical is deleted.
--   2. Drops what only the archived features use: album_credits, event_candidates,
--      event_candidate_votes, the events-with-friends functions and triggers
--      (event chats, invites, hiring board, event_bookings...), and
--      discover_vendors() with its helpers.
--   3. Deletes the data of every other vertical: their listings and everything
--      hanging off them (packages, add-ons, hours, blocked days, services, posts,
--      photos, embeddings, bookings with their offers / history / reviews / chats,
--      inquiries, swipes, follows, shortlist entries, "Not into this" entries, and
--      chat messages that share their posts or listings). Also every event (events
--      with friends is archived): its members and event chat, and event share cards.
--      Bookings that were linked to an event are kept, unlinked.
--   4. Deletes the other verticals and their services, and the occasion tags.
--   5. Recalculates ratings and the inbox order that the deletions changed.
--
-- KEPT on purpose (the core schema stays multi-vertical so verticals can come back
-- as data, without a schema change): service_categories with its JSON Schemas,
-- providers.vertical_id / max_concurrent, every price type (per_person, per_item,
-- daily...), packages.min/max_quantity, bookings.quantity / slot, the capacity rule,
-- share cards (post / vendor / event), the Discover feed functions, and
-- **events + event_members** (phase-2 core tables, now empty), bookings.event_id,
-- conversation kind 'event' and messages.shared_event_id. Dropping those would mean
-- rewriting request_booking(), the share-card trigger and the messaging policies for
-- no gain; they cost nothing while empty.
--
-- NOT done here (SQL can't, or it belongs to the accounts): Storage files and the
-- non-photo test accounts themselves. frontend/scripts/delete-nonphoto-users.mjs does
-- both, after this has run.

-- ---------------------------------------------------------------------------
-- 0. Guard
-- ---------------------------------------------------------------------------
do $$
declare
  v_confirmed text := coalesce(current_setting('photography_only.backup_done', true), '');
  v_providers integer;
  v_events integer;
  v_extra integer := 0;
begin
  select count(*) into v_providers
  from public.providers p
  join public.service_categories v on v.id = p.vertical_id
  where v.slug not in ('photography', 'videography');
  select count(*) into v_events from public.events;
  if to_regclass('public.album_credits') is not null then
    execute 'select count(*) from public.album_credits' into v_extra;
  end if;

  if (v_providers > 0 or v_events > 0 or v_extra > 0) and lower(v_confirmed) in ('', 'no', 'not yet') then
    raise exception using
      message = format('photography_only: refusing to delete %s non-photo listing(s), %s event(s) and %s post credit(s) without a backup.',
                       v_providers, v_events, v_extra),
      hint = 'Run `cd frontend && node scripts/backup-nonphoto.mjs` first, then set photography_only.backup_done to the backup folder name '
             || 'in the first statement of supabase/demo/photography_only_setup.sql. Nothing was changed.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Merge videography into photography
-- ---------------------------------------------------------------------------

-- 1a. Photography's schemas accept the video fields too ("Photo & video").
--     Same JSON as supabase/seed.sql (keep them in sync).
update public.service_categories
set name = 'Photo & video',
    provider_schema = '{
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "gear": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "bodies": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 20 },
            "lenses": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 40 },
            "cameras": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 20 },
            "drones": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 10 }
          }
        },
        "specialties": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 10 },
        "styles": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 10 },
        "watermark_default": { "type": "boolean" },
        "drone_licensed": { "type": "boolean" }
      }
    }'::jsonb,
    package_schema = '{
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "edited_photos": { "type": "integer", "minimum": 0, "maximum": 10000 },
        "editing_level": { "type": "string", "maxLength": 80 },
        "film_minutes": { "type": "integer", "minimum": 0, "maximum": 600 },
        "highlight_minutes": { "type": "integer", "minimum": 0, "maximum": 60 },
        "raw_footage": { "type": "boolean" },
        "turnaround_days": { "type": "integer", "minimum": 0, "maximum": 365 },
        "deliverables": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 20 },
        "second_shooter_included": { "type": "boolean" }
      }
    }'::jsonb
where slug = 'photography' and kind = 'vertical';

do $$
declare
  v_photo uuid := (select id from public.service_categories where slug = 'photography' and kind = 'vertical');
  v_video uuid := (select id from public.service_categories where slug = 'videography' and kind = 'vertical');
  v_next integer;
  r record;
  q uuid;
begin
  if v_photo is null or v_video is null then
    return;  -- nothing to merge (fresh database, or already done)
  end if;

  -- 1b. The video services move under photography, after the photo services.
  select coalesce(max(sort_order), 0) into v_next from public.service_categories where parent_id = v_photo;
  update public.service_categories s
  set parent_id = v_photo, sort_order = v_next + s.sort_order
  where s.parent_id = v_video;

  -- Anything filed under the videography vertical itself now points at photography.
  update public.packages set category_id = v_photo where category_id = v_video;
  update public.albums set category_id = v_photo where category_id = v_video;
  update public.bookings set category_id = v_photo where category_id = v_video;
  insert into public.provider_services (provider_id, category_id)
  select provider_id, v_photo from public.provider_services where category_id = v_video
  on conflict do nothing;
  delete from public.provider_services where category_id = v_video;

  -- 1c. Video listings become photo & video listings.
  for r in select p.id, p.profile_id from public.providers p where p.vertical_id = v_video loop
    select id into q from public.providers where profile_id = r.profile_id and vertical_id = v_photo;
    if q is null then
      update public.providers set vertical_id = v_photo where id = r.id;
      continue;
    end if;

    -- The person already has a photography listing (q): fold the video listing (r) into it.
    raise notice 'photography_only: folding video listing % into photography listing %', r.id, q;
    -- Profile fields: the photo listing's win, the video ones fill the gaps (styles, drones...).
    update public.providers p
    set attributes = (select v.attributes from public.providers v where v.id = r.id) || p.attributes
    where p.id = q;
    insert into public.provider_services (provider_id, category_id)
    select q, category_id from public.provider_services where provider_id = r.id
    on conflict do nothing;
    update public.cancellation_policies set provider_id = q where provider_id = r.id;
    update public.packages set provider_id = q where provider_id = r.id;
    update public.package_addons set provider_id = q where provider_id = r.id;
    -- Working hours: keep q's if it has any, else take r's.
    if not exists (select 1 from public.availability_rules where provider_id = q) then
      update public.availability_rules set provider_id = q where provider_id = r.id;
    end if;
    update public.blackouts set provider_id = q where provider_id = r.id;
    update public.albums set provider_id = q where provider_id = r.id;
    -- Fails (and so rolls everything back) only if both listings have overlapping active
    -- bookings: then merge those two listings by hand first.
    update public.bookings set provider_id = q where provider_id = r.id;
    update public.reviews set provider_id = q where provider_id = r.id;
    update public.conversations set provider_id = q where provider_id = r.id;
    update public.swipes set provider_id = q where provider_id = r.id;
    update public.messages set shared_provider_id = q where shared_provider_id = r.id;
    insert into public.follows (follower_id, provider_id, created_at)
    select follower_id, q, created_at from public.follows where provider_id = r.id
    on conflict do nothing;
    insert into public.saved_providers (user_id, provider_id, created_at)
    select user_id, q, created_at from public.saved_providers where provider_id = r.id
    on conflict do nothing;
    update public.taste_corrections t set value = q::text
    where t.kind = 'provider' and t.value = r.id::text
      and not exists (select 1 from public.taste_corrections t2 where t2.user_id = t.user_id and t2.kind = 'provider' and t2.value = q::text);
    delete from public.taste_corrections where kind = 'provider' and value = r.id::text;
    delete from public.providers where id = r.id;  -- what's left (private row, extra hours, old follows) cascades
    update public.providers p set
      rating_avg = (select round(avg(rating), 2) from public.reviews
                    where provider_id = q and direction = 'client_to_provider' and revealed_at is not null),
      rating_count = (select count(*) from public.reviews
                      where provider_id = q and direction = 'client_to_provider' and revealed_at is not null)
    where p.id = q;
  end loop;

  -- 1d. The videography vertical is now empty.
  delete from public.service_categories where id = v_video;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Drop what only the archived features use
-- ---------------------------------------------------------------------------

-- Post credits (album_credits + its limit trigger; policies go with the table).
drop table if exists public.album_credits;
drop function if exists public.album_credits_limit();

-- Events with friends: event chats kept in sync with members, invites, the hiring
-- board and votes. The events / event_members tables themselves stay (core schema).
drop trigger if exists events_create_chat on public.events;
drop trigger if exists events_sync_chat_title on public.events;
drop trigger if exists event_members_sync_chat on public.event_members;
drop trigger if exists event_members_keep_owner on public.event_members;
drop index if exists public.conversations_one_chat_per_event;

-- Every overload of these functions, whatever its argument list on this database.
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in (
        -- events with friends
        'create_event_with_chat', 'invite_to_event', 'leave_event', 'remove_event_member',
        'ensure_event_chat', 'ensure_event_chat_for', 'add_event_candidate', 'set_event_candidate_status',
        'event_bookings', 'post_event_note', 'first_name_of', 'event_chat_id',
        'events_create_chat', 'events_sync_chat_title', 'event_members_sync_chat', 'event_members_keep_owner',
        -- Discover vendor cards for every vertical
        'discover_vendors', 'vendor_traits', 'discover_jaccard', 'discover_norm')
    order by p.proname = 'discover_norm'  -- discover_norm last: vendor_traits calls it
  loop
    execute format('drop function if exists %s', f);
  end loop;
end $$;

drop table if exists public.event_candidate_votes;
drop table if exists public.event_candidates;

-- ---------------------------------------------------------------------------
-- 3. Delete the data of the other verticals (and every event)
-- ---------------------------------------------------------------------------
do $$
declare
  v_photo uuid := (select id from public.service_categories where slug = 'photography' and kind = 'vertical');
  v_listings uuid[];
  v_albums uuid[];
  v_n integer;
begin
  -- Listings outside photography (all of them if photography doesn't exist yet,
  -- which only happens on an empty database).
  select coalesce(array_agg(p.id), '{}') into v_listings
  from public.providers p
  where v_photo is null or p.vertical_id <> v_photo;
  select coalesce(array_agg(a.id), '{}') into v_albums
  from public.albums a
  where a.provider_id = any (v_listings);

  -- Events (events with friends is archived). Bookings made from an event are kept
  -- and unlinked (bookings.event_id is "on delete set null").
  delete from public.messages
  where shared_event_id is not null or share_preview ->> 'kind' = 'event';
  delete from public.conversations where kind = 'event';
  delete from public.events;

  -- Chat cards that share their posts or listings (the rest of those chats stays).
  delete from public.messages m
  where m.shared_album_id = any (v_albums)
     or m.shared_provider_id = any (v_listings)
     or (m.share_preview ->> 'kind' = 'provider' and m.share_preview ->> 'id' = any (v_listings::text[]))
     or (m.share_preview ->> 'kind' = 'post' and m.share_preview ->> 'provider_id' = any (v_listings::text[]));

  -- Bookings (restrict on providers): offers, add-ons, history, reviews and the
  -- booking chat go with them.
  delete from public.bookings where provider_id = any (v_listings);
  get diagnostics v_n = row_count;
  if v_n > 0 then
    raise notice 'photography_only: deleted % non-photo booking(s)', v_n;
  end if;

  -- Inquiries, swipes, "Not into this", follows, shortlist.
  delete from public.conversations where provider_id = any (v_listings);
  delete from public.swipes where provider_id = any (v_listings) or album_id = any (v_albums);
  delete from public.taste_corrections where kind = 'provider' and value = any (v_listings::text[]);
  delete from public.follows where provider_id = any (v_listings);
  delete from public.saved_providers where provider_id = any (v_listings);

  -- Posts: photos, embeddings, tags and collection entries cascade. (The files stay
  -- in Storage; delete-nonphoto-users.mjs removes them.)
  delete from public.albums where id = any (v_albums);

  -- The listings: packages, add-ons, hours, blocked days, services, private row and
  -- their own cancellation policies cascade.
  delete from public.providers where id = any (v_listings);
  get diagnostics v_n = row_count;
  if v_n > 0 then
    raise notice 'photography_only: deleted % non-photo listing(s)', v_n;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Delete the other verticals, their services and the occasion tags
-- ---------------------------------------------------------------------------
do $$
declare
  v_photo uuid := (select id from public.service_categories where slug = 'photography' and kind = 'vertical');
  v_gone uuid[];
begin
  if v_photo is null then
    return;  -- empty database: the seed adds photography later
  end if;
  select coalesce(array_agg(id), '{}') into v_gone
  from public.service_categories
  where id <> v_photo and parent_id is distinct from v_photo;

  -- A photography package filed under another vertical's service keeps working
  -- under photography itself (packages.category_id has no "on delete" rule).
  update public.packages set category_id = v_photo where category_id = any (v_gone);
  -- albums / bookings: "on delete set null"; provider_services: cascade.
  delete from public.service_categories where id = any (v_gone) and kind = 'service';
  delete from public.service_categories where id = any (v_gone);
end $$;

-- Occasion tags ('occasion-wedding'...) came with post credits; album_tags cascade.
delete from public.tags where slug like 'occasion-%';

-- ---------------------------------------------------------------------------
-- 5. Recalculate what the deletions changed
-- ---------------------------------------------------------------------------

-- Client ratings (vendors' reviews of clients went with the bookings).
update public.profiles pr
set client_rating_avg = s.avg, client_rating_count = s.cnt
from (
  select p.id,
         round(avg(r.rating), 2) as avg,
         count(r.id)::integer as cnt
  from public.profiles p
  left join public.reviews r
    on r.subject_profile_id = p.id and r.direction = 'provider_to_client' and r.revealed_at is not null
  group by p.id
) s
where s.id = pr.id
  and (pr.client_rating_avg is distinct from s.avg or pr.client_rating_count is distinct from s.cnt);

-- Listing ratings (unchanged unless a video listing was folded into another).
update public.providers pv
set rating_avg = s.avg, rating_count = s.cnt
from (
  select p.id,
         round(avg(r.rating), 2) as avg,
         count(r.id)::integer as cnt
  from public.providers p
  left join public.reviews r
    on r.provider_id = p.id and r.direction = 'client_to_provider' and r.revealed_at is not null
  group by p.id
) s
where s.id = pv.id
  and (pv.rating_avg is distinct from s.avg or pv.rating_count is distinct from s.cnt);

-- Inbox order: chats that lost their newest message (a deleted share card).
update public.conversations c
set last_message_at = (select max(m.created_at) from public.messages m where m.conversation_id = c.id)
where c.last_message_at is distinct from (select max(m.created_at) from public.messages m where m.conversation_id = c.id)
  and c.last_message_at > coalesce((select max(m.created_at) from public.messages m where m.conversation_id = c.id), '-infinity');

-- ============================================================================
-- 2. supabase/seed.sql
-- ============================================================================
-- Reference data every environment needs. Safe to run more than once: re-running
-- fixes names, order and schemas. (Runs automatically after migrations on
-- `supabase db reset` locally; on the hosted project paste it into the SQL editor.)
--
-- Photography only (2026-10-18): one vertical, "Photo & video" (slug `photography`),
-- for creators who sell photo and/or video work. The other verticals (catering,
-- venues, DJs...) are archived with their schemas in
-- archive/event-platform/supabase/seed_all_verticals.sql. The schema itself stays
-- multi-vertical (service_categories + JSON Schemas), so a vertical can come back as
-- rows here. Slugs, names and order match the app's catalog
-- (frontend/src/verticals/); change them there too.
--
-- This only adds or updates rows. Removing the old verticals from a database that
-- has them is migration 20261018000000_photography_only.sql.

-- ---------------------------------------------------------------------------
-- The Photo & video vertical + the custom fields its providers and packages carry.
-- Photo fields: gear.bodies / lenses, edited_photos, editing_level.
-- Video fields: gear.cameras / drones, styles, drone_licensed, film_minutes,
-- highlight_minutes, raw_footage. Shared: specialties, turnaround_days,
-- deliverables, second_shooter_included. (Same JSON as the photography_only
-- migration; keep them in sync.)
-- ---------------------------------------------------------------------------
insert into public.service_categories (slug, name, kind, sort_order, provider_schema, package_schema)
values (
  'photography', 'Photo & video', 'vertical', 1,
  '{
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "gear": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "bodies": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 20 },
          "lenses": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 40 },
          "cameras": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 20 },
          "drones": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 10 }
        }
      },
      "specialties": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 10 },
      "styles": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 10 },
      "watermark_default": { "type": "boolean" },
      "drone_licensed": { "type": "boolean" }
    }
  }'::jsonb,
  '{
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "edited_photos": { "type": "integer", "minimum": 0, "maximum": 10000 },
      "editing_level": { "type": "string", "maxLength": 80 },
      "film_minutes": { "type": "integer", "minimum": 0, "maximum": 600 },
      "highlight_minutes": { "type": "integer", "minimum": 0, "maximum": 60 },
      "raw_footage": { "type": "boolean" },
      "turnaround_days": { "type": "integer", "minimum": 0, "maximum": 365 },
      "deliverables": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 20 },
      "second_shooter_included": { "type": "boolean" }
    }
  }'::jsonb
)
on conflict (slug) do update
  set name = excluded.name,
      kind = excluded.kind,
      parent_id = null,
      sort_order = excluded.sort_order,
      provider_schema = excluded.provider_schema,
      package_schema = excluded.package_schema;

-- ---------------------------------------------------------------------------
-- Services (they inherit the vertical's schemas): photo first, then video.
-- ---------------------------------------------------------------------------
insert into public.service_categories (slug, name, kind, parent_id, sort_order)
select s.slug, s.name, 'service', v.id, s.sort_order
from (values
  ('wedding', 'Wedding', 1),
  ('graduation', 'Graduation', 2),
  ('portrait', 'Portrait', 3),
  ('event', 'Event', 4),
  ('headshots', 'Headshots', 5),
  ('real-estate', 'Real estate', 6),
  ('product', 'Product', 7),
  ('coaching', 'Coaching', 8),
  ('meetups', 'Meetups', 9),
  ('wedding-film', 'Wedding film', 10),
  ('event-recap', 'Event recap', 11),
  ('social-reels', 'Social reels', 12),
  ('music-video', 'Music video', 13),
  ('drone', 'Drone', 14)
) as s (slug, name, sort_order)
join public.service_categories v on v.slug = 'photography' and v.kind = 'vertical'
on conflict (slug) do update
  set name = excluded.name,
      parent_id = excluded.parent_id,
      sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- Shared cancellation policy templates (refund % of what was paid, by days
-- before the event). Providers can also create their own.
-- ---------------------------------------------------------------------------
insert into public.cancellation_policies (provider_id, name, rules)
select null, p.name, p.rules::jsonb
from (values
  ('Flexible', '[{"min_days_before": 7, "refund_pct": 100}, {"min_days_before": 2, "refund_pct": 50}, {"min_days_before": 0, "refund_pct": 0}]'),
  ('Moderate', '[{"min_days_before": 30, "refund_pct": 100}, {"min_days_before": 14, "refund_pct": 50}, {"min_days_before": 0, "refund_pct": 0}]'),
  ('Strict',   '[{"min_days_before": 90, "refund_pct": 50}, {"min_days_before": 0, "refund_pct": 0}]')
) as p (name, rules)
where not exists (
  select 1 from public.cancellation_policies cp where cp.provider_id is null and cp.name = p.name
);

-- ============================================================================
-- 3. Record the migration
-- ============================================================================
do $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    insert into supabase_migrations.schema_migrations (version, name)
    values ('20261018000000', 'photography_only')
    on conflict (version) do nothing;
  end if;
end $$;

-- Check: one vertical ("Photo & video"), 14 services, only photography listings,
-- no events, and the archived tables gone. Every column should say true.
select
  (select count(*) from public.service_categories where kind = 'vertical') = 1 as one_vertical,
  (select name from public.service_categories where slug = 'photography') = 'Photo & video' as named_photo_and_video,
  (select count(*) from public.service_categories where kind = 'service') = 14 as fourteen_services,
  not exists (select 1 from public.providers p join public.service_categories v on v.id = p.vertical_id where v.slug <> 'photography') as only_photo_listings,
  not exists (select 1 from public.events) as no_events,
  to_regclass('public.album_credits') is null and to_regclass('public.event_candidates') is null as archived_tables_dropped,
  (select count(*) from public.providers) as listings_left;
