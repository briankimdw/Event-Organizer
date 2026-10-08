-- Discover feed test: two photographers, two clear "styles" (made-up embeddings),
-- a client who likes the warm style. Rolls back; leaves no data. Every line should end in "ok".
do $$
declare
  alice uuid := gen_random_uuid(); carol uuid := gen_random_uuid(); bob uuid := gen_random_uuid();
  pa uuid; pc uuid; v_cat uuid; v_album uuid; v_photo uuid;
  warm uuid[] := '{}'; bw uuid[] := '{}';
  i integer; n integer; r text := E'\n'; first_main record;
begin
  insert into auth.users (id, email, aud, role) values
    (alice, 'alice.feedtest@example.com', 'authenticated', 'authenticated'),
    (carol, 'carol.feedtest@example.com', 'authenticated', 'authenticated'),
    (bob,   'bob.feedtest@example.com',   'authenticated', 'authenticated');
  select id into v_cat from public.service_categories where slug = 'photography';
  insert into public.providers (profile_id, vertical_id, display_name, slug, status) values (alice, v_cat, 'Alice', 'alice-feedtest', 'active') returning id into pa;
  insert into public.providers (profile_id, vertical_id, display_name, slug, status) values (carol, v_cat, 'Carol', 'carol-feedtest', 'active') returning id into pc;

  for i in 1..12 loop
    insert into public.albums (provider_id, title, kind) values (case when i % 2 = 0 then pa else pc end, 'Album ' || i, 'album') returning id into v_album;
    insert into public.photos (album_id, owner_id, position, display_path, auto_tags)
    values (v_album, case when i % 2 = 0 then alice else carol end, 0, 'x/' || i || '.jpg', '{}')
    returning id into v_photo;
    perform public.ml_save_photo_analysis(v_photo,
      '[' || array_to_string(array(
        select case when (i <= 8 and d = 1) or (i > 8 and d = 2) then 1.0 else (random() * 0.15)::numeric(6,4) end
        from generate_series(1, 768) d), ',') || ']',
      case when i <= 8 then '{warm tones,golden hour}'::text[] else '{black and white,moody}'::text[] end,
      'test');
    if i <= 8 then warm := warm || v_photo; else bw := bw || v_photo; end if;
  end loop;
  select count(*) into n from public.ml_pending_photos(50);
  r := r || format('01 all 12 photos analysed, none pending (%s pending): %s', n, case when n = 0 then 'ok' else 'FAIL' end) || E'\n';

  set local role anon;
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  select count(*) into n from public.discover_feed(10);
  r := r || format('02 logged-out feed fills up (%s of 10): %s', n, case when n = 10 then 'ok' else 'FAIL' end) || E'\n';
  begin
    perform public.ml_pending_photos(5);
    r := r || '03 app cannot call ML worker functions: FAIL' || E'\n';
  exception when insufficient_privilege then
    r := r || '03 app cannot call ML worker functions: ok' || E'\n';
  end;
  reset role;

  insert into public.swipes (user_id, photo_id, action) values
    (bob, warm[1], 'like'), (bob, warm[2], 'like'), (bob, warm[3], 'save'), (bob, bw[1], 'pass');

  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into first_main from public.discover_feed(10) f where not f.exploration limit 1;
  r := r || format('04 top pick matches his taste (%s, score %s): %s', first_main.auto_tags[1], round(first_main.score::numeric, 2),
        case when 'warm tones' = any (first_main.auto_tags) then 'ok' else 'FAIL' end) || E'\n';
  r := r || format('05 reason: "%s": %s', first_main.reason, case when first_main.reason like 'Because you liked%' then 'ok' else 'FAIL' end) || E'\n';
  select count(*) into n from public.discover_feed(10) f where f.photo_id = any (warm[1:3] || bw[1:1]);
  r := r || format('06 already-swiped photos excluded: %s', case when n = 0 then 'ok' else 'FAIL' end) || E'\n';
  select count(distinct provider_id) into n from (select * from public.discover_feed(10) f where not f.exploration limit 4) x;
  r := r || format('07 photographers alternate in the top picks (%s of 2 in top 4): %s', n, case when n = 2 then 'ok' else 'FAIL' end) || E'\n';
  select count(*) into n from public.discover_feed(10) where exploration;
  r := r || format('08 exploration picks mixed in (%s): %s', n, case when n >= 1 then 'ok' else 'FAIL' end) || E'\n';
  select count(*) into n from (select * from public.discover_feed(10) f where not f.exploration limit 5) x where 'warm tones' = any (x.auto_tags);
  r := r || format('09 main picks are his style (%s of top 5 warm): %s', n, case when n = 5 then 'ok' else 'FAIL' end) || E'\n';

  reset role;
  insert into public.taste_corrections (user_id, kind, value) values (bob, 'tag', 'black and white');
  set local role authenticated;
  select count(*) into n from public.discover_feed(10) f where 'black and white' = any (f.auto_tags);
  r := r || format('10 "not into this" removes black & white: %s', case when n = 0 then 'ok' else 'FAIL' end) || E'\n';
  reset role;

  raise exception 'FEED TEST (rolled back):%', r;
end;
$$;
