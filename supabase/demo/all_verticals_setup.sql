-- ALL VERTICALS SETUP: paste this whole file into the Supabase SQL Editor and run it.
--
-- The following files concatenated in this order (if you change one of them, update this file too):
--   1. supabase/migrations/20261009120000_direct_and_group_messages.sql  (pending; already re-runnable)
--   2. supabase/migrations/20261009120100_portfolio_owner_select.sql     (pending; made re-runnable
--      here with "drop policy if exists" in front of its create policy)
--   3. supabase/migrations/20261010000000_all_verticals.sql              (pricing units, quantities, capacity)
--   4. supabase/seed.sql                                                 (all 18 verticals + 87 services + schemas)
--   5. records 1-3 in supabase_migrations.schema_migrations, so a later `supabase db push`
--      doesn't apply them a second time.
--
-- Prerequisite: every migration before 20261009120000 is applied (they are on the
-- hosted project "Event Organizer"). The editor runs the file as one transaction:
-- if anything fails, nothing is changed. Safe to run more than once.
--
-- Next: `cd frontend && node scripts/seed-test-users.mjs`, then supabase/demo/demo_data.sql.

-- ============================================================================
-- 1. 20261009120000_direct_and_group_messages
-- ============================================================================
-- Messaging between any two people (direct messages) and group chats.
--
-- Before this, conversations only came from bookings (one thread per booking)
-- and inquiries (client -> photographer). Conversations and members can't be
-- inserted directly through the API (no insert policies), so everything goes
-- through the security-definer functions below, which also enforce blocks.

alter type public.conversation_kind add value if not exists 'direct';

-- Has either person blocked the other?
create or replace function public.is_blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b) or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;
revoke execute on function public.is_blocked_between(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Direct messages: open (or reopen) the one-to-one thread with someone.
-- ---------------------------------------------------------------------------
create or replace function public.start_direct_message(p_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_conversation uuid;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = 'insufficient_privilege';
  end if;
  if p_profile_id is null or p_profile_id = v_uid then
    raise exception 'You can''t message yourself';
  end if;
  if not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception 'Person not found';
  end if;
  if public.is_blocked_between(v_uid, p_profile_id) then
    raise exception 'You can''t message this person';
  end if;

  -- An existing direct thread with exactly these two people.
  select c.id into v_conversation
  from public.conversations c
  where c.kind = 'direct'
    and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.profile_id = v_uid)
    and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.profile_id = p_profile_id)
  limit 1;

  if v_conversation is null then
    insert into public.conversations (kind) values ('direct') returning id into v_conversation;
    insert into public.conversation_members (conversation_id, profile_id)
    values (v_conversation, v_uid), (v_conversation, p_profile_id);
  end if;
  return v_conversation;
end;
$$;

-- ---------------------------------------------------------------------------
-- Group chats
-- ---------------------------------------------------------------------------
create or replace function public.create_group_chat(p_title text, p_member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_members uuid[];
  v_conversation uuid;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = 'insufficient_privilege';
  end if;
  select coalesce(array_agg(distinct m), '{}') into v_members
  from unnest(coalesce(p_member_ids, '{}')) m
  where m is not null and m <> v_uid and exists (select 1 from public.profiles p where p.id = m);
  if cardinality(v_members) < 2 then
    raise exception 'Add at least two people to start a group';
  end if;
  if cardinality(v_members) > 30 then
    raise exception 'Groups can have up to 31 people';
  end if;
  if exists (select 1 from unnest(v_members) m where public.is_blocked_between(v_uid, m)) then
    raise exception 'You can''t add someone you''ve blocked (or who blocked you)';
  end if;

  insert into public.conversations (kind, title)
  values ('group', nullif(left(trim(coalesce(p_title, '')), 80), ''))
  returning id into v_conversation;
  insert into public.conversation_members (conversation_id, profile_id)
  select v_conversation, m from unnest(array_append(v_members, v_uid)) m;
  return v_conversation;
end;
$$;

-- Add people to a group you're in.
create or replace function public.add_group_members(p_conversation_id uuid, p_member_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_added integer;
begin
  if not exists (select 1 from public.conversations c where c.id = p_conversation_id and c.kind = 'group')
     or not public.is_conversation_member(p_conversation_id) then
    raise exception 'Group not found';
  end if;
  if exists (select 1 from unnest(coalesce(p_member_ids, '{}')) m where public.is_blocked_between(v_uid, m)) then
    raise exception 'You can''t add someone you''ve blocked (or who blocked you)';
  end if;
  if (select count(*) from public.conversation_members where conversation_id = p_conversation_id)
     + cardinality(coalesce(p_member_ids, '{}')) > 31 then
    raise exception 'Groups can have up to 31 people';
  end if;
  insert into public.conversation_members (conversation_id, profile_id)
  select p_conversation_id, m from unnest(p_member_ids) m
  where exists (select 1 from public.profiles p where p.id = m)
  on conflict do nothing;
  get diagnostics v_added = row_count;
  return v_added;
end;
$$;

-- Rename a group you're in.
create or replace function public.rename_group(p_conversation_id uuid, p_title text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.conversations c where c.id = p_conversation_id and c.kind = 'group')
     or not public.is_conversation_member(p_conversation_id) then
    raise exception 'Group not found';
  end if;
  update public.conversations set title = nullif(left(trim(coalesce(p_title, '')), 80), '') where id = p_conversation_id;
end;
$$;

-- Leave a group (booking threads, inquiries and direct messages can't be left).
create or replace function public.leave_group(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.conversations c where c.id = p_conversation_id and c.kind = 'group')
     or not public.is_conversation_member(p_conversation_id) then
    raise exception 'Group not found';
  end if;
  delete from public.conversation_members where conversation_id = p_conversation_id and profile_id = (select auth.uid());
end;
$$;

revoke execute on function public.start_direct_message(uuid) from public, anon;
revoke execute on function public.create_group_chat(text, uuid[]) from public, anon;
revoke execute on function public.add_group_members(uuid, uuid[]) from public, anon;
revoke execute on function public.rename_group(uuid, text) from public, anon;
revoke execute on function public.leave_group(uuid) from public, anon;
grant execute on function public.start_direct_message(uuid) to authenticated;
grant execute on function public.create_group_chat(text, uuid[]) to authenticated;
grant execute on function public.add_group_members(uuid, uuid[]) to authenticated;
grant execute on function public.rename_group(uuid, text) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Blocks apply to one-to-one threads: if either person blocked the other,
-- neither can send there. (Group chats stay usable; the app hides blocked
-- people's messages.)
-- ---------------------------------------------------------------------------
create or replace function public.messages_block_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.conversations c
    join public.conversation_members m on m.conversation_id = c.id and m.profile_id <> new.sender_id
    where c.id = new.conversation_id
      and c.kind in ('direct', 'inquiry', 'booking')
      and public.is_blocked_between(new.sender_id, m.profile_id)
  ) then
    raise exception 'You can''t message this person' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
revoke execute on function public.messages_block_check() from public, anon, authenticated;

drop trigger if exists messages_block_check on public.messages;
create trigger messages_block_check
  before insert on public.messages
  for each row execute function public.messages_block_check();

-- ---------------------------------------------------------------------------
-- Read receipts update live ("Seen"): stream read-marker changes too.
-- (Realtime applies RLS: members only see members of their own conversations.)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversation_members'
  ) then
    alter publication supabase_realtime add table public.conversation_members;
  end if;
end $$;

-- ============================================================================
-- 2. 20261009120100_portfolio_owner_select
-- ============================================================================
-- Let photographers "see" their own files in the public portfolio bucket.
-- Storage only deletes objects the user can select through the API, so without
-- this, deleting a post (or rolling back a failed upload) left the public
-- 2048px copies behind. Reading them was always possible via the public URL;
-- this only adds API access to your own folder.
drop policy if exists "Owners see their portfolio files" on storage.objects;
create policy "Owners see their portfolio files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'portfolio' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ============================================================================
-- 3. 20261010000000_all_verticals
-- ============================================================================
-- All verticals (catering, venues, DJs, florists...): pricing units, booking
-- quantities, package minimums and vendor capacity. The verticals themselves are
-- data (service_categories rows + JSON Schemas in supabase/seed.sql).
--
-- Re-runnable on purpose (if not exists / create or replace / drop ... if exists),
-- because it may be applied by hand from supabase/demo/all_verticals_setup.sql.

-- ---------------------------------------------------------------------------
-- 1. Pricing units. catalog.js priceUnit -> price_type:
--    session -> fixed · hour -> hourly · person -> per_person · item -> per_item · day -> daily
--
-- New enum values can't be *used* in the transaction that adds them. Below they
-- only appear inside plpgsql bodies (resolved when the function runs) or as text
-- (price_type::text = 'per_person'), never in SQL functions, defaults or checks.
-- ---------------------------------------------------------------------------
alter type public.price_type add value if not exists 'per_person';  -- price x guests
alter type public.price_type add value if not exists 'per_item';    -- price x pieces
alter type public.price_type add value if not exists 'daily';       -- price per day

-- How many guests / pieces a package can be booked for (e.g. catering: min 40 guests).
-- Required for per_person / per_item pricing, optional for the rest (a venue's max guests).
alter table public.packages
  add column if not exists min_quantity integer check (min_quantity between 1 and 100000),
  add column if not exists max_quantity integer check (max_quantity between 1 and 100000);
alter table public.packages drop constraint if exists packages_quantity_range;
alter table public.packages add constraint packages_quantity_range
  check (min_quantity is null or max_quantity is null or max_quantity >= min_quantity);

-- Guests or pieces on a booking (null when it doesn't matter, e.g. headshots).
alter table public.bookings
  add column if not exists quantity integer check (quantity between 1 and 100000);

-- ---------------------------------------------------------------------------
-- 2. Capacity: how many events a provider can work at the same time.
--    1 = one at a time (photographers, DJs); more for caterers, rental companies.
-- ---------------------------------------------------------------------------
alter table public.providers
  add column if not exists max_concurrent integer not null default 1 check (max_concurrent between 1 and 50);
grant update (max_concurrent) on public.providers to authenticated;

-- Double-booking protection with capacity, done with "slots":
--   - every active booking holds a slot number between 1 and the provider's max_concurrent;
--   - the exclusion constraint forbids two overlapping active bookings of the same
--     provider in the same slot;
--   - a trigger picks the lowest slot that is free for the booking's whole time range.
-- So at any moment a provider has at most max_concurrent active bookings, and with
-- max_concurrent = 1 every booking is in slot 1: exactly the old "no overlap" rule.
-- The guarantee comes from the constraint, so it holds under any isolation level and
-- for concurrent requests (the per-provider advisory lock in the trigger just makes the
-- second request pick another slot instead of failing when there is room).
alter table public.bookings
  add column if not exists slot smallint not null default 1 check (slot between 1 and 50);

alter table public.bookings drop constraint if exists bookings_no_double_booking;
alter table public.bookings add constraint bookings_no_double_booking
  exclude using gist (provider_id with =, slot with =, time_range with &&)
  where (status in ('requested', 'countered', 'accepted', 'confirmed', 'in_progress'));

create or replace function public.bookings_assign_slot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capacity integer;
  v_slot integer;
begin
  if new.status not in ('requested', 'countered', 'accepted', 'confirmed', 'in_progress') then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and old.status in ('requested', 'countered', 'accepted', 'confirmed', 'in_progress')
     and old.provider_id = new.provider_id and old.time_range = new.time_range then
    return new;  -- still active at the same time (e.g. requested -> accepted): keep the slot
  end if;

  -- Serialize slot picking per provider; afterwards (READ COMMITTED) we see the others' bookings.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('booking-slot:' || new.provider_id::text, 0));

  select coalesce(max(p.max_concurrent), 1) into v_capacity from public.providers p where p.id = new.provider_id;

  -- Lowest slot not used by an overlapping active booking. Bookings sitting in a slot
  -- above a since-lowered capacity block their time completely.
  select s into v_slot
  from generate_series(1, v_capacity) s
  where not exists (
    select 1 from public.bookings b
    where b.provider_id = new.provider_id
      and b.id <> new.id
      and b.status in ('requested', 'countered', 'accepted', 'confirmed', 'in_progress')
      and b.time_range && new.time_range
      and (b.slot = s or b.slot > v_capacity)
  )
  order by s
  limit 1;

  if v_slot is null then
    raise exception 'This provider is fully booked at that time' using errcode = 'exclusion_violation';
  end if;
  new.slot := v_slot;
  return new;
end;
$$;

revoke execute on function public.bookings_assign_slot() from public, anon, authenticated;

drop trigger if exists bookings_assign_slot on public.bookings;
create trigger bookings_assign_slot
  before insert or update of status, provider_id, time_range on public.bookings
  for each row execute function public.bookings_assign_slot();

-- Free on a day = works that weekday, nothing blocked off, and fewer active bookings
-- that day than the provider's capacity (so for max_concurrent = 1: no booking at all).
-- search_providers() calls this, so date search follows automatically.
create or replace function public.is_provider_free(p_provider_id uuid, p_day date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with p as (
    select id, timezone, max_concurrent,
           tstzrange((p_day::timestamp) at time zone timezone, ((p_day + 1)::timestamp) at time zone timezone) as day_range
    from public.providers where id = p_provider_id
  )
  select
    exists (select 1 from p)
    and (
      not exists (select 1 from public.availability_rules r where r.provider_id = p_provider_id)
      or exists (select 1 from public.availability_rules r
                 where r.provider_id = p_provider_id and r.weekday = extract(dow from p_day)::int)
    )
    and not exists (select 1 from public.blackouts b, p where b.provider_id = p_provider_id and b.during && p.day_range)
    and (
      select count(*) from public.bookings bk, p
      where bk.provider_id = p_provider_id
        and bk.status in ('requested', 'countered', 'accepted', 'confirmed', 'in_progress')
        and bk.time_range && p.day_range
    ) < coalesce((select max_concurrent from p), 1);
$$;

-- ---------------------------------------------------------------------------
-- 3. request_booking: + p_quantity (guests or pieces) and the new price types.
--    subtotal = fixed: price · hourly: price x hours · per_person / per_item: price x quantity
--               daily: price (one booking is one day; several days = several dates)
--               quote: null (the provider counters with a price)
--    Dropped and re-created because the argument list changes (keeping the old one
--    would make PostgREST calls ambiguous). Existing calls without p_quantity still work.
-- ---------------------------------------------------------------------------
drop function if exists public.request_booking(uuid, date[], time, numeric, uuid[], text, text, uuid);

create or replace function public.request_booking(
  p_package_id uuid,
  p_dates date[],
  p_start_time time,
  p_hours numeric default null,          -- hourly packages only
  p_addon_ids uuid[] default '{}',
  p_location_text text default null,
  p_notes text default null,
  p_event_id uuid default null,
  p_quantity integer default null        -- guests (per_person) or pieces (per_item); else informational
)
returns setof public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_pkg public.packages;
  v_provider public.providers;
  v_type text;
  v_quantity integer := p_quantity;
  v_minutes integer;
  v_subtotal integer;
  v_addons integer;
  v_total integer;
  v_policy jsonb;
  v_day date;
  v_start timestamptz;
  v_booking public.bookings;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = 'insufficient_privilege';
  end if;
  if p_dates is null or cardinality(p_dates) = 0 then
    raise exception 'Pick at least one date';
  end if;
  if cardinality(p_dates) > 14 then
    raise exception 'Request at most 14 dates at once';
  end if;

  select * into v_pkg from public.packages where id = p_package_id and is_active;
  if not found then
    raise exception 'Package not found';
  end if;
  select * into v_provider from public.providers where id = v_pkg.provider_id and status = 'active';
  if not found then
    raise exception 'This provider is not taking bookings';
  end if;
  if v_provider.profile_id = v_uid then
    raise exception 'You can''t book yourself';
  end if;
  if p_event_id is not null and not public.is_event_member(p_event_id) then
    raise exception 'Event not found';
  end if;

  -- Quantity: required for per-person / per-item prices (defaults to the package minimum).
  v_type := v_pkg.price_type::text;
  if v_quantity is not null and v_quantity < 1 then
    raise exception 'Quantity must be at least 1';
  end if;
  if v_type in ('per_person', 'per_item') then
    v_quantity := coalesce(v_quantity, v_pkg.min_quantity);
    if v_quantity is null then
      raise exception 'How many %?', case when v_type = 'per_person' then 'guests' else 'pieces' end;
    end if;
  end if;
  if v_quantity is not null and v_pkg.min_quantity is not null and v_quantity < v_pkg.min_quantity then
    raise exception 'This package is for at least % %', v_pkg.min_quantity,
      case when v_type = 'per_item' then 'pieces' else 'guests' end;
  end if;
  if v_quantity is not null and v_pkg.max_quantity is not null and v_quantity > v_pkg.max_quantity then
    raise exception 'This package is for at most % %', v_pkg.max_quantity,
      case when v_type = 'per_item' then 'pieces' else 'guests' end;
  end if;

  v_minutes := case
    when v_type = 'hourly' then round(coalesce(p_hours, v_pkg.duration_minutes / 60.0, 1) * 60)::integer
    when v_type = 'daily' then coalesce(v_pkg.duration_minutes, 12 * 60)
    else coalesce(v_pkg.duration_minutes, 120)
  end;
  if v_minutes <= 0 or v_minutes > 24 * 60 then
    raise exception 'Invalid duration';
  end if;

  v_subtotal := case v_type
    when 'fixed' then v_pkg.price_cents
    when 'daily' then v_pkg.price_cents
    when 'hourly' then round(v_pkg.price_cents * v_minutes / 60.0)::integer
    when 'per_person' then (v_pkg.price_cents::bigint * v_quantity)::integer
    when 'per_item' then (v_pkg.price_cents::bigint * v_quantity)::integer
    else null
  end;

  select coalesce(sum(a.price_cents), 0)::integer into v_addons
  from public.package_addons a
  where a.id = any (coalesce(p_addon_ids, '{}')) and a.provider_id = v_provider.id and a.is_active;

  v_total := case when v_subtotal is null then null else v_subtotal + v_addons end;

  select cp.rules into v_policy from public.cancellation_policies cp where cp.id = v_provider.cancellation_policy_id;
  v_policy := coalesce(v_policy, '[]'::jsonb);

  foreach v_day in array p_dates loop
    if v_day < (now() at time zone v_provider.timezone)::date then
      raise exception '% is in the past', v_day;
    end if;

    v_start := (v_day + p_start_time) at time zone v_provider.timezone;

    if exists (
      select 1 from public.blackouts b
      where b.provider_id = v_provider.id
        and b.during && tstzrange(v_start, v_start + make_interval(mins => v_minutes))
    ) then
      raise exception '% isn''t available on %', v_provider.display_name, v_day;
    end if;

    begin
      insert into public.bookings (
        client_id, provider_id, package_id, category_id, event_id, time_range, timezone,
        location_text, notes, quantity, subtotal_cents, addons_cents, total_cents, deposit_cents,
        currency, package_snapshot, policy_snapshot, expires_at
      ) values (
        v_uid, v_provider.id, v_pkg.id, v_pkg.category_id, p_event_id,
        tstzrange(v_start, v_start + make_interval(mins => v_minutes)), v_provider.timezone,
        p_location_text, p_notes, v_quantity, v_subtotal, v_addons, v_total,
        case when v_total is null then null else round(v_total * v_pkg.deposit_pct / 100.0)::integer end,
        v_pkg.currency, to_jsonb(v_pkg), v_policy, now() + interval '48 hours'
      )
      returning * into v_booking;
    exception when exclusion_violation then
      raise exception '% is % on %', v_provider.display_name,
        case when v_provider.max_concurrent > 1 then 'fully booked' else 'already booked' end, v_day;
    end;

    insert into public.booking_addons (booking_id, addon_id, name, price_cents)
    select v_booking.id, a.id, a.name, a.price_cents
    from public.package_addons a
    where a.id = any (coalesce(p_addon_ids, '{}')) and a.provider_id = v_provider.id and a.is_active;

    return next v_booking;
  end loop;
end;
$$;

revoke execute on function public.request_booking(uuid, date[], time, numeric, uuid[], text, text, uuid, integer) from public, anon;
grant execute on function public.request_booking(uuid, date[], time, numeric, uuid[], text, text, uuid, integer) to authenticated;

-- ============================================================================
-- 4. seed.sql
-- ============================================================================
-- Reference data every environment needs. Safe to run more than once: re-running
-- fixes names, order and schemas. (Runs automatically after migrations on
-- `supabase db reset` locally; on the hosted project paste it into the SQL editor,
-- or use supabase/demo/all_verticals_setup.sql which includes it.)
--
-- Slugs, names and order come from frontend/src/verticals/catalog.js, the shared
-- source of truth. Change them there first, then here. See docs/VERTICALS.md.

-- ---------------------------------------------------------------------------
-- Photography vertical + the custom fields its providers and packages carry.
-- ---------------------------------------------------------------------------
insert into public.service_categories (slug, name, kind, sort_order, provider_schema, package_schema)
values (
  'photography', 'Photography', 'vertical', 1,
  '{
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "gear": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "bodies": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 20 },
          "lenses": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 40 }
        }
      },
      "specialties": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 10 },
      "watermark_default": { "type": "boolean" }
    }
  }'::jsonb,
  '{
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "edited_photos": { "type": "integer", "minimum": 0, "maximum": 10000 },
      "editing_level": { "type": "string", "maxLength": 80 },
      "turnaround_days": { "type": "integer", "minimum": 0, "maximum": 365 },
      "deliverables": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 20 },
      "second_shooter_included": { "type": "boolean" }
    }
  }'::jsonb
)
on conflict (slug) do update
  set name = excluded.name,
      sort_order = excluded.sort_order,
      provider_schema = excluded.provider_schema,
      package_schema = excluded.package_schema;

-- ---------------------------------------------------------------------------
-- Every other vertical, in catalog order. Each has its own JSON Schemas for
-- providers.attributes and packages.attributes (services inherit them).
-- Conventions:
--   - additionalProperties false, so typos and fields from another vertical are rejected;
--   - lists of free text are short strings (maxLength 40-80) with a maxItems cap;
--   - enums only where the app filters on the value (dietary, setting, service style, roles);
--   - guest / piece limits of a package live in packages.min_quantity / max_quantity,
--     not in attributes, so booking and the planner can use them for every vertical;
--   - units_per_guest (per-item packages): how many pieces a typical guest needs
--     (a chair = 1, a centerpiece for tables of 8 = 0.125). The planner uses it to
--     estimate quantities; leave it out for one-off items like a cake.
-- ---------------------------------------------------------------------------
insert into public.service_categories (slug, name, kind, sort_order, provider_schema, package_schema)
values
  -- 2. Videography ------------------------------------------------------------
  ('videography', 'Videography', 'vertical', 2,
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "specialties": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 10 },
       "styles": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 10 },
       "gear": {
         "type": "object", "additionalProperties": false,
         "properties": {
           "cameras": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 20 },
           "drones": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 10 }
         }
       },
       "drone_licensed": { "type": "boolean" }
     }
   }',
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "film_minutes": { "type": "integer", "minimum": 0, "maximum": 600 },
       "highlight_minutes": { "type": "integer", "minimum": 0, "maximum": 60 },
       "raw_footage": { "type": "boolean" },
       "turnaround_days": { "type": "integer", "minimum": 0, "maximum": 365 },
       "deliverables": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 20 },
       "second_shooter_included": { "type": "boolean" }
     }
   }'),

  -- 3. Venues -----------------------------------------------------------------
  ('venue', 'Venues', 'vertical', 3,
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "setting": { "enum": ["indoor", "outdoor", "indoor-outdoor"] },
       "capacity_seated": { "type": "integer", "minimum": 1, "maximum": 5000 },
       "capacity_standing": { "type": "integer", "minimum": 1, "maximum": 10000 },
       "amenities": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 30 },
       "address": { "type": "string", "maxLength": 200 },
       "parking": { "type": "string", "maxLength": 120 },
       "in_house_catering": { "type": "boolean" },
       "outside_catering_allowed": { "type": "boolean" },
       "alcohol_allowed": { "type": "boolean" },
       "curfew": { "type": "string", "pattern": "^([01][0-9]|2[0-3]):[0-5][0-9]$" }
     }
   }',
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "hours_included": { "type": "integer", "minimum": 1, "maximum": 24 },
       "spaces": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 10 },
       "includes": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 20 },
       "weekday_only": { "type": "boolean" }
     }
   }'),

  -- 4. Catering ---------------------------------------------------------------
  ('catering', 'Catering', 'vertical', 4,
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "cuisines": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 15 },
       "dietary": { "type": "array", "items": { "enum": ["vegetarian", "vegan", "gluten-free", "dairy-free", "nut-free", "halal", "kosher"] }, "uniqueItems": true },
       "service_styles": { "type": "array", "items": { "enum": ["buffet", "plated", "family-style", "stations", "passed-appetizers", "food-truck", "drop-off"] }, "uniqueItems": true },
       "min_guests": { "type": "integer", "minimum": 1, "maximum": 100000 },
       "max_guests": { "type": "integer", "minimum": 1, "maximum": 100000 },
       "staff_included": { "type": "boolean" }
     }
   }',
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "service_style": { "enum": ["buffet", "plated", "family-style", "stations", "passed-appetizers", "food-truck", "drop-off"] },
       "courses": { "type": "integer", "minimum": 1, "maximum": 12 },
       "menu": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 30 },
       "dietary": { "type": "array", "items": { "enum": ["vegetarian", "vegan", "gluten-free", "dairy-free", "nut-free", "halal", "kosher"] }, "uniqueItems": true },
       "staff_included": { "type": "boolean" },
       "tableware_included": { "type": "boolean" }
     }
   }'),

  -- 5. Private chefs ----------------------------------------------------------
  ('private-chef', 'Private chefs', 'vertical', 5,
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "cuisines": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 15 },
       "dietary": { "type": "array", "items": { "enum": ["vegetarian", "vegan", "gluten-free", "dairy-free", "nut-free", "halal", "kosher"] }, "uniqueItems": true },
       "max_guests": { "type": "integer", "minimum": 1, "maximum": 500 },
       "training": { "type": "string", "maxLength": 120 }
     }
   }',
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "courses": { "type": "integer", "minimum": 1, "maximum": 20 },
       "menu": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 30 },
       "dietary": { "type": "array", "items": { "enum": ["vegetarian", "vegan", "gluten-free", "dairy-free", "nut-free", "halal", "kosher"] }, "uniqueItems": true },
       "groceries_included": { "type": "boolean" },
       "cleanup_included": { "type": "boolean" },
       "serving_staff_included": { "type": "boolean" }
     }
   }'),

  -- 6. Cakes & desserts -------------------------------------------------------
  ('cakes', 'Cakes & desserts', 'vertical', 6,
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "specialties": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 15 },
       "dietary": { "type": "array", "items": { "enum": ["vegetarian", "vegan", "gluten-free", "dairy-free", "nut-free", "halal", "kosher"] }, "uniqueItems": true },
       "delivery": { "type": "boolean" },
       "tastings": { "type": "boolean" }
     }
   }',
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "servings": { "type": "integer", "minimum": 1, "maximum": 5000 },
       "tiers": { "type": "integer", "minimum": 1, "maximum": 10 },
       "flavors": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 20 },
       "dietary": { "type": "array", "items": { "enum": ["vegetarian", "vegan", "gluten-free", "dairy-free", "nut-free", "halal", "kosher"] }, "uniqueItems": true },
       "delivery_included": { "type": "boolean" },
       "setup_included": { "type": "boolean" },
       "units_per_guest": { "type": "number", "minimum": 0, "maximum": 10 }
     }
   }'),

  -- 7. Bar & drinks -----------------------------------------------------------
  ('bar', 'Bar & drinks', 'vertical', 7,
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "bar_types": { "type": "array", "items": { "enum": ["full-bar", "beer-wine", "cocktails", "mocktails", "coffee"] }, "uniqueItems": true },
       "provides_alcohol": { "type": "boolean" },
       "liability_insured": { "type": "boolean" },
       "max_guests": { "type": "integer", "minimum": 1, "maximum": 100000 }
     }
   }',
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "hours_included": { "type": "integer", "minimum": 1, "maximum": 24 },
       "bartenders": { "type": "integer", "minimum": 1, "maximum": 50 },
       "signature_cocktails": { "type": "integer", "minimum": 0, "maximum": 20 },
       "alcohol_included": { "type": "boolean" },
       "menu": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 30 },
       "glassware_included": { "type": "boolean" }
     }
   }'),

  -- 8. DJs & live music -------------------------------------------------------
  ('music', 'DJs & live music', 'vertical', 8,
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "acts": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 10 },
       "genres": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 20 },
       "languages": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 10 },
       "members": { "type": "integer", "minimum": 1, "maximum": 50 },
       "equipment_included": { "type": "boolean" },
       "lighting_available": { "type": "boolean" }
     }
   }',
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "sets": { "type": "integer", "minimum": 1, "maximum": 10 },
       "set_minutes": { "type": "integer", "minimum": 5, "maximum": 480 },
       "musicians": { "type": "integer", "minimum": 1, "maximum": 50 },
       "equipment_included": { "type": "boolean" },
       "lighting_included": { "type": "boolean" },
       "ceremony_music": { "type": "boolean" },
       "mc_included": { "type": "boolean" },
       "song_requests": { "type": "boolean" }
     }
   }'),

  -- 9. Entertainment ----------------------------------------------------------
  ('entertainment', 'Entertainment', 'vertical', 9,
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "acts": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 10 },
       "age_groups": { "type": "array", "items": { "enum": ["kids", "teens", "adults", "all-ages"] }, "uniqueItems": true },
       "space_needed": { "type": "string", "maxLength": 120 },
       "outdoor_ok": { "type": "boolean" }
     }
   }',
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "performers": { "type": "integer", "minimum": 1, "maximum": 50 },
       "includes": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 20 },
       "prints_included": { "type": "boolean" },
       "setup_minutes": { "type": "integer", "minimum": 0, "maximum": 480 }
     }
   }'),

  -- 10. Florals ---------------------------------------------------------------
  ('florals', 'Florals', 'vertical', 10,
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "styles": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 10 },
       "flowers": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 30 },
       "foam_free": { "type": "boolean" },
       "delivery": { "type": "boolean" }
     }
   }',
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "pieces": { "type": "integer", "minimum": 1, "maximum": 1000 },
       "flowers": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 20 },
       "color_palette": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 10 },
       "vessels_included": { "type": "boolean" },
       "delivery_included": { "type": "boolean" },
       "setup_included": { "type": "boolean" },
       "units_per_guest": { "type": "number", "minimum": 0, "maximum": 10 }
     }
   }'),

  -- 11. Decor & design --------------------------------------------------------
  ('decor', 'Decor & design', 'vertical', 11,
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "styles": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 10 },
       "themes": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 20 },
       "inventory_owned": { "type": "boolean" }
     }
   }',
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "theme": { "type": "string", "maxLength": 80 },
       "includes": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 30 },
       "color_palette": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 10 },
       "setup_included": { "type": "boolean" },
       "teardown_included": { "type": "boolean" }
     }
   }'),

  -- 12. Hair & makeup ---------------------------------------------------------
  ('hair-makeup', 'Hair & makeup', 'vertical', 12,
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "products": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 20 },
       "techniques": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 15 },
       "travel": { "type": "boolean" },
       "team_size": { "type": "integer", "minimum": 1, "maximum": 50 }
     }
   }',
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "services": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 10 },
       "trial_included": { "type": "boolean" },
       "on_location": { "type": "boolean" },
       "touch_up_hours": { "type": "integer", "minimum": 0, "maximum": 24 },
       "lashes_included": { "type": "boolean" }
     }
   }'),

  -- 13. Rentals ---------------------------------------------------------------
  ('rentals', 'Rentals', 'vertical', 13,
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "inventory": {
         "type": "array", "maxItems": 200,
         "items": {
           "type": "object", "additionalProperties": false, "required": ["item"],
           "properties": {
             "item": { "type": "string", "maxLength": 80 },
             "quantity": { "type": "integer", "minimum": 1, "maximum": 100000 },
             "price_cents": { "type": "integer", "minimum": 0 }
           }
         }
       },
       "delivery": { "type": "boolean" },
       "setup": { "type": "boolean" }
     }
   }',
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "item": { "type": "string", "maxLength": 80 },
       "dimensions": { "type": "string", "maxLength": 80 },
       "color": { "type": "string", "maxLength": 40 },
       "available": { "type": "integer", "minimum": 1, "maximum": 100000 },
       "bundle": {
         "type": "array", "maxItems": 30,
         "items": {
           "type": "object", "additionalProperties": false, "required": ["item"],
           "properties": {
             "item": { "type": "string", "maxLength": 80 },
             "quantity": { "type": "integer", "minimum": 1, "maximum": 100000 }
           }
         }
       },
       "units_per_guest": { "type": "number", "minimum": 0, "maximum": 10 },
       "delivery_included": { "type": "boolean" },
       "setup_included": { "type": "boolean" }
     }
   }'),

  -- 14. Planners --------------------------------------------------------------
  ('planning', 'Planners', 'vertical', 14,
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "specialties": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 10 },
       "languages": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 10 },
       "certifications": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 10 },
       "team_size": { "type": "integer", "minimum": 1, "maximum": 200 }
     }
   }',
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "months_of_planning": { "type": "integer", "minimum": 0, "maximum": 36 },
       "day_of_hours": { "type": "integer", "minimum": 0, "maximum": 24 },
       "meetings": { "type": "integer", "minimum": 0, "maximum": 100 },
       "vendor_referrals": { "type": "boolean" },
       "budget_tracking": { "type": "boolean" },
       "includes": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 20 }
     }
   }'),

  -- 15. Officiants ------------------------------------------------------------
  ('officiant', 'Officiants', 'vertical', 15,
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "ceremony_types": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 10 },
       "languages": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 10 },
       "ordained_by": { "type": "string", "maxLength": 120 }
     }
   }',
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "ceremony_minutes": { "type": "integer", "minimum": 5, "maximum": 240 },
       "meetings": { "type": "integer", "minimum": 0, "maximum": 20 },
       "custom_ceremony": { "type": "boolean" },
       "rehearsal_included": { "type": "boolean" },
       "license_filing": { "type": "boolean" }
     }
   }'),

  -- 16. Transportation --------------------------------------------------------
  ('transportation', 'Transportation', 'vertical', 16,
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "fleet": {
         "type": "array", "maxItems": 50,
         "items": {
           "type": "object", "additionalProperties": false, "required": ["vehicle"],
           "properties": {
             "vehicle": { "type": "string", "maxLength": 80 },
             "passengers": { "type": "integer", "minimum": 1, "maximum": 100 },
             "quantity": { "type": "integer", "minimum": 1, "maximum": 500 }
           }
         }
       },
       "licensed": { "type": "boolean" }
     }
   }',
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "vehicle": { "type": "string", "maxLength": 80 },
       "passengers": { "type": "integer", "minimum": 1, "maximum": 100 },
       "min_hours": { "type": "integer", "minimum": 1, "maximum": 24 },
       "chauffeur_included": { "type": "boolean" },
       "includes": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 20 }
     }
   }'),

  -- 17. Event staff -----------------------------------------------------------
  ('staffing', 'Event staff', 'vertical', 17,
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "roles": { "type": "array", "items": { "enum": ["servers", "bartenders", "valet", "security", "cleanup", "coordinators", "hosts"] }, "uniqueItems": true },
       "team_size": { "type": "integer", "minimum": 1, "maximum": 1000 },
       "insured": { "type": "boolean" }
     }
   }',
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "role": { "enum": ["servers", "bartenders", "valet", "security", "cleanup", "coordinators", "hosts"] },
       "staff": { "type": "integer", "minimum": 1, "maximum": 200 },
       "min_hours": { "type": "integer", "minimum": 1, "maximum": 24 },
       "attire": { "type": "string", "maxLength": 80 },
       "includes": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 20 }
     }
   }'),

  -- 18. Wellness --------------------------------------------------------------
  ('wellness', 'Wellness', 'vertical', 18,
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "modalities": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 15 },
       "certifications": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 10 },
       "comes_to_you": { "type": "boolean" },
       "brings_equipment": { "type": "boolean" }
     }
   }',
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "session_minutes": { "type": "integer", "minimum": 10, "maximum": 600 },
       "max_people": { "type": "integer", "minimum": 1, "maximum": 100 },
       "equipment_included": { "type": "boolean" },
       "includes": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 20 }
     }
   }')
on conflict (slug) do update
  set name = excluded.name,
      sort_order = excluded.sort_order,
      provider_schema = excluded.provider_schema,
      package_schema = excluded.package_schema;

-- ---------------------------------------------------------------------------
-- Services under each vertical (they inherit its schemas), in catalog order.
-- ---------------------------------------------------------------------------
insert into public.service_categories (slug, name, kind, parent_id, sort_order)
select s.slug, s.name, 'service', v.id, s.sort_order
from (values
  ('photography', 'wedding', 'Wedding', 1),
  ('photography', 'graduation', 'Graduation', 2),
  ('photography', 'portrait', 'Portrait', 3),
  ('photography', 'event', 'Event', 4),
  ('photography', 'headshots', 'Headshots', 5),
  ('photography', 'real-estate', 'Real estate', 6),
  ('photography', 'product', 'Product', 7),
  ('photography', 'coaching', 'Coaching', 8),
  ('photography', 'meetups', 'Meetups', 9),
  ('videography', 'wedding-film', 'Wedding film', 1),
  ('videography', 'event-recap', 'Event recap', 2),
  ('videography', 'social-reels', 'Social reels', 3),
  ('videography', 'music-video', 'Music video', 4),
  ('videography', 'drone', 'Drone', 5),
  ('venue', 'wedding-venue', 'Wedding venue', 1),
  ('venue', 'party-space', 'Party space', 2),
  ('venue', 'rooftop', 'Rooftop', 3),
  ('venue', 'garden-estate', 'Garden & estate', 4),
  ('venue', 'restaurant-buyout', 'Restaurant buyout', 5),
  ('venue', 'studio-space', 'Studio space', 6),
  ('catering', 'full-service-catering', 'Full service', 1),
  ('catering', 'buffet', 'Buffet', 2),
  ('catering', 'plated-dinner', 'Plated dinner', 3),
  ('catering', 'food-truck', 'Food truck', 4),
  ('catering', 'drop-off-catering', 'Drop-off', 5),
  ('catering', 'brunch', 'Brunch', 6),
  ('private-chef', 'chef-dinner', 'Dinner party', 1),
  ('private-chef', 'tasting-menu', 'Tasting menu', 2),
  ('private-chef', 'meal-prep', 'Meal prep', 3),
  ('private-chef', 'cooking-class', 'Cooking class', 4),
  ('cakes', 'wedding-cake', 'Wedding cake', 1),
  ('cakes', 'celebration-cake', 'Celebration cake', 2),
  ('cakes', 'dessert-table', 'Dessert table', 3),
  ('cakes', 'cupcakes-cookies', 'Cupcakes & cookies', 4),
  ('bar', 'mobile-bar', 'Mobile bar', 1),
  ('bar', 'bartender', 'Bartender', 2),
  ('bar', 'mixology', 'Signature cocktails', 3),
  ('bar', 'coffee-cart', 'Coffee cart', 4),
  ('music', 'dj', 'DJ', 1),
  ('music', 'live-band', 'Live band', 2),
  ('music', 'solo-musician', 'Solo musician', 3),
  ('music', 'string-quartet', 'String quartet', 4),
  ('music', 'mc', 'MC / host', 5),
  ('entertainment', 'photo-booth', 'Photo booth', 1),
  ('entertainment', 'magician', 'Magician', 2),
  ('entertainment', 'kids-entertainer', 'Kids entertainer', 3),
  ('entertainment', 'face-painting', 'Face painting', 4),
  ('entertainment', 'dancers', 'Dancers', 5),
  ('entertainment', 'caricature', 'Caricature artist', 6),
  ('florals', 'bridal-bouquet', 'Bouquets', 1),
  ('florals', 'centerpieces', 'Centerpieces', 2),
  ('florals', 'ceremony-florals', 'Ceremony arch', 3),
  ('florals', 'floral-installation', 'Installations', 4),
  ('decor', 'balloon-decor', 'Balloons', 1),
  ('decor', 'backdrops', 'Backdrops', 2),
  ('decor', 'lighting-design', 'Lighting', 3),
  ('decor', 'themed-decor', 'Themed decor', 4),
  ('decor', 'tablescapes', 'Tablescapes', 5),
  ('hair-makeup', 'bridal-makeup', 'Bridal makeup', 1),
  ('hair-makeup', 'event-makeup', 'Event makeup', 2),
  ('hair-makeup', 'hair-styling', 'Hair styling', 3),
  ('hair-makeup', 'nails', 'Nails', 4),
  ('hair-makeup', 'lashes-brows', 'Lashes & brows', 5),
  ('rentals', 'tables-chairs', 'Tables & chairs', 1),
  ('rentals', 'tents', 'Tents', 2),
  ('rentals', 'linens', 'Linens', 3),
  ('rentals', 'av-equipment', 'Sound & AV', 4),
  ('rentals', 'bounce-houses', 'Bounce houses', 5),
  ('planning', 'full-planning', 'Full planning', 1),
  ('planning', 'day-of-coordination', 'Day-of coordination', 2),
  ('planning', 'proposal-planning', 'Proposal planning', 3),
  ('planning', 'corporate-planning', 'Corporate events', 4),
  ('officiant', 'wedding-officiant', 'Wedding ceremony', 1),
  ('officiant', 'vow-renewal', 'Vow renewal', 2),
  ('officiant', 'elopement-officiant', 'Elopement', 3),
  ('transportation', 'limo', 'Limo', 1),
  ('transportation', 'party-bus', 'Party bus', 2),
  ('transportation', 'classic-car', 'Classic car', 3),
  ('transportation', 'guest-shuttle', 'Guest shuttle', 4),
  ('staffing', 'servers', 'Servers', 1),
  ('staffing', 'valet', 'Valet', 2),
  ('staffing', 'security', 'Security', 3),
  ('staffing', 'cleanup-crew', 'Cleanup crew', 4),
  ('wellness', 'massage', 'Massage', 1),
  ('wellness', 'yoga', 'Yoga', 2),
  ('wellness', 'personal-training', 'Personal training', 3),
  ('wellness', 'spa-day', 'Spa day', 4)
) as s (vertical, slug, name, sort_order)
join public.service_categories v on v.slug = s.vertical and v.kind = 'vertical'
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
-- 5. Migration history (what `supabase db push` / the MCP check)
-- ============================================================================
do $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    insert into supabase_migrations.schema_migrations (version, name)
    values ('20261009120000', 'direct_and_group_messages'),
           ('20261009120100', 'portfolio_owner_select'),
           ('20261010000000', 'all_verticals')
    on conflict (version) do nothing;
  end if;
end $$;

-- Check: 18 verticals, 87 services.
select (select count(*) from public.service_categories where kind = 'vertical') as verticals,
       (select count(*) from public.service_categories where kind = 'service') as services;
