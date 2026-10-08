-- 0004: portfolio albums + photos, tags, and storage buckets.
-- An album is one shoot (a wedding, a grad session) with several photos.
-- Generic on purpose: florists and venues can post albums too.

create type public.album_kind as enum ('album', 'before_after');
create type public.album_status as enum ('processing', 'published', 'under_review', 'hidden');
create type public.photo_authenticity as enum ('unverified', 'real_verified', 'flagged', 'ai');
create type public.pair_role as enum ('before', 'after');
create type public.tag_kind as enum ('genre', 'user', 'auto');

-- ---------------------------------------------------------------------------
-- Albums
-- ---------------------------------------------------------------------------
create table public.albums (
  id             uuid primary key default gen_random_uuid(),
  provider_id    uuid not null references public.providers (id) on delete cascade,
  category_id    uuid references public.service_categories (id) on delete set null,
  title          text not null check (char_length(title) between 1 and 120),
  caption        text check (char_length(caption) <= 2200),
  location_text  text check (char_length(location_text) <= 120),
  shot_on        date,
  kind           public.album_kind not null default 'album',
  -- 'published' until the upload pipeline (EXIF, watermark, AI check) exists;
  -- then new albums will start as 'processing'.
  status         public.album_status not null default 'published',
  cover_photo_id uuid,  -- FK added after photos exists
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index albums_provider_idx on public.albums (provider_id, sort_order);

create trigger albums_updated_at
  before update on public.albums
  for each row execute function extensions.moddatetime (updated_at);

-- Can the current user see this album? (published + active provider, or owner/admin)
create function public.can_view_album(p_album_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.albums a
    join public.providers p on p.id = a.provider_id
    where a.id = p_album_id
      and ((a.status = 'published' and p.status = 'active')
           or p.profile_id = (select auth.uid())
           or public.is_admin())
  );
$$;

create function public.owns_album(p_album_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.albums a
    join public.providers p on p.id = a.provider_id
    where a.id = p_album_id and p.profile_id = (select auth.uid())
  );
$$;

-- Albums held for AI review can only be released by admins (or server code).
create function public.albums_status_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not public.is_admin()
     and old.status is distinct from new.status
     and (old.status in ('under_review', 'processing') or new.status = 'under_review') then
    raise exception 'This album is being reviewed and can''t be changed yet' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger albums_status_guard
  before update on public.albums
  for each row execute function public.albums_status_guard();

alter table public.albums enable row level security;

create policy "Published albums are public; owners see their own"
  on public.albums for select
  to anon, authenticated
  using ((select public.can_view_album(id)));

create policy "Owners manage their albums"
  on public.albums for all
  to authenticated
  using ((select public.owns_provider(provider_id)))
  with check ((select public.owns_provider(provider_id)));

-- ---------------------------------------------------------------------------
-- Photos
-- ---------------------------------------------------------------------------
create table public.photos (
  id            uuid primary key default gen_random_uuid(),
  album_id      uuid not null references public.albums (id) on delete cascade,
  owner_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  position      integer not null default 0,
  original_path text,           -- private bucket portfolio-originals
  display_path  text not null,  -- public bucket portfolio (resized, watermarked if enabled)
  width         integer,
  height        integer,
  blurhash      text,
  pair_role     public.pair_role,  -- before/after albums only
  exif          jsonb not null default '{}'::jsonb,  -- body, lens, focal, aperture, shutter, iso, flash, taken_at
  exif_hidden   text[] not null default '{}',       -- fields the owner chose to hide
  ai_score      real,
  authenticity  public.photo_authenticity not null default 'unverified',
  phash         text,
  created_at    timestamptz not null default now()
);

create index photos_album_idx on public.photos (album_id, position);
create index photos_owner_idx on public.photos (owner_id);

alter table public.albums
  add constraint albums_cover_photo_fk
  foreign key (cover_photo_id) references public.photos (id) on delete set null;

-- Owners can't set the AI-check fields; the upload pipeline does.
revoke insert, update on public.photos from anon, authenticated;
grant insert (album_id, owner_id, position, original_path, display_path, width, height, blurhash, pair_role, exif, exif_hidden)
  on public.photos to authenticated;
grant update (position, display_path, width, height, blurhash, pair_role, exif, exif_hidden)
  on public.photos to authenticated;

alter table public.photos enable row level security;

create policy "Photos follow their album's visibility"
  on public.photos for select
  to anon, authenticated
  using ((select public.can_view_album(album_id)));

create policy "Owners add photos to their albums"
  on public.photos for insert
  to authenticated
  with check (owner_id = (select auth.uid()) and (select public.owns_album(album_id)));

create policy "Owners edit their photos"
  on public.photos for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and (select public.owns_album(album_id)));

create policy "Owners delete their photos"
  on public.photos for delete
  to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Tags
-- ---------------------------------------------------------------------------
create table public.tags (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique check (slug ~ '^[a-z0-9-]{1,40}$'),
  name       text not null,
  kind       public.tag_kind not null default 'user',
  created_at timestamptz not null default now()
);

alter table public.tags enable row level security;

create policy "Tags are public"
  on public.tags for select
  to anon, authenticated
  using (true);

create policy "Signed-in users can create user tags"
  on public.tags for insert
  to authenticated
  with check (kind = 'user');

create table public.album_tags (
  album_id uuid not null references public.albums (id) on delete cascade,
  tag_id   uuid not null references public.tags (id) on delete cascade,
  primary key (album_id, tag_id)
);

create index album_tags_tag_idx on public.album_tags (tag_id);

alter table public.album_tags enable row level security;

create policy "Album tags follow album visibility"
  on public.album_tags for select
  to anon, authenticated
  using ((select public.can_view_album(album_id)));

create policy "Owners tag their albums"
  on public.album_tags for all
  to authenticated
  using ((select public.owns_album(album_id)))
  with check ((select public.owns_album(album_id)));

-- ---------------------------------------------------------------------------
-- Storage buckets. Object paths start with the uploader's user id:
--   {user_id}/{album_id}/{photo_id}.jpg
-- Deliveries and dispute evidence buckets come with bookings/payments later.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('portfolio', 'portfolio', true, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('portfolio-originals', 'portfolio-originals', false, 52428800, null),
  ('raw-proofs', 'raw-proofs', false, 157286400, null);

create policy "Users upload to their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id in ('avatars', 'portfolio', 'portfolio-originals', 'raw-proofs')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users update their own files"
  on storage.objects for update
  to authenticated
  using (
    bucket_id in ('avatars', 'portfolio', 'portfolio-originals', 'raw-proofs')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users delete their own files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id in ('avatars', 'portfolio', 'portfolio-originals', 'raw-proofs')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Private buckets: only the owner (and admins, for RAW proofs) can read.
create policy "Owners read their private files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id in ('portfolio-originals', 'raw-proofs')
    and ((storage.foldername(name))[1] = (select auth.uid())::text
         or (bucket_id = 'raw-proofs' and (select public.is_admin())))
  );
