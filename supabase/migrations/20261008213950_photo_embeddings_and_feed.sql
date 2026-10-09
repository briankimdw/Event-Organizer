-- SigLIP photo embeddings, auto-tags, and the Discover feed.
--
-- The ML service (services/ml) computes, for every photo, a 768-number SigLIP
-- embedding (its visual "style fingerprint") and a few auto-tags (moody, golden
-- hour, black & white...). discover_feed() turns a user's swipes into a taste
-- vector and ranks unseen photos by similarity, with ~15% exploration.

create extension if not exists vector with schema extensions;

-- Auto-tags written by the ML service (owners can't set them: photos' column
-- grants from the portfolio migration don't include this column).
alter table public.photos add column auto_tags text[] not null default '{}';
create index photos_auto_tags_idx on public.photos using gin (auto_tags);

create table public.photo_embeddings (
  photo_id   uuid primary key references public.photos (id) on delete cascade,
  embedding  extensions.vector(768) not null,
  model      text not null,
  created_at timestamptz not null default now()
);

-- Fast nearest-neighbour search by cosine distance.
create index photo_embeddings_hnsw_idx on public.photo_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);

-- RLS on with no policies: only server code (service role) and the
-- security-definer functions below can read or write embeddings.
alter table public.photo_embeddings enable row level security;

-- ---------------------------------------------------------------------------
-- Functions for the ML worker (service role only)
-- ---------------------------------------------------------------------------

-- Photos that haven't been analysed yet, oldest first.
create function public.ml_pending_photos(p_limit integer default 20)
returns table (photo_id uuid, display_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_path
  from public.photos p
  left join public.photo_embeddings e on e.photo_id = p.id
  where e.photo_id is null
  order by p.created_at
  limit greatest(1, least(coalesce(p_limit, 20), 200));
$$;

-- Save one photo's embedding (as '[0.1, 0.2, ...]') and auto-tags.
create function public.ml_save_photo_analysis(p_photo_id uuid, p_embedding text, p_auto_tags text[], p_model text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.photo_embeddings (photo_id, embedding, model)
  values (p_photo_id, p_embedding::extensions.vector(768), p_model)
  on conflict (photo_id) do update
    set embedding = excluded.embedding, model = excluded.model, created_at = now();
  update public.photos set auto_tags = coalesce(p_auto_tags, '{}') where id = p_photo_id;
end;
$$;

revoke execute on function public.ml_pending_photos(integer) from public, anon, authenticated;
revoke execute on function public.ml_save_photo_analysis(uuid, text, text[], text) from public, anon, authenticated;
grant execute on function public.ml_pending_photos(integer) to service_role;
grant execute on function public.ml_save_photo_analysis(uuid, text, text[], text) to service_role;

-- ---------------------------------------------------------------------------
-- Discover feed
-- ---------------------------------------------------------------------------
-- Taste = average embedding of the user's recent likes/saves, nudged away from
-- their passes. Candidates are published photos the user hasn't swiped, minus
-- anything they said "not into this" about. One photo per album, at most two
-- per photographer, ~15% exploration picks mixed in. New users (fewer than 3
-- likes) get the newest photos until there's enough signal.
create function public.discover_feed(p_limit integer default 20, p_category text default null)
returns table (
  photo_id uuid,
  album_id uuid,
  provider_id uuid,
  display_path text,
  album_title text,
  auto_tags text[],
  score real,
  reason text,
  exploration boolean
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid());
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_explore integer;
  v_liked integer := 0;
  v_pos extensions.vector;
  v_neg extensions.vector;
  v_taste extensions.vector;
  v_fav_tags text[] := '{}';
  v_avoid_tags text[] := '{}';
  v_avoid_providers uuid[] := '{}';
begin
  v_explore := case when v_limit >= 4 then greatest(1, round(v_limit * 0.15)::integer) else 0 end;

  if v_uid is not null then
    -- Taste from the last 300 swipes on analysed photos.
    select count(*) filter (where s.action in ('like', 'save')),
           avg(e.embedding) filter (where s.action in ('like', 'save')),
           avg(e.embedding) filter (where s.action = 'pass')
      into v_liked, v_pos, v_neg
    from (
      select sw.photo_id, sw.action from public.swipes sw
      where sw.user_id = v_uid and sw.photo_id is not null
      order by sw.created_at desc
      limit 300
    ) s
    join public.photo_embeddings e on e.photo_id = s.photo_id;

    if v_liked >= 3 then
      v_taste := v_pos;
      if v_neg is not null then
        -- Move 30% away from what they pass on.
        v_taste := v_pos - (v_neg * array_fill(0.3::real, array[vector_dims(v_neg)])::extensions.vector);
      end if;

      -- Their most common tags among liked photos, for "Because you liked..." reasons.
      select coalesce(array_agg(t.tag order by t.n desc), '{}') into v_fav_tags
      from (
        select unnest(p.auto_tags) as tag, count(*) as n
        from public.swipes sw join public.photos p on p.id = sw.photo_id
        where sw.user_id = v_uid and sw.action in ('like', 'save')
        group by 1 order by 2 desc limit 5
      ) t;
    end if;

    select coalesce(array_agg(value) filter (where kind = 'tag'), '{}'),
           coalesce(array_agg(case when value ~* '^[0-9a-f-]{36}
      into v_avoid_tags, v_avoid_providers
    from public.taste_corrections where user_id = v_uid;
  end if;

  return query
  with cand as (
    select p.id as photo_id, p.album_id, a.provider_id, p.display_path, a.title as album_title, p.auto_tags,
           case when v_taste is null then null else (1 - (e.embedding <=> v_taste))::real end as sim,
           p.created_at
    from public.photos p
    join public.photo_embeddings e on e.photo_id = p.id
    join public.albums a on a.id = p.album_id
    join public.providers pr on pr.id = a.provider_id
    where a.status = 'published'
      and pr.status = 'active'
      and (v_uid is null or pr.profile_id <> v_uid)
      and (v_uid is null or not exists (
        select 1 from public.swipes sw where sw.user_id = v_uid and sw.photo_id = p.id))
      and not (p.auto_tags && v_avoid_tags)
      and not (a.provider_id = any (v_avoid_providers))
      and (a.kind <> 'before_after' or p.pair_role = 'after')
      and (
        p_category is null
        or exists (select 1 from public.service_categories c where c.id = a.category_id and c.slug = p_category)
        or exists (select 1 from public.service_categories v where v.id = pr.vertical_id and v.slug = p_category)
      )
  ),
  -- One photo per album (its best match)...
  per_album as (
    select distinct on (c.album_id) c.*
    from cand c
    order by c.album_id, c.sim desc nulls last, c.created_at desc
  ),
  -- ...and at most two albums per photographer.
  pool as (
    select x.* from (
      select pa.*, row_number() over (partition by pa.provider_id order by pa.sim desc nulls last, pa.created_at desc) as per_provider
      from per_album pa
    ) x
    where x.per_provider <= 2
  ),
  main as (
    select pl.*, row_number() over (order by pl.sim desc nulls last, pl.created_at desc)::numeric as pos, false as explore
    from pool pl
    order by pl.sim desc nulls last, pl.created_at desc
    limit greatest(v_limit - v_explore, 0)
  ),
  -- Exploration: random picks from what's left (by construction, less like their taste).
  explore as (
    select r.*, ((row_number() over () - 1) * 6 + 3.5)::numeric as pos, true as explore
    from (
      select pl.* from pool pl
      where pl.photo_id not in (select m.photo_id from main m)
      order by random()
      limit v_explore
    ) r
  ),
  feed as (
    select * from main
    union all
    select * from explore
  )
  select f.photo_id, f.album_id, f.provider_id, f.display_path, f.album_title, f.auto_tags,
         coalesce(f.sim, 0)::real,
         case
           when f.explore then 'Something new' || coalesce(': ' || f.auto_tags[1], '')
           when v_taste is null then 'New on photomatch'
           else coalesce(
             'Because you liked ' || (select t from unnest(f.auto_tags) t where t = any (v_fav_tags) limit 1) || ' shots',
             'Similar to photos you liked')
         end,
         f.explore
  from feed f
  order by f.pos;
end;
$$;

grant execute on function public.discover_feed(integer, text) to anon, authenticated;
 then value::uuid end)
                    filter (where kind = 'provider' and value ~* '^[0-9a-f-]{36}
      into v_avoid_tags, v_avoid_providers
    from public.taste_corrections where user_id = v_uid;
  end if;

  return query
  with cand as (
    select p.id as photo_id, p.album_id, a.provider_id, p.display_path, a.title as album_title, p.auto_tags,
           case when v_taste is null then null else (1 - (e.embedding <=> v_taste))::real end as sim,
           p.created_at
    from public.photos p
    join public.photo_embeddings e on e.photo_id = p.id
    join public.albums a on a.id = p.album_id
    join public.providers pr on pr.id = a.provider_id
    where a.status = 'published'
      and pr.status = 'active'
      and (v_uid is null or pr.profile_id <> v_uid)
      and (v_uid is null or not exists (
        select 1 from public.swipes sw where sw.user_id = v_uid and sw.photo_id = p.id))
      and not (p.auto_tags && v_avoid_tags)
      and not (a.provider_id = any (v_avoid_providers))
      and (a.kind <> 'before_after' or p.pair_role = 'after')
      and (
        p_category is null
        or exists (select 1 from public.service_categories c where c.id = a.category_id and c.slug = p_category)
        or exists (select 1 from public.service_categories v where v.id = pr.vertical_id and v.slug = p_category)
      )
  ),
  -- One photo per album (its best match)...
  per_album as (
    select distinct on (c.album_id) c.*
    from cand c
    order by c.album_id, c.sim desc nulls last, c.created_at desc
  ),
  -- ...and at most two albums per photographer.
  pool as (
    select x.* from (
      select pa.*, row_number() over (partition by pa.provider_id order by pa.sim desc nulls last, pa.created_at desc) as per_provider
      from per_album pa
    ) x
    where x.per_provider <= 2
  ),
  main as (
    select pl.*, row_number() over (order by pl.sim desc nulls last, pl.created_at desc)::numeric as pos, false as explore
    from pool pl
    order by pl.sim desc nulls last, pl.created_at desc
    limit greatest(v_limit - v_explore, 0)
  ),
  -- Exploration: random picks from what's left (by construction, less like their taste).
  explore as (
    select r.*, ((row_number() over () - 1) * 6 + 3.5)::numeric as pos, true as explore
    from (
      select pl.* from pool pl
      where pl.photo_id not in (select m.photo_id from main m)
      order by random()
      limit v_explore
    ) r
  ),
  feed as (
    select * from main
    union all
    select * from explore
  )
  select f.photo_id, f.album_id, f.provider_id, f.display_path, f.album_title, f.auto_tags,
         coalesce(f.sim, 0)::real,
         case
           when f.explore then 'Something new' || coalesce(': ' || f.auto_tags[1], '')
           when v_taste is null then 'New on photomatch'
           else coalesce(
             'Because you liked ' || (select t from unnest(f.auto_tags) t where t = any (v_fav_tags) limit 1) || ' shots',
             'Similar to photos you liked')
         end,
         f.explore
  from feed f
  order by f.pos;
end;
$$;

grant execute on function public.discover_feed(integer, text) to anon, authenticated;
), '{}')
      into v_avoid_tags, v_avoid_providers
    from public.taste_corrections where user_id = v_uid;
  end if;

  return query
  with cand as (
    select p.id as photo_id, p.album_id, a.provider_id, p.display_path, a.title as album_title, p.auto_tags,
           case when v_taste is null then null else (1 - (e.embedding <=> v_taste))::real end as sim,
           p.created_at
    from public.photos p
    join public.photo_embeddings e on e.photo_id = p.id
    join public.albums a on a.id = p.album_id
    join public.providers pr on pr.id = a.provider_id
    where a.status = 'published'
      and pr.status = 'active'
      and (v_uid is null or pr.profile_id <> v_uid)
      and (v_uid is null or not exists (
        select 1 from public.swipes sw where sw.user_id = v_uid and sw.photo_id = p.id))
      and not (p.auto_tags && v_avoid_tags)
      and not (a.provider_id = any (v_avoid_providers))
      and (a.kind <> 'before_after' or p.pair_role = 'after')
      and (
        p_category is null
        or exists (select 1 from public.service_categories c where c.id = a.category_id and c.slug = p_category)
        or exists (select 1 from public.service_categories v where v.id = pr.vertical_id and v.slug = p_category)
      )
  ),
  -- One photo per album (its best match)...
  per_album as (
    select distinct on (c.album_id) c.*
    from cand c
    order by c.album_id, c.sim desc nulls last, c.created_at desc
  ),
  -- ...and at most two albums per photographer.
  pool as (
    select x.* from (
      select pa.*, row_number() over (partition by pa.provider_id order by pa.sim desc nulls last, pa.created_at desc) as per_provider
      from per_album pa
    ) x
    where x.per_provider <= 2
  ),
  main as (
    select pl.*, row_number() over (order by pl.sim desc nulls last, pl.created_at desc)::numeric as pos, false as explore
    from pool pl
    order by pl.sim desc nulls last, pl.created_at desc
    limit greatest(v_limit - v_explore, 0)
  ),
  -- Exploration: random picks from what's left (by construction, less like their taste).
  explore as (
    select r.*, ((row_number() over () - 1) * 6 + 3.5)::numeric as pos, true as explore
    from (
      select pl.* from pool pl
      where pl.photo_id not in (select m.photo_id from main m)
      order by random()
      limit v_explore
    ) r
  ),
  feed as (
    select * from main
    union all
    select * from explore
  )
  select f.photo_id, f.album_id, f.provider_id, f.display_path, f.album_title, f.auto_tags,
         coalesce(f.sim, 0)::real,
         case
           when f.explore then 'Something new' || coalesce(': ' || f.auto_tags[1], '')
           when v_taste is null then 'New on photomatch'
           else coalesce(
             'Because you liked ' || (select t from unnest(f.auto_tags) t where t = any (v_fav_tags) limit 1) || ' shots',
             'Similar to photos you liked')
         end,
         f.explore
  from feed f
  order by f.pos;
end;
$$;

grant execute on function public.discover_feed(integer, text) to anon, authenticated;
