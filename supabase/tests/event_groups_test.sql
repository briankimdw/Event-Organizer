-- Test for events with friends: event chats, invites, leaving, the candidate board
-- and votes. Always rolls back.
-- Run in the SQL editor and read the error message: every line should end in "ok".
do $$
declare
  a uuid := gen_random_uuid();  -- Ann: creates the event
  b uuid := gen_random_uuid();  -- Ben: invited
  c uuid := gen_random_uuid();  -- Cat: invited, then leaves
  d uuid := gen_random_uuid();  -- Dan: outsider
  v uuid := gen_random_uuid();  -- Vic: a vendor
  v_vertical uuid;
  v_provider uuid;
  v_event uuid;
  v_event2 uuid;
  v_chat uuid;
  v_res jsonb;
  n integer;
  t text;
  r text := E'\n';
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (a, 'a.evtest@example.com', '{"full_name": "Ann Test"}', 'authenticated', 'authenticated'),
    (b, 'b.evtest@example.com', '{"full_name": "Ben Test"}', 'authenticated', 'authenticated'),
    (c, 'c.evtest@example.com', '{"full_name": "Cat Test"}', 'authenticated', 'authenticated'),
    (d, 'd.evtest@example.com', '{"full_name": "Dan Test"}', 'authenticated', 'authenticated'),
    (v, 'v.evtest@example.com', '{"full_name": "Vic Test"}', 'authenticated', 'authenticated');

  select id into v_vertical from public.service_categories where kind = 'vertical' order by sort_order limit 1;
  insert into public.providers (profile_id, vertical_id, display_name, slug, status)
  values (v, v_vertical, 'Vic Sounds', 'vic-sounds-evtest', 'active')
  returning id into v_provider;

  -- Ann creates an event with Ben invited; the chat comes with it.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_res := public.create_event_with_chat('Ann''s 30th', 'birthday', now() + interval '30 days', null, 'Los Angeles', 40, 300000, array[b]);
  v_event := (v_res ->> 'event_id')::uuid;
  v_chat := (v_res ->> 'conversation_id')::uuid;
  select count(*) into n from public.conversations where id = v_chat and kind = 'event' and event_id = v_event and title = 'Ann''s 30th';
  r := r || format('01 event chat created with the event: %s', case when n = 1 then 'ok' else 'FAIL' end) || E'\n';
  select count(*) into n from public.conversation_members where conversation_id = v_chat;
  r := r || format('02 chat has Ann + Ben (%s): %s', n, case when n = 2 then 'ok' else 'FAIL' end) || E'\n';
  select count(*) into n from public.event_members where event_id = v_event;
  r := r || format('03 Ben is a co-planner (%s members): %s', n, case when n = 2 then 'ok' else 'FAIL' end) || E'\n';

  -- A plain insert (the AI planner's "Save as event") also gets a chat.
  insert into public.events (title, type) values ('Quick plan', 'wedding') returning id into v_event2;
  select count(*) into n from public.conversations cv
  join public.conversation_members m on m.conversation_id = cv.id and m.profile_id = a
  where cv.event_id = v_event2 and cv.kind = 'event';
  r := r || format('04 events saved directly get a chat too: %s', case when n = 1 then 'ok' else 'FAIL' end) || E'\n';

  -- Ben (a co-planner) invites Cat; the chat says so.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.events where id = v_event;
  r := r || format('05 Ben sees the event: %s', case when n = 1 then 'ok' else 'FAIL' end) || E'\n';
  n := public.invite_to_event(v_event, array[c, b, a]);
  r := r || format('06 invite adds only new people (%s): %s', n, case when n = 1 then 'ok' else 'FAIL' end) || E'\n';
  select count(*) into n from public.conversation_members where conversation_id = v_chat;
  r := r || format('07 Cat joined the chat (%s in it): %s', n, case when n = 3 then 'ok' else 'FAIL' end) || E'\n';
  select count(*) into n from public.messages where conversation_id = v_chat and body like 'Ben added Cat%';
  r := r || format('08 "Ben added Cat" posted in the chat: %s', case when n = 1 then 'ok' else 'FAIL' end) || E'\n';

  -- Outsiders see nothing and can't invite themselves.
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  select count(*) into n from public.events where id = v_event;
  select n + count(*) into n from public.conversations where id = v_chat;
  r := r || format('09 Dan sees neither event nor chat: %s', case when n = 0 then 'ok' else 'FAIL' end) || E'\n';
  begin
    perform public.invite_to_event(v_event, array[d]);
    r := r || '10 outsiders can''t invite: FAIL' || E'\n';
  exception when others then
    r := r || '10 outsiders can''t invite: ok' || E'\n';
  end;
  begin
    perform public.add_event_candidate(v_event, v_provider, null, null);
    r := r || '11 outsiders can''t add vendors: FAIL' || E'\n';
  exception when others then
    r := r || '11 outsiders can''t add vendors: ok' || E'\n';
  end;

  -- The board: Ben adds Vic, Ann and Ben vote, Ann shortlists.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform public.add_event_candidate(v_event, v_provider, 'music', 'Great reviews');
  perform public.add_event_candidate(v_event, v_provider, 'music', null); -- again: no duplicate, no second message
  select count(*) into n from public.event_candidates where event_id = v_event and vertical_slug = 'music' and note = 'Great reviews' and added_by = b;
  r := r || format('12 candidate added once, note kept: %s', case when n = 1 then 'ok' else 'FAIL' end) || E'\n';
  select count(*) into n from public.messages where conversation_id = v_chat and body like 'Ben added Vic Sounds to %music%';
  r := r || format('13 "Ben added Vic Sounds to DJs & live music" posted once (%s): %s', n, case when n = 1 then 'ok' else 'FAIL' end) || E'\n';
  insert into public.event_candidate_votes (event_id, provider_id) values (v_event, v_provider);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  insert into public.event_candidate_votes (event_id, provider_id) values (v_event, v_provider);
  begin
    insert into public.event_candidate_votes (event_id, provider_id, profile_id) values (v_event, v_provider, c);
    r := r || '14 can''t vote for someone else: FAIL' || E'\n';
  exception when others then
    r := r || '14 can''t vote for someone else: ok' || E'\n';
  end;
  select count(*) into n from public.event_candidate_votes where event_id = v_event and provider_id = v_provider;
  r := r || format('15 two votes (%s): %s', n, case when n = 2 then 'ok' else 'FAIL' end) || E'\n';
  perform public.set_event_candidate_status(v_event, v_provider, 'shortlisted');
  select status into t from public.event_candidates where event_id = v_event and provider_id = v_provider;
  select count(*) into n from public.messages where conversation_id = v_chat and body = 'Ann shortlisted Vic Sounds';
  r := r || format('16 shortlisted + announced: %s', case when t = 'shortlisted' and n = 1 then 'ok' else 'FAIL' end) || E'\n';
  begin
    update public.event_candidates set added_by = d where event_id = v_event;
    r := r || '17 only status/note are editable: FAIL' || E'\n';
  exception when others then
    r := r || '17 only status/note are editable: ok' || E'\n';
  end;

  -- Bookings for the event are visible to every planner through event_bookings().
  reset role;
  insert into public.bookings (client_id, provider_id, event_id, status, time_range, timezone, total_cents, package_snapshot)
  values (b, v_provider, v_event, 'accepted', tstzrange(now() + interval '30 days', now() + interval '30 days 4 hours'), 'America/Los_Angeles', 90000, '{"name": "Party set"}');
  set local role authenticated;
  select count(*) into n from public.bookings where event_id = v_event;
  r := r || format('18 Ann can''t read Ben''s booking row directly (%s): %s', n, case when n = 0 then 'ok' else 'FAIL' end) || E'\n';
  select count(*) into n from public.event_bookings(v_event) where total_cents = 90000 and package_name = 'Party set';
  r := r || format('19 ...but sees it on the event (%s): %s', n, case when n = 1 then 'ok' else 'FAIL' end) || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  select count(*) into n from public.event_bookings(v_event);
  r := r || format('20 outsiders get no bookings (%s): %s', n, case when n = 0 then 'ok' else 'FAIL' end) || E'\n';

  -- Renaming the event renames the chat.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  update public.events set title = 'Ann''s big 30th' where id = v_event;
  select count(*) into n from public.conversations where id = v_chat and title = 'Ann''s big 30th';
  r := r || format('21 chat title follows the event: %s', case when n = 1 then 'ok' else 'FAIL' end) || E'\n';

  -- Cat leaves: out of the event and the chat.
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform public.leave_event(v_event);
  select count(*) into n from public.events where id = v_event;
  select n + count(*) into n from public.conversations where id = v_chat;
  r := r || format('22 after leaving, Cat sees neither event nor chat: %s', case when n = 0 then 'ok' else 'FAIL' end) || E'\n';

  -- The owner can't leave; she can remove Ben, who drops out of the chat.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  begin
    perform public.leave_event(v_event);
    r := r || '23 the owner can''t leave: FAIL' || E'\n';
  exception when others then
    r := r || '23 the owner can''t leave: ok' || E'\n';
  end;
  begin
    delete from public.event_members where event_id = v_event and profile_id = a;
    r := r || '24 the owner row can''t be deleted directly: FAIL' || E'\n';
  exception when others then
    r := r || '24 the owner row can''t be deleted directly: ok' || E'\n';
  end;
  perform public.remove_event_member(v_event, b);
  select count(*) into n from public.conversation_members where conversation_id = v_chat;
  r := r || format('25 Ben removed from the chat too (%s left): %s', n, case when n = 1 then 'ok' else 'FAIL' end) || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  begin
    perform public.remove_event_member(v_event, a);
    r := r || '26 only the owner removes people: FAIL' || E'\n';
  exception when others then
    r := r || '26 only the owner removes people: ok' || E'\n';
  end;

  -- Deleting the event removes its chat and board.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  delete from public.events where id = v_event;
  reset role;
  select count(*) into n from public.conversations where id = v_chat;
  select n + count(*) into n from public.event_candidates where event_id = v_event;
  r := r || format('27 deleting the event removes chat + board: %s', case when n = 0 then 'ok' else 'FAIL' end) || E'\n';

  -- Signed-out visitors can't call any of it.
  set local role anon;
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  begin
    perform public.create_event_with_chat('Nope');
    r := r || '28 signed-out visitors blocked: FAIL' || E'\n';
  exception when insufficient_privilege then
    r := r || '28 signed-out visitors blocked: ok' || E'\n';
  end;
  reset role;
  raise exception 'EVENT GROUPS TEST RESULTS (rolled back):%', r;
end $$;
