-- Discover for every vertical: a vendor-level feed.
--
-- discover_feed() ranks portfolio photos, so verticals nobody has posted in yet (and
-- non-visual ones: DJs, planners, officiants, event staff...) had nothing to swipe.
-- The app now also shows *vendor cards* (name, rating, price, key attributes) for vendors
-- without posts, and logs a swipe on one with swipes.provider_id set and photo_id null.
-- discover_vendors() ranks those vendors. The app works without this migration (it ranks
-- vendors in the browser with the same formula, api/discover.js rankVendors()); applying
-- it moves the ranking to the database, where it also sees photo embeddings.
--
--   discover_vendors(p_limit, p_vertical, p_service, p_without_posts)
--     p_vertical       a vertical slug ('catering'), or null for every vertical
--     p_service        a service slug ('buffet'): only vendors offering it
--     p_without_posts  only vendors with no published posts (the ones the photo feed can't show)
--   Leaves out: the user's own listings, vendors they already swiped as a vendor card,
--   vendors they hid ("Not into this", taste_corrections kind 'provider') and vendors
--   whose traits match a hidden tag (taste_corrections kind 'tag', e.g. 'italian').
--
--   score = 0.45 rating (Bayesian: shrunk toward 4.2 with few reviews)
--         + 0.15 recency (exp(-age / 90 days))
--         + 0.40 (similarity to the closest liked vendor - 0.5 x similarity to the closest passed one)
--         + 0.03 Pro
--   similarity (same vertical only) = 0.45 shared services (Jaccard) + 0.35 shared traits
--   (Jaccard over attribute values: cuisines, genres, styles... and fleet / inventory names)
--   + 0.2 price closeness (same price type; 4x apart = 0). When both vendors have analysed
--   photos it is averaged with their centred SigLIP similarity.
--   Liked = vendors liked or saved as a card, or whose photos were liked.
--   With p_vertical null, each further vendor from the same vertical loses 0.06 (verticals alternate).
--   ~15% exploration: random picks from below the main picks, reason 'Something new'.
--
-- Same column style as discover_feed: (provider_id, vertical, score, reason, exploration, has_posts).
-- Safe to run more than once.

-- Lower-case, hyphens/underscores as spaces: 'gluten-free' and 'Gluten free' compare equal.
create or replace function public.discover_norm(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(btrim(lower(regexp_replace(p, '[-_]+', ' ', 'g'))), '');
$$;

-- A vendor's traits from its attributes: every string in a top-level array (cuisines,
-- genres, styles...), plain short string values of select fields, and the names in
-- fleet / inventory lists. Normalised with discover_norm.
create or replace function public.vendor_traits(p_attrs jsonb)
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(array_agg(distinct t) filter (where t is not null), '{}')
  from (
    select public.discover_norm(x.value #>> '{}') as t
    from jsonb_each(coalesce(p_attrs, '{}'::jsonb)) kv
    cross join lateral jsonb_array_elements(case when jsonb_typeof(kv.value) = 'array' then kv.value else '[]'::jsonb end) x
    where jsonb_typeof(x.value) = 'string' and kv.key not in ('gear', 'languages', 'products', 'certifications')
    union all
    select public.discover_norm(coalesce(x.value ->> 'vehicle', x.value ->> 'item'))
    from jsonb_each(coalesce(p_attrs, '{}'::jsonb)) kv
    cross join lateral jsonb_array_elements(case when jsonb_typeof(kv.value) = 'array' then kv.value else '[]'::jsonb end) x
    where kv.key in ('fleet', 'inventory') and jsonb_typeof(x.value) = 'object'
    union all
    select public.discover_norm(kv.value #>> '{}')
    from jsonb_each(coalesce(p_attrs, '{}'::jsonb)) kv
    where kv.key in ('setting', 'style', 'service_style') and jsonb_typeof(kv.value) = 'string'
  ) s;
$$;

-- |a ∩ b| / |a ∪ b| over distinct values (0 when both are empty).
create or replace function public.discover_jaccard(a text[], b text[])
returns real
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when coalesce(cardinality(a), 0) + coalesce(cardinality(b), 0) = 0 then 0::real
    else (select count(*) from (select unnest(a) intersect select unnest(b)) i)::real
         / greatest(1, (select count(*) from (select unnest(a) union select unnest(b)) u))::real
  end;
$$;

create or replace function public.discover_vendors(
  p_limit integer default 20,
  p_vertical text default null,
  p_service text default null,
  p_without_posts boolean default false
)
returns table (
  provider_id uuid,
  vertical text,
  score real,
  reason text,
  exploration boolean,
  has_posts boolean
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid());
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 100));
  v_avoid_tags text[] := '{}';
  v_avoid_providers uuid[] := '{}';
  v_liked uuid[] := '{}';
  v_passed uuid[] := '{}';
  v_mu extensions.vector;
begin
  if v_uid is not null then
    select coalesce(array_agg(public.discover_norm(value)) filter (where kind = 'tag'), '{}'),
           coalesce(array_agg(case when value ~* '^[0-9a-f-]{36}$' then value::uuid end)
                    filter (where kind = 'provider' and value ~* '^[0-9a-f-]{36}$'), '{}')
      into v_avoid_tags, v_avoid_providers
    from public.taste_corrections where user_id = v_uid;

    select coalesce(array_agg(distinct sw.provider_id) filter (where sw.action in ('like', 'save')), '{}'),
           coalesce(array_agg(distinct sw.provider_id) filter (where sw.action = 'pass' and sw.photo_id is null), '{}')
      into v_liked, v_passed
    from (
      select s.provider_id, s.action, s.photo_id from public.swipes s
      where s.user_id = v_uid and s.provider_id is not null
      order by s.created_at desc
      limit 500
    ) sw;
    -- A vendor liked and later passed counts as passed only.
    v_liked := array(select unnest(v_liked) except select unnest(v_passed));
  end if;

  if cardinality(v_liked) > 0 then
    select avg(e.embedding) into v_mu from public.photo_embeddings e;
  end if;

  return query
  with feat as (
    -- Every active vendor in scope (and every liked / passed one, for similarity).
    select pr.id, pr.profile_id, v.slug::text as vertical, pr.display_name, pr.city, pr.rating_avg, pr.rating_count,
           pr.is_pro, pr.created_at, pr.attributes,
           exists (select 1 from public.albums a where a.provider_id = pr.id and a.status = 'published') as has_posts,
           array(select c.slug::text from public.provider_services ps join public.service_categories c on c.id = ps.category_id
                 where ps.provider_id = pr.id) as services,
           public.vendor_traits(pr.attributes)
             || array(select public.discover_norm(c.name) from public.provider_services ps
                      join public.service_categories c on c.id = ps.category_id where ps.provider_id = pr.id) as traits,
           pk.price_cents, pk.price_type::text as price_type,
           case when v_mu is null then null else (
             select avg(e.embedding) from public.albums a
             join public.photos p on p.album_id = a.id
             join public.photo_embeddings e on e.photo_id = p.id
             where a.provider_id = pr.id and a.status = 'published') end as emb
    from public.providers pr
    join public.service_categories v on v.id = pr.vertical_id
    left join lateral (
      select k.price_cents, k.price_type from public.packages k
      where k.provider_id = pr.id and k.is_active and k.price_cents is not null and k.price_type <> 'quote'
      order by k.price_cents limit 1
    ) pk on true
    where pr.status = 'active'
      and (p_vertical is null or v.slug::text = p_vertical or pr.id = any (v_liked) or pr.id = any (v_passed))
  ),
  cand as (
    select f.* from feat f
    where (p_vertical is null or f.vertical = p_vertical)
      and (p_service is null or p_service = any (f.services))
      and (not p_without_posts or not f.has_posts)
      and (v_uid is null or f.profile_id <> v_uid)
      and not (f.id = any (v_avoid_providers))
      and not (f.traits && v_avoid_tags)
      and (v_uid is null or not exists (
        select 1 from public.swipes sw where sw.user_id = v_uid and sw.provider_id = f.id and sw.photo_id is null))
  ),
  -- Similarity of each candidate to each liked / passed vendor in the same vertical.
  pair as (
    select c.id as cid, o.id as oid, o.display_name as oname, (o.id = any (v_liked)) as liked,
           (0.45 * public.discover_jaccard(c.services, o.services)
            + 0.35 * public.discover_jaccard(c.traits, o.traits)
            + 0.2 * case when c.price_cents > 0 and o.price_cents > 0 and c.price_type = o.price_type
                         then greatest(0, 1 - abs(ln(c.price_cents::double precision / o.price_cents)) / ln(4))
                         else 0.5 end)::double precision as attr_sim,
           case when c.emb is null or o.emb is null or v_mu is null then null
                else greatest(0, 1 - ((c.emb operator(extensions.-) v_mu) <=> (o.emb operator(extensions.-) v_mu))) end as emb_sim
    from cand c
    join feat o on o.vertical = c.vertical and o.id <> c.id and (o.id = any (v_liked) or o.id = any (v_passed))
  ),
  sims as (
    select p.cid,
           max(case when p.liked then sim end) as pos,
           max(case when not p.liked then sim end) as neg,
           (array_agg(p.oname order by sim desc) filter (where p.liked))[1] as best_name
    from (select pr.*, case when pr.emb_sim is null then pr.attr_sim else (pr.attr_sim + pr.emb_sim) / 2 end as sim from pair pr) p
    group by p.cid
  ),
  scored as (
    select c.id, c.vertical, c.has_posts, c.city, c.rating_avg, c.rating_count, c.created_at, s.best_name,
           coalesce(s.pos, 0) as like_sim,
           (0.45 * ((coalesce(c.rating_avg, 0) * c.rating_count + 4.2 * 3) / (c.rating_count + 3) / 5)
            + 0.15 * exp(-greatest(0, extract(epoch from (now() - c.created_at)) / 86400) / 90)
            + 0.4 * (coalesce(s.pos, 0) - 0.5 * coalesce(s.neg, 0))
            + case when c.is_pro then 0.03 else 0 end)::double precision as base
    from cand c
    left join sims s on s.cid = c.id
  ),
  ranked as (
    select sc.*,
           sc.base - case when p_vertical is null then 0.06 * (row_number() over (partition by sc.vertical order by sc.base desc) - 1) else 0 end as adj
    from scored sc
  ),
  ordered as (
    select r.*, row_number() over (order by r.adj desc, r.created_at desc) as rank_pos, count(*) over () as total
    from ranked r
  ),
  -- Exploration slots (as in discover_feed): kept free even when there are only a few vendors.
  params as (
    select case when least(v_limit, max(o.total)) >= 4 then greatest(1, round(least(v_limit, max(o.total)) * 0.15))::integer else 0 end as n_explore,
           least(v_limit, max(o.total)) as n_take
    from ordered o
  ),
  main as (
    select o.*, o.rank_pos::numeric as pos, false as explore
    from ordered o, params pa
    where o.rank_pos <= greatest(pa.n_take - pa.n_explore, 0)
  ),
  -- Random picks from lower in the ranking.
  explore as (
    select x.*, ((row_number() over () - 1) * 6 + 3.5)::numeric as pos, true as explore
    from (
      select o.* from ordered o, params pa
      where o.rank_pos > greatest(pa.n_take - pa.n_explore, 0)
      order by random()
      limit (select n_explore from params)
    ) x
  ),
  feed as (
    select * from main
    union all
    select * from explore
  )
  select f.id, f.vertical, f.adj::real,
         case
           when f.explore then 'Something new'
           when f.best_name is not null and f.like_sim >= 0.35 then 'Like ' || f.best_name || ', which you liked'
           when f.rating_avg >= 4.8 and f.rating_count >= 3 then 'Top rated by clients'
           when f.created_at > now() - interval '21 days' then 'New on photomatch'
           when f.city is not null then 'Based in ' || split_part(f.city, ',', 1)
           else null
         end,
         f.explore, f.has_posts
  from feed f
  order by f.pos
  limit v_limit;
end;
$$;

revoke execute on function public.discover_vendors(integer, text, text, boolean) from public;
grant execute on function public.discover_vendors(integer, text, text, boolean) to anon, authenticated;
