-- discover_feed v2: soft photographer diversity + reserved exploration slots.
--
-- v1 capped each photographer at two albums, which starved the feed while there
-- are only a few photographers (2 photographers = max 4 photos), and left no room
-- for exploration. Now each extra album from the same photographer gets a small
-- score penalty instead (so photographers alternate but the feed still fills),
-- and the exploration slots are set aside before the main picks are taken.
create or replace function public.discover_feed(p_limit integer default 20, p_category text default null)
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
           coalesce(array_agg(case when value ~* '^[0-9a-f-]{36}$' then value::uuid end)
                    filter (where kind = 'provider' and value ~* '^[0-9a-f-]{36}$'), '{}')
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
  -- One photo per album (its best match).
  per_album as (
    select distinct on (c.album_id) c.*
    from cand c
    order by c.album_id, c.sim desc nulls last, c.created_at desc
  ),
  -- Rank each photographer's albums: 1 = their best.
  ranked as (
    select pa.*,
           row_number() over (partition by pa.provider_id order by pa.sim desc nulls last, pa.created_at desc) as per_provider
    from per_album pa
  ),
  -- Overall order. With taste: similarity minus 0.05 per extra album from the
  -- same photographer. Without taste (new users): each photographer's newest
  -- album first, photographers interleaved.
  scored as (
    select rk.*,
           row_number() over (
             order by case when rk.sim is null then -rk.per_provider::real
                           else rk.sim - 0.05 * (rk.per_provider - 1) end desc,
                      rk.created_at desc) as rank_pos,
           count(*) over () as total
    from ranked rk
  ),
  -- Keep the exploration slots free, even when there are only a few photos.
  main as (
    select s.*, s.rank_pos::numeric as pos, false as explore
    from scored s
    where s.rank_pos <= greatest(least(v_limit, s.total) - v_explore, 0)
  ),
  -- Exploration: random picks from lower in the ranking (less like their taste).
  explore as (
    select r.*, ((row_number() over () - 1) * 6 + 3.5)::numeric as pos, true as explore
    from (
      select s.* from scored s
      where s.rank_pos > greatest(least(v_limit, s.total) - v_explore, 0)
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
