-- 0002: service categories, providers, cancellation policies, packages, add-ons.
-- Category-agnostic: photography-specific fields live in the categories' JSON Schemas.

-- ---------------------------------------------------------------------------
-- Service categories: verticals (Photography, Music, Catering...) and the
-- services under them (Wedding, Graduation...). Each can define JSON Schemas
-- for the custom fields its providers and packages carry.
-- ---------------------------------------------------------------------------
create table public.service_categories (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name            text not null,
  parent_id       uuid references public.service_categories (id) on delete restrict,
  kind            public.category_kind not null,
  package_schema  jsonb,  -- null = inherit from parent
  provider_schema jsonb,  -- null = inherit from parent
  is_active       boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  check ((kind = 'vertical') = (parent_id is null))
);

create index service_categories_parent_idx on public.service_categories (parent_id);

alter table public.service_categories enable row level security;

create policy "Categories are public"
  on public.service_categories for select
  to anon, authenticated
  using (true);

create policy "Admins manage categories"
  on public.service_categories for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- The JSON Schema that applies to a category (its own, else its parent's, else anything).
create function public.category_schema(p_category_id uuid, p_which text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
    case p_which when 'package' then c.package_schema else c.provider_schema end,
    case p_which when 'package' then p.package_schema else p.provider_schema end,
    '{}'::jsonb
  )
  from public.service_categories c
  left join public.service_categories p on p.id = c.parent_id
  where c.id = p_category_id;
$$;

-- ---------------------------------------------------------------------------
-- Cancellation policies: shared templates (provider_id null) or a provider's own.
-- rules = [{ "min_days_before": 30, "refund_pct": 100 }, ...], highest first.
-- ---------------------------------------------------------------------------
create table public.cancellation_policies (
  id          uuid primary key default gen_random_uuid(),
  provider_id uuid,  -- FK added after providers exists
  name        text not null,
  rules       jsonb not null check (jsonb_typeof(rules) = 'array'),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Providers: a business listing in one vertical, owned by a profile.
-- ---------------------------------------------------------------------------
create table public.providers (
  id                      uuid primary key default gen_random_uuid(),
  profile_id              uuid not null references public.profiles (id) on delete cascade,
  vertical_id             uuid not null references public.service_categories (id),
  display_name            text not null check (char_length(display_name) between 1 and 80),
  slug                    extensions.citext not null unique check (slug::text ~ '^[a-z0-9-]{3,40}$'),
  bio                     text check (char_length(bio) <= 1000),
  city                    text,
  base_location           extensions.geography(point, 4326),
  service_radius_km       integer not null default 40 check (service_radius_km between 0 and 1000),
  travel_fee_per_km_cents integer not null default 0 check (travel_fee_per_km_cents >= 0),
  buffer_minutes          integer not null default 60 check (buffer_minutes between 0 and 720),
  timezone                text not null default 'America/Los_Angeles',
  cancellation_policy_id  uuid references public.cancellation_policies (id) on delete set null,
  attributes              jsonb not null default '{}'::jsonb,
  status                  public.provider_status not null default 'draft',
  identity_verified       boolean not null default false,
  is_pro                  boolean not null default false,
  rating_avg              numeric(3, 2),
  rating_count            integer not null default 0,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (profile_id, vertical_id)
);

create index providers_profile_idx on public.providers (profile_id);
create index providers_vertical_status_idx on public.providers (vertical_id, status);
create index providers_location_idx on public.providers using gist (base_location);

alter table public.cancellation_policies
  add constraint cancellation_policies_provider_fk
  foreign key (provider_id) references public.providers (id) on delete cascade;

create trigger providers_updated_at
  before update on public.providers
  for each row execute function extensions.moddatetime (updated_at);

-- Owners may edit their listing, but not verification, Pro status or ratings.
revoke update on public.providers from anon, authenticated;
grant update (
  display_name, slug, bio, city, base_location, service_radius_km, travel_fee_per_km_cents,
  buffer_minutes, timezone, cancellation_policy_id, attributes, status
) on public.providers to authenticated;

-- Does the current user own this provider listing? (security definer avoids RLS recursion)
create function public.owns_provider(p_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.providers p
    where p.id = p_provider_id and p.profile_id = (select auth.uid())
  );
$$;

-- Validate attributes against the vertical's schema, and keep owners from
-- un-suspending themselves.
create function public.providers_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not extensions.jsonb_matches_schema(public.category_schema(new.vertical_id, 'provider')::json, new.attributes) then
    raise exception 'Provider attributes do not match the % schema', new.vertical_id
      using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' and not public.is_admin() and (select auth.uid()) is not null
     and (old.status = 'suspended' or new.status = 'suspended') and old.status is distinct from new.status then
    raise exception 'Only admins can change a suspended listing' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger providers_check
  before insert or update on public.providers
  for each row execute function public.providers_check();

alter table public.providers enable row level security;

create policy "Active providers are public; owners see their own"
  on public.providers for select
  to anon, authenticated
  using (status = 'active' or profile_id = (select auth.uid()) or (select public.is_admin()));

create policy "Owners update their listing"
  on public.providers for update
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));
-- No insert policy: listings are created through become_provider().

-- Cancellation policies: public (shown before booking); providers manage their own.
alter table public.cancellation_policies enable row level security;

create policy "Cancellation policies are public"
  on public.cancellation_policies for select
  to anon, authenticated
  using (true);

create policy "Providers manage their own policies"
  on public.cancellation_policies for all
  to authenticated
  using (provider_id is not null and (select public.owns_provider(provider_id)))
  with check (provider_id is not null and (select public.owns_provider(provider_id)));

-- ---------------------------------------------------------------------------
-- Sensitive provider data (Stripe). Owner reads; server writes.
-- ---------------------------------------------------------------------------
create table public.provider_private (
  provider_id       uuid primary key references public.providers (id) on delete cascade,
  stripe_account_id text,
  payouts_enabled   boolean not null default false,
  updated_at        timestamptz not null default now()
);

alter table public.provider_private enable row level security;

create policy "Owners read their private provider data"
  on public.provider_private for select
  to authenticated
  using ((select public.owns_provider(provider_id)));

-- ---------------------------------------------------------------------------
-- Which services a provider offers (e.g. Wedding + Portrait under Photography).
-- ---------------------------------------------------------------------------
create table public.provider_services (
  provider_id uuid not null references public.providers (id) on delete cascade,
  category_id uuid not null references public.service_categories (id) on delete cascade,
  primary key (provider_id, category_id)
);

create index provider_services_category_idx on public.provider_services (category_id);

alter table public.provider_services enable row level security;

create policy "Provider services are public"
  on public.provider_services for select
  to anon, authenticated
  using (true);

create policy "Owners manage their services"
  on public.provider_services for all
  to authenticated
  using ((select public.owns_provider(provider_id)))
  with check ((select public.owns_provider(provider_id)));

-- ---------------------------------------------------------------------------
-- Packages: what a provider sells. attributes are validated by the category schema.
-- ---------------------------------------------------------------------------
create table public.packages (
  id               uuid primary key default gen_random_uuid(),
  provider_id      uuid not null references public.providers (id) on delete cascade,
  category_id      uuid not null references public.service_categories (id),
  name             text not null check (char_length(name) between 1 and 80),
  description      text check (char_length(description) <= 2000),
  price_type       public.price_type not null,
  price_cents      integer check (price_cents >= 0),
  currency         text not null default 'usd',
  duration_minutes integer check (duration_minutes > 0),
  deposit_pct      integer not null default 30 check (deposit_pct between 0 and 100),
  attributes       jsonb not null default '{}'::jsonb,
  is_active        boolean not null default true,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check ((price_type = 'quote') = (price_cents is null))
);

create index packages_provider_idx on public.packages (provider_id);
create index packages_category_idx on public.packages (category_id);

create trigger packages_updated_at
  before update on public.packages
  for each row execute function extensions.moddatetime (updated_at);

create function public.packages_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not extensions.jsonb_matches_schema(public.category_schema(new.category_id, 'package')::json, new.attributes) then
    raise exception 'Package attributes do not match the category schema' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger packages_check
  before insert or update on public.packages
  for each row execute function public.packages_check();

alter table public.packages enable row level security;

create policy "Active packages of active providers are public; owners see all of theirs"
  on public.packages for select
  to anon, authenticated
  using (
    (is_active and exists (select 1 from public.providers p where p.id = provider_id and p.status = 'active'))
    or (select public.owns_provider(provider_id))
  );

create policy "Owners manage their packages"
  on public.packages for all
  to authenticated
  using ((select public.owns_provider(provider_id)))
  with check ((select public.owns_provider(provider_id)));

-- ---------------------------------------------------------------------------
-- Add-ons a provider offers on top of packages (extra hour, second shooter...).
-- ---------------------------------------------------------------------------
create table public.package_addons (
  id          uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  price_cents integer not null check (price_cents >= 0),
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index package_addons_provider_idx on public.package_addons (provider_id);

alter table public.package_addons enable row level security;

create policy "Add-ons are public"
  on public.package_addons for select
  to anon, authenticated
  using (true);

create policy "Owners manage their add-ons"
  on public.package_addons for all
  to authenticated
  using ((select public.owns_provider(provider_id)))
  with check ((select public.owns_provider(provider_id)));

-- ---------------------------------------------------------------------------
-- Onboarding: turn the current user into a provider (starts as a draft listing).
-- ---------------------------------------------------------------------------
create function public.become_provider(
  p_display_name text,
  p_slug text,
  p_vertical_slug text default 'photography',
  p_bio text default null,
  p_city text default null
)
returns public.providers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vertical uuid;
  v_policy uuid;
  v_provider public.providers;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first' using errcode = 'insufficient_privilege';
  end if;

  select id into v_vertical from public.service_categories
  where slug = p_vertical_slug and kind = 'vertical' and is_active;
  if v_vertical is null then
    raise exception 'Unknown category %', p_vertical_slug;
  end if;

  select id into v_policy from public.cancellation_policies
  where provider_id is null and name = 'Moderate' limit 1;

  insert into public.providers (profile_id, vertical_id, display_name, slug, bio, city, cancellation_policy_id)
  values ((select auth.uid()), v_vertical, p_display_name, p_slug, p_bio, p_city, v_policy)
  returning * into v_provider;

  insert into public.provider_private (provider_id) values (v_provider.id);
  return v_provider;
end;
$$;

revoke execute on function public.become_provider(text, text, text, text, text) from public, anon;
grant execute on function public.become_provider(text, text, text, text, text) to authenticated;
