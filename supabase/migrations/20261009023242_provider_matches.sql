-- "% match" for photographers: how close each photographer's portfolio is to the
-- signed-in user's taste (the same taste vector discover_feed uses: average of
-- liked/saved photos, nudged 30% away from passes).
--
-- The percentage is relative: the photographer whose portfolio is closest gets
-- ~98%, the furthest ~60%, the rest spread in between. Raw cosine similarities
-- between SigLIP image embeddings sit in a narrow band, so absolute numbers
-- would all read as ~80% and mean nothing.
--
-- Returns no rows for signed-out users and anyone with fewer than 3 likes.
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
  v_liked integer := 0;
  v_pos extensions.vector;
  v_neg extensions.vector;
  v_taste extensions.vector;
begin
  if v_uid is null then
    return;
  end if;

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

  if v_liked < 3 then
    return;
  end if;
  v_taste := v_pos;
  if v_neg is not null then
    v_taste := v_pos - (v_neg * array_fill(0.3::real, array[vector_dims(v_neg)])::extensions.vector);
  end if;

  return query
  with sims as (
    select pr.id, avg(1 - (e.embedding <=> v_taste)) as sim
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
