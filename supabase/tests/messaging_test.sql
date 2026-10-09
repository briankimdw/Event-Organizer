-- Test for direct messages, group chats and blocks. Always rolls back.
-- Run in the SQL editor and read the error message: every line should end in "ok".
do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  d uuid := gen_random_uuid();
  v_dm uuid;
  v_dm2 uuid;
  v_group uuid;
  n integer;
  r text := E'\n';
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (a, 'a.msgtest@example.com', '{"full_name": "Ann Test"}', 'authenticated', 'authenticated'),
    (b, 'b.msgtest@example.com', '{"full_name": "Ben Test"}', 'authenticated', 'authenticated'),
    (c, 'c.msgtest@example.com', '{"full_name": "Cat Test"}', 'authenticated', 'authenticated'),
    (d, 'd.msgtest@example.com', '{"full_name": "Dan Test"}', 'authenticated', 'authenticated');

  -- Ann messages Ben directly.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_dm := public.start_direct_message(b);
  v_dm2 := public.start_direct_message(b);
  r := r || format('01 one direct thread per pair: %s', case when v_dm = v_dm2 then 'ok' else 'FAIL' end) || E'\n';
  insert into public.messages (conversation_id, body) values (v_dm, 'Hi Ben');
  r := r || '02 Ann can send in it: ok' || E'\n';
  begin
    perform public.start_direct_message(a);
    r := r || '03 can''t message yourself: FAIL' || E'\n';
  exception when others then
    r := r || '03 can''t message yourself: ok' || E'\n';
  end;

  -- Ben sees it and replies; Cat can't see it.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.messages where conversation_id = v_dm;
  r := r || format('04 Ben sees the message (%s): %s', n, case when n = 1 then 'ok' else 'FAIL' end) || E'\n';
  insert into public.messages (conversation_id, body) values (v_dm, 'Hey Ann');
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  select count(*) into n from public.messages where conversation_id = v_dm;
  r := r || format('05 outsiders see nothing (%s): %s', n, case when n = 0 then 'ok' else 'FAIL' end) || E'\n';

  -- Groups.
  begin
    perform public.create_group_chat('Too small', array[a]);
    r := r || '06 groups need 2+ others: FAIL' || E'\n';
  exception when others then
    r := r || '06 groups need 2+ others: ok' || E'\n';
  end;
  v_group := public.create_group_chat('Weekend photo walk', array[a, b]);
  select count(*) into n from public.conversation_members where conversation_id = v_group;
  r := r || format('07 group created with %s members: %s', n, case when n = 3 then 'ok' else 'FAIL' end) || E'\n';
  perform public.add_group_members(v_group, array[d]);
  perform public.rename_group(v_group, 'Sunday walk');
  select count(*) into n from public.conversations where id = v_group and title = 'Sunday walk';
  r := r || format('08 add members + rename: %s', case when n = 1 and (select count(*) from public.conversation_members where conversation_id = v_group) = 4 then 'ok' else 'FAIL' end) || E'\n';
  perform public.leave_group(v_group);
  select count(*) into n from public.conversations where id = v_group;
  r := r || format('09 after leaving, Cat no longer sees the group: %s', case when n = 0 then 'ok' else 'FAIL' end) || E'\n';

  -- Blocks: Ben blocks Ann; neither can use the direct thread or start a new one.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  insert into public.blocks (blocked_id) values (a);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  begin
    insert into public.messages (conversation_id, body) values (v_dm, 'Still there?');
    r := r || '10 blocked: can''t send in the direct thread: FAIL' || E'\n';
  exception when others then
    r := r || '10 blocked: can''t send in the direct thread: ok' || E'\n';
  end;
  begin
    perform public.start_direct_message(b);
    r := r || '11 blocked: can''t start a new thread: FAIL' || E'\n';
  exception when others then
    r := r || '11 blocked: can''t start a new thread: ok' || E'\n';
  end;

  -- Signed-out visitors can't call any of it.
  set local role anon;
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  begin
    perform public.start_direct_message(b);
    r := r || '12 signed-out visitors blocked: FAIL' || E'\n';
  exception when insufficient_privilege then
    r := r || '12 signed-out visitors blocked: ok' || E'\n';
  end;
  reset role;
  raise exception 'MESSAGING TEST RESULTS (rolled back):%', r;
end $$;
