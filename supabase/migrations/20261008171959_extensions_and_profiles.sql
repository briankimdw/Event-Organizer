-- 0001: extensions, shared enums, profiles, auth signup trigger, admins.
-- See docs/DATABASE.md for the design.

-- ---------------------------------------------------------------------------
-- Extensions (installed into the `extensions` schema, Supabase convention)
-- ---------------------------------------------------------------------------
create extension if not exists postgis with schema extensions;       -- distance / service-area queries
create extension if not exists btree_gist with schema extensions;    -- exclusion constraint for double-booking
create extension if not exists citext with schema extensions;        -- case-insensitive usernames / slugs
create extension if not exists pg_trgm with schema extensions;       -- fuzzy text search
create extension if not exists pg_jsonschema with schema extensions; -- validate per-category JSON fields
create extension if not exists moddatetime with schema extensions;   -- updated_at triggers

-- ---------------------------------------------------------------------------
-- Enums shared across the schema
-- ---------------------------------------------------------------------------
create type public.category_kind as enum ('vertical', 'service');
create type public.provider_status as enum ('draft', 'active', 'suspended');
create type public.price_type as enum ('fixed', 'hourly', 'quote');
create type public.verification_status as enum ('pending', 'verified', 'failed');

-- ---------------------------------------------------------------------------
-- Profiles: one row per auth user. Everyone is a client; providers are separate.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  username            extensions.citext not null unique
                        check (username::text ~ '^[a-z0-9._]{3,30}$'),
  display_name        text not null default '' check (char_length(display_name) <= 80),
  avatar_path         text,
  bio                 text check (char_length(bio) <= 500),
  city                text check (char_length(city) <= 80),
  location            extensions.geography(point, 4326),
  client_rating_avg   numeric(3, 2),
  client_rating_count integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.profiles is 'Public profile for every user. Created automatically on signup.';

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function extensions.moddatetime (updated_at);

-- Users may only edit these columns; ratings are maintained by triggers.
revoke update on public.profiles from anon, authenticated;
grant update (username, display_name, avatar_path, bio, city, location) on public.profiles to authenticated;

alter table public.profiles enable row level security;

create policy "Profiles are public"
  on public.profiles for select
  to anon, authenticated
  using (true);

create policy "Users update their own profile"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Signup trigger: create a profile with a unique, URL-safe username.
-- ---------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  candidate text;
  n integer := 0;
begin
  base := regexp_replace(
    lower(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1), 'user')),
    '[^a-z0-9._]', '', 'g'
  );
  if char_length(base) < 3 then
    base := base || 'user';
  end if;
  base := left(base, 24);
  candidate := base;
  while exists (select 1 from public.profiles p where p.username::text = candidate) loop
    n := n + 1;
    candidate := base || n::text;
  end loop;

  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    candidate,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 80)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Admins: membership is checked through is_admin(); never stored in user metadata.
-- ---------------------------------------------------------------------------
create table public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- RLS on with no policies: nobody can read or write this table through the API.
alter table public.admins enable row level security;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()));
$$;

-- ---------------------------------------------------------------------------
-- Identity verification (Stripe Identity). Status only; never images or biometrics.
-- Written by server code with the service role.
-- ---------------------------------------------------------------------------
create table public.identity_verifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  vendor      text not null default 'stripe_identity',
  external_id text,
  status      public.verification_status not null default 'pending',
  verified_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index identity_verifications_user_idx on public.identity_verifications (user_id);

create trigger identity_verifications_updated_at
  before update on public.identity_verifications
  for each row execute function extensions.moddatetime (updated_at);

alter table public.identity_verifications enable row level security;

create policy "Users read their own verification status"
  on public.identity_verifications for select
  to authenticated
  using (user_id = (select auth.uid()));
