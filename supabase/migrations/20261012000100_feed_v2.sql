-- Discover feed v2: a taste model that learns faster and handles several tastes.
--
-- Measured offline on 632 labeled CC photos in 19 style/content groups with simulated
-- swipers (services/ml/eval, report in services/ml/eval/REPORT.md). What changed vs v1:
--
--   1. Centring. SigLIP vectors share a large common part (any two photos score
--      ~0.5-0.75 cosine), so similarities were bunched together. Every similarity now
--      uses (embedding - catalog average), which spreads them out.
--   2. Learns from the first like (v1 waited for 3 likes and showed the newest photos
--      until then). With passes but no like yet, it steers away from what was passed.
--   3. Recent swipes count more (weight halves every 40 swipes); a save counts double.
--   4. Up to 3 separate tastes: likes are grouped (a like joins the closest group when
--      its centred cosine is >= 0.35), and a photo scores by its best-matching group,
--      so liking moody portraits AND plated food no longer averages into neither.
--      Each taste is pushed away from the (weighted) average of passes (gamma 0.5).
--      A taste whose nearby passes outweigh its likes 2:1 is dropped (taste changes).
--   5. With a category filter, the taste comes from that category's swipes once
--      there is a like in it (a caterer's food likes don't steer the photo feed).
--   6. First cards for someone with no swipes: instead of just the newest photos, a
--      spread of different looks (farthest-point picks among the 200 newest), so the
--      first likes come sooner.
--   7. Same-photographer penalty 0.03 (on the wider centred scale).
--
-- Same signatures and columns as before: discover_feed(p_limit, p_category) and
-- provider_matches(). Python mirror: services/ml/eval/feeds.py (FeedV2).

-- v * s for a pgvector (pgvector has no scalar multiply).
create or replace function public.vec_scale(v extensions.vector, s double precision)
returns extensions.vector
language sql
immutable
parallel safe
set search_path = ''
as $$
  select v operator(extensions.*) (array_fill(s::real, array[extensions.vector_dims(v)]))::extensions.vector;
$$;

-- Does photo p belong to category slug c (the album's service or the provider's vertical)?
create or replace function public.photo_in_category(p_photo_id uuid, p_category text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_category is null or exists (
    select 1
    from public.photos p
    join public.albums a on a.id = p.album_id
    join public.providers pr on pr.id = a.provider_id
    where p.id = p_photo_id
      and (exists (select 1 from public.service_categories c where c.id = a.category_id and c.slug = p_category)
           or exists (select 1 from public.service_categories v where v.id = pr.vertical_id and v.slug = p_category)));
$$;

-- A user's taste: the catalog average (mu), up to 3 taste vectors in centred space,
-- and how many likes they came from. tastes is null when there are no swipes at all.
-- Internal: only the security-definer feed functions call it.
create or replace function public.taste_profile(p_uid uuid, p_category text default null)
returns table (mu extensions.vector, tastes extensions.vector[], n_likes integer)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  c_half_life constant double precision := 40;   -- swipes
  c_save constant double precision := 2;         -- a save counts as two likes
  c_join constant double precision := 0.35;      -- centred cosine to join a taste group
  c_max_groups constant integer := 3;
  c_gamma constant double precision := 0.5;      -- push away from passes
  c_stale constant double precision := 2;        -- drop a taste whose nearby passes outweigh its likes 2:1
  v_mu extensions.vector;
  v_scoped boolean := false;
  r record;
  v_w double precision;
  v_sums extensions.vector[] := '{}';
  v_mass double precision[] := '{}';
  v_neg extensions.vector;
  v_negw double precision := 0;
  v_px extensions.vector[] := '{}';
  v_pw double precision[] := '{}';
  v_pmass double precision[];
  v_keep integer[] := '{}';
  v_likes integer := 0;
  v_best integer;
  v_best_sim double precision;
  v_sim double precision;
  v_out extensions.vector[] := '{}';
  k integer;
  i integer;
begin
  select avg(e.embedding) into v_mu from public.photo_embeddings e;
  if p_uid is null or v_mu is null then
    return query select v_mu, null::extensions.vector[], 0;
    return;
  end if;

  if p_category is not null then
    select exists (
      select 1 from public.swipes sw
      join public.photo_embeddings e on e.photo_id = sw.photo_id
      where sw.user_id = p_uid and sw.action in ('like', 'save')
        and public.photo_in_category(sw.photo_id, p_category)
    ) into v_scoped;
  end if;

  for r in
    select e.embedding operator(extensions.-) v_mu as x, s.action,
           (row_number() over (order by s.created_at desc, s.id desc) - 1)::double precision as rnk
    from (
      select sw.id, sw.photo_id, sw.action, sw.created_at
      from public.swipes sw
      join public.photo_embeddings e2 on e2.photo_id = sw.photo_id
      where sw.user_id = p_uid
        and (not v_scoped or public.photo_in_category(sw.photo_id, p_category))
      order by sw.created_at desc, sw.id desc
      limit 300
    ) s
    join public.photo_embeddings e on e.photo_id = s.photo_id
    order by rnk
  loop
    v_w := power(0.5, r.rnk / c_half_life) * (case when r.action = 'save' then c_save else 1 end);
    if r.action = 'pass' then
      v_neg := case when v_neg is null then public.vec_scale(r.x, v_w) else v_neg + public.vec_scale(r.x, v_w) end;
      v_negw := v_negw + v_w;
      v_px := v_px || r.x;
      v_pw := v_pw || v_w;
      continue;
    end if;
    v_likes := v_likes + 1;
    -- Leader grouping, newest like first.
    v_best := null;
    v_best_sim := -2;
    for k in 1 .. coalesce(array_length(v_sums, 1), 0) loop
      v_sim := 1 - (r.x <=> v_sums[k]);
      if v_sim > v_best_sim then
        v_best_sim := v_sim;
        v_best := k;
      end if;
    end loop;
    if v_best is not null and (v_best_sim >= c_join or array_length(v_sums, 1) >= c_max_groups) then
      v_sums[v_best] := v_sums[v_best] + public.vec_scale(r.x, v_w);
      v_mass[v_best] := v_mass[v_best] + v_w;
    else
      v_sums := v_sums || public.vec_scale(r.x, v_w);
      v_mass := v_mass || v_w;
    end if;
  end loop;

  if v_neg is not null then
    v_neg := public.vec_scale(v_neg, 1 / v_negw);
  end if;

  -- Stale tastes: give each pass to its closest taste (if close enough); a taste whose
  -- passes outweigh its likes 2:1 is dropped (the user has moved on from it).
  if v_likes > 0 then
    v_pmass := array_fill(0::double precision, array[array_length(v_sums, 1)]);
    for i in 1 .. coalesce(array_length(v_px, 1), 0) loop
      v_best := null;
      v_best_sim := -2;
      for k in 1 .. array_length(v_sums, 1) loop
        v_sim := 1 - (v_px[i] <=> v_sums[k]);
        if v_sim > v_best_sim then
          v_best_sim := v_sim;
          v_best := k;
        end if;
      end loop;
      if v_best_sim >= c_join then
        v_pmass[v_best] := v_pmass[v_best] + v_pw[i];
      end if;
    end loop;
    for k in 1 .. array_length(v_sums, 1) loop
      if v_pmass[k] <= c_stale * v_mass[k] then
        v_keep := v_keep || k;
      end if;
    end loop;
    if coalesce(array_length(v_keep, 1), 0) = 0 then
      v_likes := 0;  -- every taste went stale: behave like "passes only"
    end if;
  end if;
  if v_likes = 0 then
    -- Only passes so far: anything unlike them.
    if v_neg is not null then
      v_out := array[public.vec_scale(v_neg, -1)];
    else
      v_out := null;
    end if;
  else
    foreach k in array v_keep loop
      v_out := v_out || (case when v_neg is null then public.vec_scale(v_sums[k], 1 / v_mass[k])
                              else public.vec_scale(v_sums[k], 1 / v_mass[k]) - public.vec_scale(v_neg, c_gamma) end);
    end loop;
  end if;
  return query select v_mu, v_out, v_likes;
end;
$$;

revoke execute on function public.taste_profile(uuid, text) from public, anon, authenticated;
revoke execute on function public.photo_in_category(uuid, text) from public, anon, authenticated;

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
  c_penalty constant double precision := 0.03;   -- per extra album from the same photographer
  c_pool constant integer := 200;                 -- cold start: spread picks among the newest 200
  v_uid uuid := (select auth.uid());
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_explore integer;
  v_mu extensions.vector;
  v_tastes extensions.vector[];
  v_likes integer := 0;
  v_fav_tags text[] := '{}';
  v_avoid_tags text[] := '{}';
  v_avoid_providers uuid[] := '{}';
  v_ids uuid[];
  v_sims real[];
  v_x extensions.vector[];
  v_n integer;
  v_main integer;
  v_pool integer;
  v_order integer[];
  v_maxsim double precision[];
  v_taken boolean[];
  v_pick integer;
  v_low double precision;
  v_s double precision;
  i integer;
  j integer;
begin
  v_explore := case when v_limit >= 4 then greatest(1, round(v_limit * 0.15)::integer) else 0 end;

  select t.mu, t.tastes, t.n_likes into v_mu, v_tastes, v_likes from public.taste_profile(v_uid, p_category) t;

  if v_uid is not null then
    if v_likes > 0 then
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

  -- Every candidate album's best photo, in rank order.
  with cand as (
    select p.id as photo_id, p.album_id, a.provider_id, p.created_at, e.embedding,
           case when v_tastes is null then null
                else (select max(1 - ((e.embedding operator(extensions.-) v_mu) <=> t)) from unnest(v_tastes) t)
           end as sim
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
  per_album as (
    select distinct on (c.album_id) c.*
    from cand c
    order by c.album_id, c.sim desc nulls last, c.created_at desc
  ),
  ranked as (
    select pa.*,
           row_number() over (partition by pa.provider_id order by pa.sim desc nulls last, pa.created_at desc) as per_provider
    from per_album pa
  ),
  scored as (
    select rk.*,
           row_number() over (
             order by case when rk.sim is null then -rk.per_provider::double precision
                           else rk.sim - c_penalty * (rk.per_provider - 1) end desc,
                      rk.created_at desc) as rank_pos
    from ranked rk
  )
  select array_agg(s.photo_id order by s.rank_pos),
         array_agg(s.sim::real order by s.rank_pos),
         (array_agg(s.embedding operator(extensions.-) v_mu order by s.rank_pos)
            filter (where s.rank_pos <= c_pool and v_tastes is null))
    into v_ids, v_sims, v_x
  from scored s;

  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n = 0 then
    return;
  end if;
  v_main := greatest(least(v_limit, v_n) - v_explore, 0);

  -- No swipes yet: farthest-point picks so the first cards cover many looks.
  if v_tastes is null and v_n > 1 then
    v_pool := array_length(v_x, 1);
    v_order := array[1];
    v_taken := array_fill(false, array[v_pool]);
    v_taken[1] := true;
    v_maxsim := array_fill(-2::double precision, array[v_pool]);
    v_pick := 1;
    while array_length(v_order, 1) < least(v_pool, v_limit) loop
      v_low := 9;
      j := null;
      for i in 1 .. v_pool loop
        if not v_taken[i] then
          v_s := 1 - (v_x[i] <=> v_x[v_pick]);
          if v_s > v_maxsim[i] then
            v_maxsim[i] := v_s;
          end if;
          if v_maxsim[i] < v_low then
            v_low := v_maxsim[i];
            j := i;
          end if;
        end if;
      end loop;
      exit when j is null;
      v_order := v_order || j;
      v_taken[j] := true;
      v_pick := j;
    end loop;
    v_ids := array(select v_ids[o] from unnest(v_order) with ordinality u(o, n) order by n)
             || array(select v_ids[i] from generate_series(1, v_n) i where i > v_pool or not v_taken[i] order by i);
  end if;

  return query
  with feed as (
    select x.id, x.n::numeric as pos, false as explore
    from unnest(v_ids[1:v_main]) with ordinality x(id, n)
    union all
    select r.id, ((row_number() over () - 1) * 6 + 3.5)::numeric, true
    from (
      select y.id from unnest(v_ids[v_main + 1:v_n]) y(id)
      order by random()
      limit v_explore
    ) r
  )
  select p.id, p.album_id, a.provider_id, p.display_path, a.title, p.auto_tags,
         coalesce((select v_sims[k] from generate_series(1, v_n) k where v_ids[k] = p.id limit 1), 0)::real,
         case
           when f.explore then 'Something new' || coalesce(': ' || p.auto_tags[1], '')
           when v_likes = 0 then 'New on photomatch'
           else coalesce(
             'Because you liked ' || (select t from unnest(p.auto_tags) t where t = any (v_fav_tags) limit 1) || ' shots',
             'Similar to photos you liked')
         end,
         f.explore
  from feed f
  join public.photos p on p.id = f.id
  join public.albums a on a.id = p.album_id
  order by f.pos;
end;
$$;

grant execute on function public.discover_feed(integer, text) to anon, authenticated;

-- "% match": same taste as the feed. Each photographer's score is the average over
-- their published photos of the best match to any of the user's tastes, scaled to
-- 60..98 across photographers. Still needs 3 likes (the app says "after a few likes").
create or replace function public.provider_matches()
returns table (provider_id uuid, match_pct integer)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid());
  v_mu extensions.vector;
  v_tastes extensions.vector[];
  v_likes integer := 0;
begin
  if v_uid is null then
    return;
  end if;
  select t.mu, t.tastes, t.n_likes into v_mu, v_tastes, v_likes from public.taste_profile(v_uid, null) t;
  if v_likes < 3 then
    return;
  end if;

  return query
  with sims as (
    select pr.id,
           avg((select max(1 - ((e.embedding operator(extensions.-) v_mu) <=> t)) from unnest(v_tastes) t)) as sim
    from public.providers pr
    join public.albums a on a.provider_id = pr.id and a.status = 'published'
    join public.photos p on p.album_id = a.id
    join public.photo_embeddings e on e.photo_id = p.id
    where pr.status = 'active' and pr.profile_id <> v_uid
    group by pr.id
  ),
  bounds as (select min(sim) as lo, max(sim) as hi from sims)
  select s.id,
         (case when b.hi - b.lo < 1e-6 then 90
               else round(60 + 38 * (s.sim - b.lo) / (b.hi - b.lo)) end)::integer
  from sims s cross join bounds b
  order by 2 desc;
end;
$$;

revoke execute on function public.provider_matches() from public, anon;
grant execute on function public.provider_matches() to authenticated;
