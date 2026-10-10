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
