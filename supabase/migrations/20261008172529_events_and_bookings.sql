-- 0005: events (multi-vendor grouping), bookings + state machine RPCs,
-- availability search, and scheduled jobs.
--
-- Booking status flow:
--   requested -> (countered) -> accepted -> confirmed (deposit paid, set by payment webhook)
--   -> in_progress -> delivered -> completed
--   side branches: declined, expired, cancelled_by_client, cancelled_by_provider, disputed, refunded
--
-- The app never updates bookings directly: every change goes through the
-- security-definer functions below (or server code for payments).

create extension if not exists pg_cron with schema pg_catalog;

create type public.booking_status as enum (
  'requested', 'countered', 'accepted', 'confirmed', 'in_progress', 'delivered', 'completed',
  'declined', 'expired', 'cancelled_by_client', 'cancelled_by_provider', 'disputed', 'refunded'
);
create type public.offer_status as enum ('pending', 'accepted', 'declined', 'withdrawn');
create type public.event_status as enum ('draft', 'planning', 'booked', 'completed', 'cancelled');
create type public.event_member_role as enum ('owner', 'co_planner');

-- ---------------------------------------------------------------------------
-- Events: a client's occasion (wedding, birthday...) that can group bookings
-- across categories. Optional today; the backbone of the event planner later.
-- ---------------------------------------------------------------------------
create table public.events (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 120),
  type          text,
  starts_at     timestamptz,
  ends_at       timestamptz,
  location_text text,
  location      extensions.geography(point, 4326),
  guest_count   integer check (guest_count >= 0),
  budget_cents  bigint check (budget_cents >= 0),
  currency      text not null default 'usd',
  status        public.event_status not null default 'draft',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create index events_owner_idx on public.events (owner_id);

create trigger events_updated_at
  before update on public.events
  for each row execute function extensions.moddatetime (updated_at);

create table public.event_members (
  event_id   uuid not null references public.events (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role       public.event_member_role not null default 'co_planner',
  created_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);

create index event_members_profile_idx on public.event_members (profile_id);

create function public.is_event_member(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.event_members m
    where m.event_id = p_event_id and m.profile_id = (select auth.uid())
  );
$$;

-- The creator is automatically the event's owner member.
create function public.add_event_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.event_members (event_id, profile_id, role) values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

create trigger events_add_owner
  after insert on public.events
  for each row execute function public.add_event_owner();

alter table public.events enable row level security;

create policy "Members see their events"
  on public.events for select
  to authenticated
  using ((select public.is_event_member(id)));

create policy "Users create their own events"
  on public.events for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy "Members edit their events"
  on public.events for update
  to authenticated
  using ((select public.is_event_member(id)))
  with check ((select public.is_event_member(id)));

create policy "Owners delete their events"
  on public.events for delete
  to authenticated
  using (owner_id = (select auth.uid()));

alter table public.event_members enable row level security;

create policy "Members see who else is planning"
  on public.event_members for select
  to authenticated
  using ((select public.is_event_member(event_id)));

create policy "Event owners manage members"
  on public.event_members for all
  to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.events e where e.id = event_id and e.owner_id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------
create table public.bookings (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.profiles (id) on delete restrict,
  provider_id      uuid not null references public.providers (id) on delete restrict,
  package_id       uuid references public.packages (id) on delete set null,
  category_id      uuid references public.service_categories (id) on delete set null,
  event_id         uuid references public.events (id) on delete set null,
  status           public.booking_status not null default 'requested',
  time_range       tstzrange not null
                     check (not isempty(time_range) and not lower_inf(time_range) and not upper_inf(time_range)),
  timezone         text not null,
  location_text    text check (char_length(location_text) <= 200),
  location         extensions.geography(point, 4326),
  notes            text check (char_length(notes) <= 2000),
  -- Price snapshot at request time (cents). total/deposit are null for quote-based requests.
  subtotal_cents   integer,
  addons_cents     integer not null default 0,
  travel_fee_cents integer not null default 0,
  total_cents      integer,
  deposit_cents    integer,
  currency         text not null default 'usd',
  package_snapshot jsonb not null,
  policy_snapshot  jsonb not null default '[]'::jsonb,
  expires_at       timestamptz,
  delivered_at     timestamptz,
  completed_at     timestamptz,
  cancelled_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- A provider can never have two active bookings that overlap in time.
  constraint bookings_no_double_booking
    exclude using gist (provider_id with =, time_range with &&)
    where (status in ('requested', 'countered', 'accepted', 'confirmed', 'in_progress'))
);

create index bookings_client_idx on public.bookings (client_id, created_at desc);
create index bookings_provider_status_idx on public.bookings (provider_id, status);
create index bookings_event_idx on public.bookings (event_id) where event_id is not null;
create index bookings_expiry_idx on public.bookings (expires_at) where status in ('requested', 'countered');

create trigger bookings_updated_at
  before update on public.bookings
  for each row execute function extensions.moddatetime (updated_at);

create function public.is_booking_party(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.bookings b
    where b.id = p_booking_id
      and (b.client_id = (select auth.uid()) or public.owns_provider(b.provider_id) or public.is_admin())
  );
$$;

alter table public.bookings enable row level security;

create policy "Clients and providers see their bookings"
  on public.bookings for select
  to authenticated
  using (
    client_id = (select auth.uid())
    or (select public.owns_provider(provider_id))
    or (select public.is_admin())
  );
-- No insert/update/delete policies: use the booking functions below.

create table public.booking_addons (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings (id) on delete cascade,
  addon_id    uuid references public.package_addons (id) on delete set null,
  name        text not null,
  price_cents integer not null
);

create index booking_addons_booking_idx on public.booking_addons (booking_id);

alter table public.booking_addons enable row level security;

create policy "Booking parties see add-ons"
  on public.booking_addons for select
  to authenticated
  using ((select public.is_booking_party(booking_id)));

create table public.booking_offers (
  id                   uuid primary key default gen_random_uuid(),
  booking_id           uuid not null references public.bookings (id) on delete cascade,
  proposed_total_cents integer not null check (proposed_total_cents >= 0),
  message              text check (char_length(message) <= 1000),
  status               public.offer_status not null default 'pending',
  created_by           uuid not null references public.profiles (id),
  created_at           timestamptz not null default now(),
  responded_at         timestamptz
);

create index booking_offers_booking_idx on public.booking_offers (booking_id);

alter table public.booking_offers enable row level security;

create policy "Booking parties see offers"
  on public.booking_offers for select
  to authenticated
  using ((select public.is_booking_party(booking_id)));

-- Append-only history of every status change.
create table public.booking_events (
  id          bigint generated always as identity primary key,
  booking_id  uuid not null references public.bookings (id) on delete cascade,
  from_status public.booking_status,
  to_status   public.booking_status not null,
  actor_id    uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index booking_events_booking_idx on public.booking_events (booking_id, created_at);

alter table public.booking_events enable row level security;

create policy "Booking parties see the history"
  on public.booking_events for select
  to authenticated
  using ((select public.is_booking_party(booking_id)));

create function public.log_booking_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    insert into public.booking_events (booking_id, from_status, to_status, actor_id)
    values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status, (select auth.uid()));
  end if;
  return new;
end;
$$;

create trigger bookings_log_status
  after insert or update of status on public.bookings
  for each row execute function public.log_booking_status();

-- ---------------------------------------------------------------------------
-- Availability: is a provider free on a given day (in their own timezone)?
-- Free = works that weekday (or has no hours set), no blocked-off time,
-- and no active booking that day.
-- ---------------------------------------------------------------------------
create function public.is_provider_free(p_provider_id uuid, p_day date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with p as (
    select id, timezone,
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
    and not exists (
      select 1 from public.bookings bk, p
      where bk.provider_id = p_provider_id
        and bk.status in ('requested', 'countered', 'accepted', 'confirmed', 'in_progress')
        and bk.time_range && p.day_range
    );
$$;

-- Search active providers, optionally only those free on given dates.
-- Results are sorted: free on the most dates first, then by starting price.
create function public.search_providers(
  p_dates date[] default null,
  p_category text default null,          -- vertical or service slug, e.g. 'photography' or 'wedding'
  p_max_price_cents integer default null,
  p_min_rating numeric default null,
  p_pro_only boolean default false
)
returns table (provider_id uuid, free_dates date[], starting_price_cents integer)
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select p.id
    from public.providers p
    where p.status = 'active'
      and (p_min_rating is null or p.rating_avg >= p_min_rating)
      and (not coalesce(p_pro_only, false) or p.is_pro)
      and (
        p_category is null
        or exists (select 1 from public.service_categories v where v.id = p.vertical_id and v.slug = p_category)
        or exists (select 1 from public.provider_services ps
                   join public.service_categories c on c.id = ps.category_id
                   where ps.provider_id = p.id and c.slug = p_category)
      )
  ),
  priced as (
    select b.id,
           (select min(pk.price_cents) from public.packages pk
            where pk.provider_id = b.id and pk.is_active and pk.price_cents is not null)::integer as starting_price_cents
    from base b
  ),
  free as (
    select pr.id, coalesce(array_agg(d order by d) filter (where public.is_provider_free(pr.id, d)), '{}') as free_dates
    from priced pr
    left join unnest(coalesce(p_dates, '{}'::date[])) d on true
    group by pr.id
  )
  select pr.id, f.free_dates, pr.starting_price_cents
  from priced pr
  join free f on f.id = pr.id
  where (p_max_price_cents is null or pr.starting_price_cents <= p_max_price_cents)
    and (coalesce(cardinality(p_dates), 0) = 0 or cardinality(f.free_dates) > 0)
  order by cardinality(f.free_dates) desc, pr.starting_price_cents nulls last;
$$;

-- ---------------------------------------------------------------------------
-- Booking functions (the only way to create or change bookings from the app)
-- ---------------------------------------------------------------------------

-- Client requests a package on one or more dates; creates one booking per date.
create function public.request_booking(
  p_package_id uuid,
  p_dates date[],
  p_start_time time,
  p_hours numeric default null,          -- hourly packages only
  p_addon_ids uuid[] default '{}',
  p_location_text text default null,
  p_notes text default null,
  p_event_id uuid default null
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

  v_minutes := case
    when v_pkg.price_type = 'hourly' then round(coalesce(p_hours, v_pkg.duration_minutes / 60.0, 1) * 60)::integer
    else coalesce(v_pkg.duration_minutes, 120)
  end;
  if v_minutes <= 0 or v_minutes > 24 * 60 then
    raise exception 'Invalid duration';
  end if;

  v_subtotal := case v_pkg.price_type
    when 'fixed' then v_pkg.price_cents
    when 'hourly' then round(v_pkg.price_cents * v_minutes / 60.0)::integer
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
        location_text, notes, subtotal_cents, addons_cents, total_cents, deposit_cents,
        currency, package_snapshot, policy_snapshot, expires_at
      ) values (
        v_uid, v_provider.id, v_pkg.id, v_pkg.category_id, p_event_id,
        tstzrange(v_start, v_start + make_interval(mins => v_minutes)), v_provider.timezone,
        p_location_text, p_notes, v_subtotal, v_addons, v_total,
        case when v_total is null then null else round(v_total * v_pkg.deposit_pct / 100.0)::integer end,
        v_pkg.currency, to_jsonb(v_pkg), v_policy, now() + interval '48 hours'
      )
      returning * into v_booking;
    exception when exclusion_violation then
      raise exception '% is already booked on %', v_provider.display_name, v_day;
    end;

    insert into public.booking_addons (booking_id, addon_id, name, price_cents)
    select v_booking.id, a.id, a.name, a.price_cents
    from public.package_addons a
    where a.id = any (coalesce(p_addon_ids, '{}')) and a.provider_id = v_provider.id and a.is_active;

    return next v_booking;
  end loop;
end;
$$;

-- Provider answers a request: 'accept', 'decline', or 'counter' (with a price).
create function public.respond_to_booking(
  p_booking_id uuid,
  p_action text,
  p_total_cents integer default null,
  p_message text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found or not public.owns_provider(b.provider_id) then
    raise exception 'Booking not found';
  end if;
  if b.status <> 'requested' then
    raise exception 'This request was already answered';
  end if;

  if p_action = 'accept' then
    if not (select identity_verified from public.providers where id = b.provider_id) then
      raise exception 'Verify your identity before accepting paid bookings' using errcode = 'insufficient_privilege';
    end if;
    if b.total_cents is null then
      raise exception 'Quote-based requests need a price: send a counter offer';
    end if;
    update public.bookings set status = 'accepted' where id = b.id returning * into b;

  elsif p_action = 'decline' then
    update public.bookings set status = 'declined' where id = b.id returning * into b;

  elsif p_action = 'counter' then
    if p_total_cents is null or p_total_cents < 0 then
      raise exception 'Enter a price for the counter offer';
    end if;
    insert into public.booking_offers (booking_id, proposed_total_cents, message, created_by)
    values (b.id, p_total_cents, p_message, (select auth.uid()));
    update public.bookings
      set status = 'countered', expires_at = now() + interval '48 hours'
      where id = b.id returning * into b;

  else
    raise exception 'Unknown action %', p_action;
  end if;

  return b;
end;
$$;

-- Client accepts or declines a counter offer.
create function public.respond_to_offer(p_offer_id uuid, p_accept boolean)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.booking_offers;
  b public.bookings;
  v_deposit_pct integer;
begin
  select * into o from public.booking_offers where id = p_offer_id for update;
  if not found then
    raise exception 'Offer not found';
  end if;
  select * into b from public.bookings where id = o.booking_id for update;
  if b.client_id is distinct from (select auth.uid()) then
    raise exception 'Offer not found';
  end if;
  if o.status <> 'pending' or b.status <> 'countered' then
    raise exception 'This offer is no longer open';
  end if;

  if p_accept then
    if not (select identity_verified from public.providers where id = b.provider_id) then
      raise exception 'This provider can''t take paid bookings yet';
    end if;
    v_deposit_pct := coalesce((b.package_snapshot ->> 'deposit_pct')::integer, 30);
    update public.booking_offers set status = 'accepted', responded_at = now() where id = o.id;
    update public.bookings
      set status = 'accepted',
          total_cents = o.proposed_total_cents,
          deposit_cents = round(o.proposed_total_cents * v_deposit_pct / 100.0)::integer
      where id = b.id returning * into b;
  else
    update public.booking_offers set status = 'declined', responded_at = now() where id = o.id;
    update public.bookings set status = 'declined' where id = b.id returning * into b;
  end if;

  return b;
end;
$$;

-- Either side cancels. Returns the refund percentage from the policy snapshot
-- (the actual refund is issued by the payments server code).
create function public.cancel_booking(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings;
  v_is_client boolean;
  v_days integer;
  v_refund_pct integer := 0;
  v_new_status public.booking_status;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found';
  end if;
  v_is_client := b.client_id = (select auth.uid());
  if not v_is_client and not public.owns_provider(b.provider_id) then
    raise exception 'Booking not found';
  end if;
  if b.status not in ('requested', 'countered', 'accepted', 'confirmed') then
    raise exception 'This booking can''t be cancelled now';
  end if;

  if b.status = 'confirmed' then
    if v_is_client then
      v_days := floor(extract(epoch from lower(b.time_range) - now()) / 86400);
      select (r ->> 'refund_pct')::integer into v_refund_pct
      from jsonb_array_elements(b.policy_snapshot) r
      where v_days >= (r ->> 'min_days_before')::integer
      order by (r ->> 'min_days_before')::integer desc
      limit 1;
      v_refund_pct := coalesce(v_refund_pct, 0);
    else
      v_refund_pct := 100;  -- provider cancels: client gets everything back
    end if;
  end if;

  v_new_status := case when v_is_client then 'cancelled_by_client' else 'cancelled_by_provider' end;
  update public.bookings set status = v_new_status, cancelled_at = now() where id = b.id;
  update public.booking_offers set status = 'withdrawn' where booking_id = b.id and status = 'pending';

  return jsonb_build_object('status', v_new_status, 'refund_pct', v_refund_pct);
end;
$$;

-- Provider marks the photos as delivered.
create function public.mark_delivered(p_booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found or not public.owns_provider(b.provider_id) then
    raise exception 'Booking not found';
  end if;
  if b.status not in ('confirmed', 'in_progress') then
    raise exception 'Only confirmed bookings can be delivered';
  end if;
  update public.bookings set status = 'delivered', delivered_at = now() where id = b.id returning * into b;
  return b;
end;
$$;

-- Client accepts the delivery: the booking completes (payout + reviews follow).
create function public.accept_delivery(p_booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found or b.client_id is distinct from (select auth.uid()) then
    raise exception 'Booking not found';
  end if;
  if b.status <> 'delivered' then
    raise exception 'There is no delivery to accept yet';
  end if;
  update public.bookings set status = 'completed', completed_at = now() where id = b.id returning * into b;
  return b;
end;
$$;

-- Only signed-in users can call the booking functions; search is public.
revoke execute on function public.request_booking(uuid, date[], time, numeric, uuid[], text, text, uuid) from public, anon;
revoke execute on function public.respond_to_booking(uuid, text, integer, text) from public, anon;
revoke execute on function public.respond_to_offer(uuid, boolean) from public, anon;
revoke execute on function public.cancel_booking(uuid) from public, anon;
revoke execute on function public.mark_delivered(uuid) from public, anon;
revoke execute on function public.accept_delivery(uuid) from public, anon;
grant execute on function public.request_booking(uuid, date[], time, numeric, uuid[], text, text, uuid) to authenticated;
grant execute on function public.respond_to_booking(uuid, text, integer, text) to authenticated;
grant execute on function public.respond_to_offer(uuid, boolean) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;
grant execute on function public.mark_delivered(uuid) to authenticated;
grant execute on function public.accept_delivery(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Scheduled jobs
-- ---------------------------------------------------------------------------
-- Unanswered requests and counter offers expire after 48 hours.
select cron.schedule(
  'expire-booking-requests', '*/10 * * * *',
  $$update public.bookings set status = 'expired'
    where status in ('requested', 'countered') and expires_at < now()$$
);

-- Confirmed bookings move to in_progress when the shoot starts.
select cron.schedule(
  'start-booked-shoots', '*/10 * * * *',
  $$update public.bookings set status = 'in_progress'
    where status = 'confirmed' and lower(time_range) <= now()$$
);

-- Deliveries the client hasn't accepted complete automatically after 7 days.
select cron.schedule(
  'auto-complete-deliveries', '0 * * * *',
  $$update public.bookings set status = 'completed', completed_at = now()
    where status = 'delivered' and delivered_at < now() - interval '7 days'$$
);
