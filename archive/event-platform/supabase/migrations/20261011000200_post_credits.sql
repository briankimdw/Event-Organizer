-- Post credits: on a post (album), tag the other vendors who worked that event
-- (a florist credits the photographer and the venue). Credits show on the post
-- as tappable vendor chips, and as "Tagged in" on the credited vendor's profile.
--
-- Also seeds one tag per occasion (tags.slug 'occasion-<occasion slug>') so a
-- post's occasion can be stored in album_tags. The app creates missing ones
-- itself (any signed-in user can add 'user' tags), so the seed is only tidiness.
--
-- Safe to run more than once.

create table if not exists public.album_credits (
  album_id    uuid not null references public.albums (id) on delete cascade,
  provider_id uuid not null references public.providers (id) on delete cascade,
  -- What they did, e.g. 'Photographer', 'Venue', 'Second shooter'. Null = their vertical.
  role        text check (role is null or char_length(role) between 1 and 40),
  created_at  timestamptz not null default now(),
  primary key (album_id, provider_id)
);

-- "Tagged in" on a vendor's profile: newest first.
create index if not exists album_credits_provider_idx on public.album_credits (provider_id, created_at desc);

-- At most 20 credits on one post.
create or replace function public.album_credits_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.album_credits c where c.album_id = new.album_id) >= 20 then
    raise exception 'A post can credit at most 20 vendors' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.album_credits_limit() from public, anon, authenticated;

drop trigger if exists album_credits_limit on public.album_credits;
create trigger album_credits_limit
  before insert on public.album_credits
  for each row execute function public.album_credits_limit();

alter table public.album_credits enable row level security;

-- Credits are visible wherever the post is (published + active listing, or the owner / an admin).
drop policy if exists "Credits follow their post's visibility" on public.album_credits;
create policy "Credits follow their post's visibility"
  on public.album_credits for select
  to anon, authenticated
  using ((select public.can_view_album(album_id)));

-- The post's owner credits active vendors, never their own listing on that post.
drop policy if exists "Owners credit vendors on their posts" on public.album_credits;
create policy "Owners credit vendors on their posts"
  on public.album_credits for insert
  to authenticated
  with check (
    (select public.owns_album(album_id))
    and exists (select 1 from public.providers p where p.id = provider_id and p.status = 'active')
    and not exists (select 1 from public.albums a where a.id = album_id and a.provider_id = album_credits.provider_id)
  );

-- The owner removes credits; a credited vendor can remove themselves.
drop policy if exists "Owners and credited vendors remove credits" on public.album_credits;
create policy "Owners and credited vendors remove credits"
  on public.album_credits for delete
  to authenticated
  using ((select public.owns_album(album_id)) or (select public.owns_provider(provider_id)));

-- Credits are added or removed, never edited.
revoke update on public.album_credits from anon, authenticated;

-- Occasion tags (slugs match OCCASIONS in frontend/src/verticals/catalog.js).
insert into public.tags (slug, name, kind) values
  ('occasion-wedding', 'Wedding', 'genre'),
  ('occasion-birthday', 'Birthday', 'genre'),
  ('occasion-graduation', 'Graduation', 'genre'),
  ('occasion-engagement', 'Proposal', 'genre'),
  ('occasion-corporate', 'Corporate', 'genre'),
  ('occasion-baby-shower', 'Baby shower', 'genre'),
  ('occasion-quinceanera', 'Quinceañera', 'genre'),
  ('occasion-dinner-party', 'Dinner party', 'genre'),
  ('occasion-bachelor', 'Bachelor/ette', 'genre'),
  ('occasion-holiday-party', 'Holiday party', 'genre')
on conflict (slug) do nothing;
