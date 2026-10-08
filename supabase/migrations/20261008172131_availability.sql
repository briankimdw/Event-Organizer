-- 0003: provider availability (working hours + blocked-off time).
-- Availability search (search_providers / is_provider_free) is defined in 0005,
-- because it also has to look at bookings.

create table public.availability_rules (
  id          uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  weekday     smallint not null check (weekday between 0 and 6),  -- 0 = Sunday
  start_time  time not null,
  end_time    time not null,
  check (end_time > start_time)
);

create index availability_rules_provider_idx on public.availability_rules (provider_id, weekday);

alter table public.availability_rules enable row level security;

create policy "Working hours are public"
  on public.availability_rules for select
  to anon, authenticated
  using (true);

create policy "Owners manage their working hours"
  on public.availability_rules for all
  to authenticated
  using ((select public.owns_provider(provider_id)))
  with check ((select public.owns_provider(provider_id)));

-- Time a provider has blocked off (vacation, personal days).
create table public.blackouts (
  id          uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  during      tstzrange not null check (not isempty(during)),
  created_at  timestamptz not null default now()
);

create index blackouts_provider_during_idx on public.blackouts using gist (provider_id, during);

alter table public.blackouts enable row level security;

create policy "Blocked-off time is public (needed to show availability)"
  on public.blackouts for select
  to anon, authenticated
  using (true);

create policy "Owners manage their blocked-off time"
  on public.blackouts for all
  to authenticated
  using ((select public.owns_provider(provider_id)))
  with check ((select public.owns_provider(provider_id)));
