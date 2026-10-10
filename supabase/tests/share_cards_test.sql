-- Test for share cards in chat (20261011000000_share_cards.sql). Always rolls back.
-- Run in the SQL editor and read the error message: every line should end in "ok".
do $$
declare
  a uuid := gen_random_uuid();  -- Ann: vendor, event owner
  b uuid := gen_random_uuid();  -- Ben: Ann's friend, not in the event
  c uuid := gen_random_uuid();  -- Cat: outsider
  v_cat uuid; v_pa uuid; v_draft uuid; v_album uuid; v_photo uuid; v_event uuid; v_dm uuid;
  v_msg uuid; v_msg2 uuid; v_post_msg uuid;
  p jsonb;
  n integer;
  r text := E'\n';
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (a, 'a.sharetest@example.com', '{"full_name": "Ann Test"}', 'authenticated', 'authenticated'),
    (b, 'b.sharetest@example.com', '{"full_name": "Ben Test"}', 'authenticated', 'authenticated'),
    (c, 'c.sharetest@example.com', '{"full_name": "Cat Test"}', 'authenticated', 'authenticated');
  select id into v_cat from public.service_categories where slug = 'photography';
  insert into public.providers (profile_id, vertical_id, display_name, slug, status)
  values (a, v_cat, 'Ann Photo', 'ann-photo-sharetest', 'active') returning id into v_pa;
  insert into public.providers (profile_id, vertical_id, display_name, slug, status)
  values (c, v_cat, 'Cat Draft', 'cat-draft-sharetest', 'draft') returning id into v_draft;
  insert into public.albums (provider_id, title, caption) values (v_pa, 'Golden hour', 'Malibu, last week') returning id into v_album;
  insert into public.photos (album_id, owner_id, position, display_path) values (v_album, a, 0, 'ann/cover.jpg') returning id into v_photo;
  update public.albums set cover_photo_id = v_photo where id = v_album;
  insert into public.events (owner_id, title, type, starts_at, location_text, guest_count, budget_cents)
  values (a, 'Ann''s 30th', 'birthday', now() + interval '30 days', 'Los Angeles', 40, 300000) returning id into v_event;

  -- Ann shares her event with Ben in a direct message.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_dm := public.start_direct_message(b);
  insert into public.messages (conversation_id, body, shared_event_id, share_preview)
  values (v_dm, 'Come!', v_event, '{"kind": "event", "title": "Fake title", "budget": 1}')
  returning id into v_msg;
  select share_preview into p from public.messages where id = v_msg;
  r := r || format('01 event preview filled by the database: %s', case when p ->> 'title' = 'Ann''s 30th' and p ->> 'location_text' = 'Los Angeles' and p ->> 'kind' = 'event' then 'ok' else 'FAIL ' || p::text end) || E'\n';
  r := r || format('02 preview has no private fields (budget, guests): %s', case when not (p ? 'budget') and not (p ? 'budget_cents') and not (p ? 'guest_count') then 'ok' else 'FAIL ' || p::text end) || E'\n';

  -- Ben sees the card but not the event itself.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select share_preview into p from public.messages where id = v_msg;
  r := r || format('03 Ben reads the card: %s', case when p ->> 'title' = 'Ann''s 30th' then 'ok' else 'FAIL' end) || E'\n';
  select count(*) into n from public.events where id = v_event;
  r := r || format('04 Ben still can''t read the event row (%s): %s', n, case when n = 0 then 'ok' else 'FAIL' end) || E'\n';
  begin
    insert into public.messages (conversation_id, shared_event_id) values (v_dm, v_event);
    r := r || '05 non-members can''t share the event: FAIL' || E'\n';
  exception when others then
    r := r || '05 non-members can''t share the event: ok' || E'\n';
  end;

  -- Vendors: anyone can share an active vendor; drafts only by their owner.
  insert into public.messages (conversation_id, shared_provider_id) values (v_dm, v_pa) returning id into v_msg2;
  select share_preview into p from public.messages where id = v_msg2;
  r := r || format('06 vendor card (no text needed): %s', case when p ->> 'name' = 'Ann Photo' and p ->> 'kind' = 'provider' then 'ok' else 'FAIL' end) || E'\n';
  begin
    insert into public.messages (conversation_id, shared_provider_id) values (v_dm, v_draft);
    r := r || '07 someone else''s draft listing can''t be shared: FAIL' || E'\n';
  exception when others then
    r := r || '07 someone else''s draft listing can''t be shared: ok' || E'\n';
  end;

  -- Posts get a preview too.
  insert into public.messages (conversation_id, shared_album_id) values (v_dm, v_album) returning id into v_post_msg;
  select share_preview into p from public.messages where id = v_post_msg;
  r := r || format('08 post preview (title, vendor, cover): %s', case when p ->> 'title' = 'Golden hour' and p ->> 'vendor' = 'Ann Photo' and p ->> 'cover' = 'ann/cover.jpg' then 'ok' else 'FAIL ' || coalesce(p::text, 'null') end) || E'\n';

  -- Rules: one thing per message; a preview alone isn't a message.
  begin
    insert into public.messages (conversation_id, shared_album_id, shared_provider_id) values (v_dm, v_album, v_pa);
    r := r || '09 one shared thing per message: FAIL' || E'\n';
  exception when check_violation then
    r := r || '09 one shared thing per message: ok' || E'\n';
  end;
  begin
    insert into public.messages (conversation_id, share_preview) values (v_dm, '{"kind": "event", "title": "Spoof"}');
    r := r || '10 a client-made preview alone is rejected: FAIL' || E'\n';
  exception when check_violation then
    r := r || '10 a client-made preview alone is rejected: ok' || E'\n';
  end;

  -- Outsiders see nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  select count(*) into n from public.messages where conversation_id = v_dm;
  r := r || format('11 outsiders see no messages (%s): %s', n, case when n = 0 then 'ok' else 'FAIL' end) || E'\n';

  -- Deleting the shared things keeps the cards (link cleared, preview kept).
  reset role;
  delete from public.events where id = v_event;
  delete from public.albums where id = v_album;
  select count(*) into n from public.messages
  where id in (v_msg, v_post_msg) and shared_event_id is null and shared_album_id is null and share_preview is not null;
  r := r || format('12 cards survive deleting the event and the post (%s of 2): %s', n, case when n = 2 then 'ok' else 'FAIL' end) || E'\n';

  raise exception 'SHARE CARDS TEST RESULTS (rolled back):%', r;
end $$;
