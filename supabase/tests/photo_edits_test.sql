-- Photo edits test (migration 20261020000000_photo_edits): edit recipes, column grants, and the
-- stale-analysis reset when the public copy changes. Rolls back; leaves no data.
-- Every line should end in "ok".
do $$
declare
  ann uuid := gen_random_uuid(); eve uuid := gen_random_uuid();
  v_cat uuid; v_prov uuid; v_album uuid; v_photo uuid; v_photo2 uuid;
  n integer; v jsonb; t text; r text := E'\n';
begin
  insert into auth.users (id, email, aud, role) values
    (ann, 'ann.editstest@example.com', 'authenticated', 'authenticated'),
    (eve, 'eve.editstest@example.com', 'authenticated', 'authenticated');
  select id into v_cat from public.service_categories where slug = 'photography';
  insert into public.providers (profile_id, vertical_id, display_name, slug, status)
  values (ann, v_cat, 'Ann', 'ann-editstest', 'active') returning id into v_prov;
  insert into public.albums (provider_id, title) values (v_prov, 'Edits test') returning id into v_album;
  insert into public.photos (album_id, owner_id, position, display_path, original_path, width, height, phash)
  values (v_album, ann, 0, ann || '/a/1.jpg', ann || '/a/1-original.jpg', 2048, 1365, 'abc')
  returning id into v_photo;
  perform public.ml_save_photo_analysis(v_photo,
    '[' || array_to_string(array(select 0.01 from generate_series(1, 768)), ',') || ']', '{moody}', 'test');

  -- Ann, signed in.
  perform set_config('request.jwt.claims', json_build_object('sub', ann, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select edit_recipe into v from public.photos where id = v_photo;
  r := r || format('01 new photos are unedited (null): %s', case when v is null then 'ok' else 'FAIL' end) || E'\n';

  update public.photos set edit_recipe = '{"v":1,"crop":{"x":0.1,"y":0,"w":0.8,"h":1},"aspect":"4:5","adjust":{"exposure":15,"temperature":-20},"filter":{"id":"portra","strength":80}}'
  where id = v_photo;
  get diagnostics n = row_count;
  r := r || format('02 owner saves a recipe: %s', case when n = 1 then 'ok' else 'FAIL' end) || E'\n';

  update public.photos set display_path = ann || '/a/2.jpg', width = 1638, height = 2048 where id = v_photo;
  get diagnostics n = row_count;
  r := r || format('03 owner swaps the public copy (display_path, width, height): %s', case when n = 1 then 'ok' else 'FAIL' end) || E'\n';

  reset role;
  select count(*) into n from public.photo_embeddings where photo_id = v_photo;
  select phash into t from public.photos where id = v_photo;
  r := r || format('04 new copy drops the stale embedding and phash (%s left, phash %s): %s', n, coalesce(t, 'null'),
        case when n = 0 and t is null then 'ok' else 'FAIL' end) || E'\n';
  select count(*) into n from public.ml_pending_photos(200) where photo_id = v_photo;
  r := r || format('05 ML worker picks it up again: %s', case when n = 1 then 'ok' else 'FAIL' end) || E'\n';
  perform public.ml_save_photo_analysis(v_photo,
    '[' || array_to_string(array(select 0.01 from generate_series(1, 768)), ',') || ']', '{moody}', 'test');
  perform set_config('request.jwt.claims', json_build_object('sub', ann, 'role', 'authenticated')::text, true);
  set local role authenticated;

  update public.photos set edit_recipe = '{"v":1,"adjust":{"contrast":10}}' where id = v_photo;
  reset role;
  select count(*) into n from public.photo_embeddings where photo_id = v_photo;
  r := r || format('06 recipe-only change keeps the embedding: %s', case when n = 1 then 'ok' else 'FAIL' end) || E'\n';
  set local role authenticated;

  -- Shape check
  n := 0;
  foreach t in array array[
    '[1,2]', '{"adjust":{}}', '{"v":"1"}', '{"v":1,"evil":true}', '{"v":1,"adjust":{"exposure":500}}',
    '{"v":1,"adjust":{"exposure":"lots"}}', '{"v":1,"adjust":[1]}', '{"v":1,"crop":"all"}', '{"v":1,"flipH":"yes"}',
    '{"v":1,"aspect":{"w":4}}', '{"v":1,"filter":"portra"}',
    '{"v":1,"adjust":{"exposure":1},"crop":{"x":"' || repeat('x', 5000) || '"}}'
  ] loop
    begin
      update public.photos set edit_recipe = t::jsonb where id = v_photo;
      r := r || format('07 accepted a bad recipe %s: FAIL', left(t, 40)) || E'\n';
    exception when check_violation then
      n := n + 1;
    end;
  end loop;
  r := r || format('07 rejects malformed recipes (array, no version, unknown key, out of range, too big...) (%s of 12): %s',
        n, case when n = 12 then 'ok' else 'FAIL' end) || E'\n';

  update public.photos set edit_recipe = null where id = v_photo;
  get diagnostics n = row_count;
  r := r || format('08 revert to unedited (null): %s', case when n = 1 then 'ok' else 'FAIL' end) || E'\n';

  insert into public.photos (album_id, owner_id, position, display_path, original_path, width, height, edit_recipe)
  values (v_album, ann, 1, ann || '/a/3.jpg', ann || '/a/3-original.jpg', 2048, 2048, '{"v":1,"aspect":"1:1","crop":{"x":0.2,"y":0,"w":0.6,"h":1}}')
  returning id into v_photo2;
  r := r || format('09 owner can post with a recipe: %s', case when v_photo2 is not null then 'ok' else 'FAIL' end) || E'\n';

  begin
    update public.photos set ai_score = 0.1 where id = v_photo;
    r := r || '10 AI-check columns still off-limits: FAIL' || E'\n';
  exception when insufficient_privilege then
    r := r || '10 AI-check columns still off-limits: ok' || E'\n';
  end;
  reset role;

  -- Eve, signed in: can't touch Ann's photos.
  perform set_config('request.jwt.claims', json_build_object('sub', eve, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.photos set edit_recipe = '{"v":1}' where id = v_photo;
  get diagnostics n = row_count;
  r := r || format('11 others cannot edit your photos (%s rows): %s', n, case when n = 0 then 'ok' else 'FAIL' end) || E'\n';
  reset role;

  -- Signed out: the recipe is readable with the photo (it's only edit settings), never writable.
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  set local role anon;
  select count(*) into n from public.photos where id = v_photo2 and edit_recipe is not null;
  r := r || format('12 recipe readable with a published photo: %s', case when n = 1 then 'ok' else 'FAIL' end) || E'\n';
  begin
    update public.photos set edit_recipe = null where id = v_photo2;
    r := r || '13 signed-out users cannot write recipes: FAIL' || E'\n';
  exception when insufficient_privilege then
    r := r || '13 signed-out users cannot write recipes: ok' || E'\n';
  end;
  reset role;

  raise exception 'PHOTO EDITS TEST (rolled back):%', r;
end;
$$;
