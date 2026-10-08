-- End-to-end smoke test for the schema, auth rules and booking flow.
-- Runs as one transaction that ALWAYS rolls back (it ends by raising an
-- exception carrying the results), so it leaves no data behind.
--
-- Run it in the Supabase SQL editor (or via the MCP execute_sql tool) and read
-- the error message: every line should end in "ok".

do $$
declare
  alice uuid := gen_random_uuid();  -- photographer
  bob   uuid := gen_random_uuid();  -- client
  eve   uuid := gen_random_uuid();  -- another client
  v_provider public.providers;
  v_pkg uuid;
  v_wedding uuid;
  v_booking public.bookings;
  v_booking2 public.bookings;
  v_day date := current_date + 12;
  v_conv uuid;
  v_result jsonb;
  n integer;
  r text := E'\n';
begin
  -- 1. Signup trigger creates profiles with clean usernames ------------------
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice.smoketest@example.com', '{"full_name": "Alice Test"}', 'authenticated', 'authenticated'),
    (bob,   'bob.smoketest@example.com',   '{}', 'authenticated', 'authenticated'),
    (eve,   'eve.smoketest@example.com',   '{}', 'authenticated', 'authenticated');
  select count(*) into n from public.profiles where id in (alice, bob, eve);
  r := r || format('01 profiles created on signup (%s/3): %s', n, case when n = 3 then 'ok' else 'FAIL' end) || E'\n';

  -- 2. Alice becomes a provider and adds a package ----------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_provider := public.become_provider('Alice Photo', 'alice-smoketest', 'photography', 'Test bio', 'Los Angeles');
  select id into v_wedding from public.service_categories where slug = 'wedding';
  insert into public.provider_services (provider_id, category_id) values (v_provider.id, v_wedding);
  insert into public.packages (provider_id, category_id, name, price_type, price_cents, duration_minutes, deposit_pct, attributes)
  values (v_provider.id, v_wedding, 'Full-Day Wedding', 'fixed', 450000, 480, 30,
          '{"edited_photos": 600, "turnaround_days": 42, "deliverables": ["Online gallery"]}')
  returning id into v_pkg;
  r := r || format('02 provider + package created (status %s): ok', v_provider.status) || E'\n';

  -- 3. Package fields are validated against the Photography schema ----------
  begin
    insert into public.packages (provider_id, category_id, name, price_type, price_cents, attributes)
    values (v_provider.id, v_wedding, 'Bad', 'fixed', 100, '{"per_head_price": 50}');
    r := r || '03 invalid package attributes rejected: FAIL' || E'\n';
  exception when others then
    r := r || '03 invalid package attributes rejected: ok' || E'\n';
  end;

  -- 4. Alice can't mark herself verified --------------------------------------
  begin
    update public.providers set identity_verified = true where id = v_provider.id;
    r := r || '04 provider cannot self-verify: FAIL' || E'\n';
  exception when insufficient_privilege then
    r := r || '04 provider cannot self-verify: ok' || E'\n';
  end;

  -- 5. Server side: verification passes, listing goes live ---------------------
  reset role;
  update public.providers set identity_verified = true, status = 'active' where id = v_provider.id;

  -- 6. Bob searches by date and requests a booking ----------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.search_providers(array[v_day], 'wedding') s where s.provider_id = v_provider.id;
  r := r || format('06a search_providers finds Alice free on %s: %s', v_day, case when n = 1 then 'ok' else 'FAIL' end) || E'\n';
  select * into v_booking from public.request_booking(v_pkg, array[v_day], '14:00');
  r := r || format('06b booking requested (status %s, total %s, deposit %s): %s', v_booking.status,
        v_booking.total_cents, v_booking.deposit_cents,
        case when v_booking.status = 'requested' and v_booking.deposit_cents = 135000 then 'ok' else 'FAIL' end) || E'\n';
  select c.id into v_conv from public.conversations c where c.booking_id = v_booking.id;
  select count(*) into n from public.conversation_members where conversation_id = v_conv;
  r := r || format('06c booking thread created with %s members: %s', n, case when n = 2 then 'ok' else 'FAIL' end) || E'\n';

  -- 7. Eve can't double-book Alice, can't see Bob's booking, can't edit it -----
  perform set_config('request.jwt.claims', json_build_object('sub', eve, 'role', 'authenticated')::text, true);
  begin
    perform public.request_booking(v_pkg, array[v_day], '10:00');
    r := r || '07a double-booking rejected: FAIL' || E'\n';
  exception when others then
    r := r || format('07a double-booking rejected ("%s"): ok', sqlerrm) || E'\n';
  end;
  select count(*) into n from public.bookings where id = v_booking.id;
  r := r || format('07b other clients cannot see the booking: %s', case when n = 0 then 'ok' else 'FAIL' end) || E'\n';
  update public.bookings set status = 'completed' where id = v_booking.id;
  get diagnostics n = row_count;
  r := r || format('07c direct status edits blocked (%s rows changed): %s', n, case when n = 0 then 'ok' else 'FAIL' end) || E'\n';
  select count(*) into n from public.search_providers(array[v_day], 'wedding') s where s.provider_id = v_provider.id;
  r := r || format('07d search no longer shows Alice as free that day: %s', case when n = 0 then 'ok' else 'FAIL' end) || E'\n';
  begin
    insert into public.messages (conversation_id, body) values (v_conv, 'hi');
    r := r || '07e outsiders cannot post in the booking thread: FAIL' || E'\n';
  exception when others then
    r := r || '07e outsiders cannot post in the booking thread: ok' || E'\n';
  end;

  -- 8. Alice accepts; payment confirms; delivery; Bob accepts -----------------
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  v_booking := public.respond_to_booking(v_booking.id, 'accept');
  r := r || format('08a provider accepts: %s', case when v_booking.status = 'accepted' then 'ok' else 'FAIL' end) || E'\n';
  reset role;
  update public.bookings set status = 'confirmed' where id = v_booking.id;  -- what the payment webhook will do
  set local role authenticated;
  v_booking := public.mark_delivered(v_booking.id);
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  v_booking := public.accept_delivery(v_booking.id);
  r := r || format('08b delivered then completed: %s', case when v_booking.status = 'completed' then 'ok' else 'FAIL' end) || E'\n';
  select count(*) into n from public.booking_events where booking_id = v_booking.id;
  r := r || format('08c status history has %s entries: %s', n, case when n = 5 then 'ok' else 'FAIL' end) || E'\n';
  insert into public.messages (conversation_id, body) values (v_conv, 'Thank you!');
  r := r || '08d booking parties can chat: ok' || E'\n';

  -- 9. Double-blind reviews ----------------------------------------------------
  perform public.submit_review(v_booking.id, 5::smallint, 'Amazing');
  set local role anon;
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  select count(*) into n from public.reviews where booking_id = v_booking.id;
  r := r || format('09a first review hidden from the public: %s', case when n = 0 then 'ok' else 'FAIL' end) || E'\n';
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  perform public.submit_review(v_booking.id, 4::smallint, 'Great client');
  reset role;
  select count(*) into n from public.reviews where booking_id = v_booking.id and revealed_at is not null;
  r := r || format('09b both reviews revealed together: %s', case when n = 2 then 'ok' else 'FAIL' end) || E'\n';
  r := r || format('09c ratings updated (provider %s, client %s): %s',
        (select rating_avg from public.providers where id = v_provider.id),
        (select client_rating_avg from public.profiles where id = bob),
        case when (select rating_avg from public.providers where id = v_provider.id) = 5
              and (select client_rating_avg from public.profiles where id = bob) = 4 then 'ok' else 'FAIL' end) || E'\n';

  -- 10. Cancellation + anonymous visibility -----------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into v_booking2 from public.request_booking(v_pkg, array[v_day + 1], '09:00');
  v_result := public.cancel_booking(v_booking2.id);
  r := r || format('10a client cancels a request (%s): %s', v_result,
        case when v_result ->> 'status' = 'cancelled_by_client' then 'ok' else 'FAIL' end) || E'\n';
  set local role anon;
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  select count(*) into n from public.providers where id = v_provider.id;
  r := r || format('10b logged-out visitors see the active listing: %s', case when n = 1 then 'ok' else 'FAIL' end) || E'\n';
  select count(*) into n from public.bookings;
  r := r || format('10c logged-out visitors see no bookings: %s', case when n = 0 then 'ok' else 'FAIL' end) || E'\n';
  reset role;

  raise exception 'SMOKE TEST RESULTS (rolled back, nothing saved):%', r;
end;
$$;
