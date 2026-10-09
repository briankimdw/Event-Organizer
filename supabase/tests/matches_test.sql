-- Test for provider_matches() ("% match" per photographer). Always rolls back.
-- Needs the demo test photographers with analysed photos (SigLIP worker run).
-- Run in the SQL editor and read the error message: every line should end in "ok".
do $$
declare
  v uuid := (select id from public.profiles where username = 'jordanlee');
  n integer;
  top text;
  r text := E'\n';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.provider_matches();
  r := r || format('01 no matches before 3 likes (%s rows): %s', n, case when n = 0 then 'ok' else 'FAIL' end) || E'\n';
  reset role;

  -- Like 4 of Maya's photos.
  insert into public.swipes (user_id, photo_id, action)
  select v, p.id, 'like' from public.photos p
  join public.albums a on a.id = p.album_id join public.providers pr on pr.id = a.provider_id
  where pr.slug::text = 'maya-chen-photo' limit 4;

  set local role authenticated;
  select count(*) into n from public.provider_matches();
  r := r || format('02 every photographer gets a match (%s rows): %s', n, case when n >= 2 then 'ok' else 'FAIL' end) || E'\n';
  select pr.slug::text into top from public.provider_matches() m join public.providers pr on pr.id = m.provider_id order by m.match_pct desc limit 1;
  r := r || format('03 the liked photographer ranks first (%s): %s', top, case when top = 'maya-chen-photo' then 'ok' else 'FAIL' end) || E'\n';
  select count(*) into n from public.provider_matches() where match_pct not between 60 and 98;
  r := r || format('04 percentages stay in 60..98: %s', case when n = 0 then 'ok' else 'FAIL' end) || E'\n';

  set local role anon;
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  begin
    perform public.provider_matches();
    r := r || '05 signed-out visitors cannot call it: FAIL' || E'\n';
  exception when insufficient_privilege then
    r := r || '05 signed-out visitors cannot call it: ok' || E'\n';
  end;
  reset role;
  raise exception 'MATCHES TEST RESULTS (rolled back):%', r;
end $$;
