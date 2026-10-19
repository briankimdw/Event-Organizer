-- Test for discover_vendors() (migration 20261013000000_discover_all_verticals): the
-- vendor-level Discover feed for verticals without posts. Needs the earlier migrations
-- (incl. photo embeddings and all_verticals) + seed.sql.
-- Runs as one transaction that ALWAYS rolls back (it ends by raising an exception
-- carrying the results). Run it in the SQL editor and read the error message:
-- every line should end in "ok".

do $$
declare
  u_viewer uuid := gen_random_uuid();
  u_owner uuid := gen_random_uuid();   -- the viewer's own catering listing
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid(); u4 uuid := gen_random_uuid();
  u5 uuid := gen_random_uuid(); u6 uuid := gen_random_uuid(); u7 uuid := gen_random_uuid(); u8 uuid := gen_random_uuid();
  v_cat uuid := (select id from public.service_categories where slug = 'catering' and kind = 'vertical');
  v_mus uuid := (select id from public.service_categories where slug = 'music' and kind = 'vertical');
  v_pho uuid := (select id from public.service_categories where slug = 'photography' and kind = 'vertical');
  taco uuid; taco2 uuid; seoul uuid; plated uuid; mine uuid; dj uuid; band uuid; photog uuid; photog2 uuid; photog3 uuid;
  u9 uuid := gen_random_uuid();
  v_album3 uuid;
  v_score real;
  v_album uuid;
  n integer;
  m integer;
  t text;
  ok boolean;
  r text := E'\n';
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role)
  select u, 'dv-' || u || '@example.com', '{}', 'authenticated', 'authenticated'
  from unnest(array[u_viewer, u_owner, u1, u2, u3, u4, u5, u6, u7, u8, u9]) u;

  -- Caterers: two taco-style (Mexican, buffet), one Korean food truck, one plated French.
  insert into public.providers (profile_id, vertical_id, display_name, slug, status, attributes, rating_avg, rating_count, created_at)
  values (u1, v_cat, 'Taco Fiesta', 'dv-taco-fiesta', 'active', '{"cuisines": ["Mexican", "Californian"]}', 4.5, 2, now() - interval '200 days')
  returning id into taco;
  insert into public.providers (profile_id, vertical_id, display_name, slug, status, attributes, rating_avg, rating_count, created_at)
  values (u2, v_cat, 'Taqueria Dos', 'dv-taqueria-dos', 'active', '{"cuisines": ["Mexican"]}', 4.0, 1, now() - interval '200 days')
  returning id into taco2;
  insert into public.providers (profile_id, vertical_id, display_name, slug, status, attributes, rating_avg, rating_count, created_at)
  values (u3, v_cat, 'Seoul Truck', 'dv-seoul-truck', 'active', '{"cuisines": ["Korean"]}', 5.0, 9, now() - interval '200 days')
  returning id into seoul;
  insert into public.providers (profile_id, vertical_id, display_name, slug, status, attributes, rating_avg, rating_count, created_at)
  values (u4, v_cat, 'Maison Plated', 'dv-maison-plated', 'active', '{"cuisines": ["French"]}', 4.9, 5, now() - interval '200 days')
  returning id into plated;
  insert into public.providers (profile_id, vertical_id, display_name, slug, status, attributes)
  values (u_owner, v_cat, 'My Own Catering', 'dv-my-own', 'active', '{}') returning id into mine;
  -- Music: a DJ and a band. Photography: one with a post (and embeddings), one without.
  insert into public.providers (profile_id, vertical_id, display_name, slug, status, attributes)
  values (u5, v_mus, 'DJ Test', 'dv-dj-test', 'active', '{"acts": ["DJ"], "genres": ["House"]}') returning id into dj;
  insert into public.providers (profile_id, vertical_id, display_name, slug, status, attributes)
  values (u6, v_mus, 'Band Test', 'dv-band-test', 'active', '{"acts": ["Band"], "genres": ["Jazz"]}') returning id into band;
  insert into public.providers (profile_id, vertical_id, display_name, slug, status)
  values (u7, v_pho, 'Posting Photog', 'dv-posting-photog', 'active') returning id into photog;
  insert into public.providers (profile_id, vertical_id, display_name, slug, status)
  values (u8, v_pho, 'Quiet Photog', 'dv-quiet-photog', 'active') returning id into photog2;
  insert into public.providers (profile_id, vertical_id, display_name, slug, status)
  values (u9, v_pho, 'Second Poster', 'dv-second-poster', 'active') returning id into photog3;

  insert into public.provider_services (provider_id, category_id)
  select p, (select id from public.service_categories where slug = s)
  from (values (taco, 'buffet'), (taco, 'food-truck'), (taco2, 'buffet'), (taco2, 'food-truck'), (seoul, 'food-truck'),
               (plated, 'plated-dinner'), (mine, 'buffet'), (dj, 'dj'), (band, 'live-band'),
               (photog, 'wedding'), (photog2, 'wedding'), (photog3, 'portrait')) x(p, s);
  insert into public.packages (provider_id, category_id, name, price_type, price_cents, attributes)
  values (taco, (select id from public.service_categories where slug = 'buffet'), 'Buffet', 'per_person', 4000, '{}'),
         (taco2, (select id from public.service_categories where slug = 'buffet'), 'Buffet', 'per_person', 4500, '{}'),
         (seoul, (select id from public.service_categories where slug = 'food-truck'), 'Truck', 'per_person', 3000, '{}'),
         (plated, (select id from public.service_categories where slug = 'plated-dinner'), 'Plated', 'per_person', 15000, '{}');

  insert into public.albums (provider_id, title, status) values (photog, 'A wedding', 'published') returning id into v_album;
  insert into public.photos (id, album_id, owner_id, display_path, auto_tags)
  select gen_random_uuid(), v_album, u7, 'x/' || k || '.jpg', array['moody'] from generate_series(1, 3) k;
  insert into public.photo_embeddings (photo_id, embedding, model)
  select p.id, (select array_agg(random()::real - 0.5) from generate_series(1, 768) where p.id is not null)::extensions.vector, 'test'
  from public.photos p where p.album_id = v_album;
  insert into public.albums (provider_id, title, status) values (photog3, 'Portraits', 'published') returning id into v_album3;
  insert into public.photos (id, album_id, owner_id, display_path) select gen_random_uuid(), v_album3, u9, 'y/' || k || '.jpg' from generate_series(1, 2) k;
  insert into public.photo_embeddings (photo_id, embedding, model)
  select p.id, (select array_agg(random()::real - 0.5) from generate_series(1, 768) where p.id is not null)::extensions.vector, 'test'
  from public.photos p where p.album_id = v_album3;

  -- 1. Signed out --------------------------------------------------------------------
  perform set_config('request.jwt.claims', '', true);
  select count(*), count(*) filter (where d.provider_id in (taco, taco2, seoul, plated, mine)) into n, m
  from public.discover_vendors(20, 'catering') d;
  r := r || format('01 signed out: every active caterer (%s rows, %s of the 5): %s', n, m, case when m = 5 and n >= 5 then 'ok' else 'FAIL' end) || E'\n';

  select count(*) into n from public.discover_vendors(20, 'catering') d where d.vertical <> 'catering';
  r := r || format('02 p_vertical keeps one vertical: %s', case when n = 0 then 'ok' else 'FAIL' end) || E'\n';

  select count(*), count(*) filter (where d.provider_id in (taco, taco2, mine)) into n, m from public.discover_vendors(20, 'catering', 'buffet') d;
  r := r || format('03 p_service keeps vendors offering it (%s rows): %s', n, case when n = m and m = 3 then 'ok' else 'FAIL' end) || E'\n';

  select count(*) filter (where d.provider_id = photog), count(*) filter (where d.provider_id = photog2) into n, m
  from public.discover_vendors(20, 'photography', null, true) d;
  r := r || format('04 p_without_posts drops vendors with posts: %s', case when n = 0 and m = 1 then 'ok' else 'FAIL' end) || E'\n';
  select bool_and(d.has_posts) into ok from public.discover_vendors(20, 'photography') d where d.provider_id = photog;
  r := r || format('05 has_posts is reported: %s', case when ok then 'ok' else 'FAIL' end) || E'\n';

  select count(*) into n from public.discover_vendors(3, 'catering') d;
  r := r || format('06 p_limit respected (%s): %s', n, case when n = 3 then 'ok' else 'FAIL' end) || E'\n';

  select count(*) filter (where d.exploration), count(*) filter (where d.exploration and d.reason = 'Something new') into n, m
  from public.discover_vendors(20, 'catering') d;
  r := r || format('07 ~15%% exploration with 5 candidates (%s pick): %s', n, case when n = 1 and m = 1 then 'ok' else 'FAIL' end) || E'\n';

  select count(distinct d.vertical) into n from (select * from public.discover_vendors(4, null, null, true)) d;
  r := r || format('08 every vertical, verticals alternate (%s verticals in the first 4): %s', n, case when n >= 2 then 'ok' else 'FAIL' end) || E'\n';

  -- 2. Signed in -------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', u_owner, 'role', 'authenticated')::text, true);
  select count(*) into n from public.discover_vendors(20, 'catering') d where d.provider_id = mine;
  r := r || format('09 own listing left out: %s', case when n = 0 then 'ok' else 'FAIL' end) || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub', u_viewer, 'role', 'authenticated')::text, true);
  -- Like Taco Fiesta as a vendor card: it disappears, and the similar Taqueria Dos jumps the better-rated vendors.
  insert into public.swipes (user_id, provider_id, action) values (u_viewer, taco, 'like');
  select count(*) into n from public.discover_vendors(20, 'catering') d where d.provider_id = taco;
  r := r || format('10 a vendor swiped as a card is left out: %s', case when n = 0 then 'ok' else 'FAIL' end) || E'\n';
  select d.provider_id, d.reason into taco2, t from public.discover_vendors(20, 'catering') d where not d.exploration order by d.score desc limit 1;
  r := r || format('11 similar vendor ranks first after a like ("%s"): %s', t,
        case when t = 'Like Taco Fiesta, which you liked' then 'ok' else 'FAIL' end) || E'\n';

  -- Pass Taqueria Dos: left out too.
  insert into public.swipes (user_id, provider_id, action) values (u_viewer, taco2, 'pass');
  select count(*) into n from public.discover_vendors(20, 'catering') d where d.provider_id = taco2;
  r := r || format('12 a passed vendor is left out: %s', case when n = 0 then 'ok' else 'FAIL' end) || E'\n';

  -- "Not into this": hide a vendor, and a trait.
  insert into public.taste_corrections (user_id, kind, value) values (u_viewer, 'provider', plated::text), (u_viewer, 'tag', 'korean');
  select count(*) filter (where d.provider_id = plated), count(*) filter (where d.provider_id = seoul) into n, m
  from public.discover_vendors(20, 'catering') d;
  r := r || format('13 hidden vendor and hidden trait (korean) left out: %s', case when n = 0 and m = 0 then 'ok' else 'FAIL' end) || E'\n';

  -- Photo likes count as liking the vendor; embeddings path runs.
  insert into public.swipes (user_id, photo_id, album_id, provider_id, action)
  select u_viewer, p.id, v_album, photog, 'like' from public.photos p where p.album_id = v_album limit 1;
  select count(*) into n from public.discover_vendors(20, 'photography') d;
  r := r || format('14 photo likes + embeddings path runs (%s rows): %s', n, case when n >= 2 then 'ok' else 'FAIL' end) || E'\n';
  select d.reason into t from public.discover_vendors(20, 'photography') d where d.provider_id = photog2;
  r := r || format('15 vendor like a photographer whose photo was liked ("%s"): %s', t,
        case when t = 'Like Posting Photog, which you liked' then 'ok' else 'FAIL' end) || E'\n';

  select d.score into v_score from public.discover_vendors(20, 'photography') d where d.provider_id = photog3;
  r := r || format('15b a vendor with analysed photos is scored with photo similarity too (score %s): %s', round(v_score::numeric, 3),
        case when v_score is not null then 'ok' else 'FAIL' end) || E'\n';

  -- Music works the same (a non-visual vertical with no posts at all).
  select count(*) into n from public.discover_vendors(20, 'music') d where d.provider_id in (dj, band);
  r := r || format('16 non-visual vertical (music) returns its vendors: %s', case when n = 2 then 'ok' else 'FAIL' end) || E'\n';

  -- Signed-out callers may run it.
  r := r || format('17 anon may execute: %s',
        case when has_function_privilege('anon', 'public.discover_vendors(integer, text, text, boolean)', 'execute') then 'ok' else 'FAIL' end) || E'\n';

  raise exception 'DISCOVER VENDORS TEST RESULTS (rolled back, nothing saved):%', r;
end;
$$;
