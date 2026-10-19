-- Test for every vertical: categories from catalog.js, per-vertical attribute
-- validation, per-person / per-item / daily prices, and capacity (several
-- overlapping bookings for a caterer, still one at a time for a photographer).
-- Needs migration 20261010000000_all_verticals + seed.sql.
-- Runs as one transaction that ALWAYS rolls back (it ends by raising an exception
-- carrying the results). Run it in the SQL editor and read the error message:
-- every line should end in "ok".

do $$
declare
  -- frontend/src/verticals/catalog.js, in order, with each vertical's number of services.
  v_verticals text[] := array['photography', 'videography', 'venue', 'catering', 'private-chef', 'cakes', 'bar', 'music',
                              'entertainment', 'florals', 'decor', 'hair-makeup', 'rentals', 'planning', 'officiant',
                              'transportation', 'staffing', 'wellness'];
  v_service_counts integer[] := array[9, 5, 6, 6, 4, 4, 4, 5, 6, 4, 5, 5, 5, 4, 3, 4, 4, 4];
  -- One package attribute each vertical must reject (wrong value or a field from another vertical).
  v_bad jsonb := '{
    "photography": {"per_head_price": 50}, "videography": {"film_minutes": -1}, "venue": {"dietary": ["vegan"]},
    "catering": {"dietary": ["paleo"]}, "private-chef": {"courses": 0}, "cakes": {"tiers": "three"},
    "bar": {"bartenders": 0}, "music": {"genres": ["jazz"]}, "entertainment": {"performers": 0},
    "florals": {"units_per_guest": -1}, "decor": {"setup_included": "yes"}, "hair-makeup": {"travel": true},
    "rentals": {"bundle": [{"quantity": 2}]}, "planning": {"meetings": -1}, "officiant": {"ceremony_minutes": 1},
    "transportation": {"passengers": 0}, "staffing": {"role": "chef"}, "wellness": {"session_minutes": 5}
  }';
  cara  uuid := gen_random_uuid();  -- caterer
  pete  uuid := gen_random_uuid();  -- photographer
  vera  uuid := gen_random_uuid();  -- venue + florist (two listings)
  c1 uuid := gen_random_uuid(); c2 uuid := gen_random_uuid(); c3 uuid := gen_random_uuid(); c4 uuid := gen_random_uuid();
  v_caterer public.providers;
  v_photog public.providers;
  v_venue public.providers;
  v_florist public.providers;
  v_plated uuid;
  v_photo_pkg uuid;
  v_venue_pkg uuid;
  v_florals_pkg uuid;
  v_b public.bookings;
  v_day date := current_date + 12;
  v_cat uuid;
  v_slug text;
  i integer;
  n integer;
  ok boolean;
  bad text := '';
  r text := E'\n';
begin
  -- 1. Categories match the catalog ------------------------------------------
  for i in 1 .. cardinality(v_verticals) loop
    select count(*) into n
    from public.service_categories v
    join public.service_categories s on s.parent_id = v.id and s.kind = 'service'
    where v.slug = v_verticals[i] and v.kind = 'vertical' and v.sort_order = i
      and v.provider_schema is not null and v.package_schema is not null;
    if n <> v_service_counts[i] then
      bad := bad || format(' %s(%s/%s)', v_verticals[i], n, v_service_counts[i]);
    end if;
  end loop;
  select count(*) into n from public.service_categories where kind = 'vertical';
  r := r || format('01 18 verticals in catalog order, each with schemas and its services (%s verticals%s): %s',
        n, coalesce(nullif(bad, ''), ''), case when bad = '' and n = 18 then 'ok' else 'FAIL' end) || E'\n';

  -- Accounts (the signup trigger makes their profiles).
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (cara, 'cara.verticaltest@example.com', '{}', 'authenticated', 'authenticated'),
    (pete, 'pete.verticaltest@example.com', '{}', 'authenticated', 'authenticated'),
    (vera, 'vera.verticaltest@example.com', '{}', 'authenticated', 'authenticated'),
    (c1, 'c1.verticaltest@example.com', '{}', 'authenticated', 'authenticated'),
    (c2, 'c2.verticaltest@example.com', '{}', 'authenticated', 'authenticated'),
    (c3, 'c3.verticaltest@example.com', '{}', 'authenticated', 'authenticated'),
    (c4, 'c4.verticaltest@example.com', '{}', 'authenticated', 'authenticated');

  -- 2. Listings in new verticals through become_provider ----------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', cara, 'role', 'authenticated')::text, true);
  v_caterer := public.become_provider('Cara Catering', 'cara-verticaltest', 'catering');
  perform set_config('request.jwt.claims', json_build_object('sub', pete, 'role', 'authenticated')::text, true);
  v_photog := public.become_provider('Pete Photo', 'pete-verticaltest', 'photography');
  perform set_config('request.jwt.claims', json_build_object('sub', vera, 'role', 'authenticated')::text, true);
  v_venue := public.become_provider('Vera Venue', 'vera-venue-verticaltest', 'venue');
  v_florist := public.become_provider('Vera Flowers', 'vera-flowers-verticaltest', 'florals');
  update public.providers set attributes = '{"setting": "indoor", "capacity_seated": 120}' where id = v_venue.id;
  begin
    update public.providers set attributes = '{"setting": "underwater"}' where id = v_venue.id;
    ok := false;
  exception when check_violation then
    ok := true;
  end;
  r := r || format('02 listings in catering / venue / florals; venue fields validated (default capacity %s): %s',
        v_caterer.max_concurrent, case when ok and v_caterer.max_concurrent = 1 then 'ok' else 'FAIL' end) || E'\n';
  reset role;

  -- Server side: live, verified; the caterer can work 3 events at once.
  update public.providers set status = 'active', identity_verified = true where id in (v_caterer.id, v_photog.id, v_venue.id, v_florist.id);
  update public.providers set max_concurrent = 3 where id = v_caterer.id;

  -- 3. Package attributes are validated per vertical ----------------------------
  bad := '';
  foreach v_slug in array v_verticals loop
    select s.id into v_cat from public.service_categories s join public.service_categories v on v.id = s.parent_id
    where v.slug = v_slug order by s.sort_order limit 1;
    begin
      insert into public.packages (provider_id, category_id, name, price_type, price_cents, attributes)
      values (v_caterer.id, v_cat, 'Bad', 'fixed', 100, v_bad -> v_slug);
      bad := bad || ' ' || v_slug;
    exception when check_violation then
      null;
    end;
  end loop;
  r := r || format('03 every vertical rejects bad package attributes%s: %s',
        coalesce(nullif(' (accepted:' || bad || ')', ' (accepted:)'), ''), case when bad = '' then 'ok' else 'FAIL' end) || E'\n';

  -- Packages: per-person catering, fixed photography, daily venue, per-item florals.
  insert into public.packages (provider_id, category_id, name, price_type, price_cents, duration_minutes, min_quantity, max_quantity, deposit_pct, attributes)
  values (v_caterer.id, (select id from public.service_categories where slug = 'plated-dinner'), 'Plated Dinner', 'per_person', 6500, 300, 40, 300, 30,
          '{"service_style": "plated", "courses": 3, "dietary": ["vegan", "halal"]}')
  returning id into v_plated;
  insert into public.packages (provider_id, category_id, name, price_type, price_cents, duration_minutes, attributes)
  values (v_photog.id, (select id from public.service_categories where slug = 'wedding'), 'Wedding', 'fixed', 300000, 480, '{}')
  returning id into v_photo_pkg;
  insert into public.packages (provider_id, category_id, name, price_type, price_cents, duration_minutes, max_quantity, deposit_pct, attributes)
  values (v_venue.id, (select id from public.service_categories where slug = 'party-space'), 'Day Rental', 'daily', 350000, 600, 120, 50, '{"hours_included": 10}')
  returning id into v_venue_pkg;
  insert into public.packages (provider_id, category_id, name, price_type, price_cents, min_quantity, attributes)
  values (v_florist.id, (select id from public.service_categories where slug = 'centerpieces'), 'Centerpiece', 'per_item', 8500, 5, '{"pieces": 1, "units_per_guest": 0.125}')
  returning id into v_florals_pkg;
  r := r || '04 valid per_person / daily / per_item packages accepted: ok' || E'\n';

  -- 5. Prices: per_person = price x guests; default = the package minimum ------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  select * into v_b from public.request_booking(v_plated, array[v_day], '17:00', p_quantity => 80);
  r := r || format('05a per_person: $65 x 80 guests = %s (deposit %s, quantity %s, slot %s): %s', v_b.total_cents, v_b.deposit_cents,
        v_b.quantity, v_b.slot, case when v_b.subtotal_cents = 520000 and v_b.total_cents = 520000 and v_b.deposit_cents = 156000
                                         and v_b.quantity = 80 and v_b.slot = 1 then 'ok' else 'FAIL' end) || E'\n';
  begin
    perform public.request_booking(v_plated, array[v_day + 1], '17:00', p_quantity => 10);
    r := r || '05b below the 40-guest minimum rejected: FAIL' || E'\n';
  exception when others then
    r := r || format('05b below the 40-guest minimum rejected ("%s"): ok', sqlerrm) || E'\n';
  end;
  select * into v_b from public.request_booking(v_florals_pkg, array[v_day], '10:00', p_quantity => 12);
  r := r || format('05c per_item: $85 x 12 = %s: %s', v_b.total_cents, case when v_b.total_cents = 102000 then 'ok' else 'FAIL' end) || E'\n';
  select * into v_b from public.request_booking(v_venue_pkg, array[v_day], '12:00', p_quantity => 100);
  r := r || format('05d daily: one day = %s (100 guests, %s hours): %s', v_b.total_cents,
        extract(epoch from upper(v_b.time_range) - lower(v_b.time_range)) / 3600,
        case when v_b.total_cents = 350000 and v_b.quantity = 100 then 'ok' else 'FAIL' end) || E'\n';
  begin
    perform public.request_booking(v_venue_pkg, array[v_day + 2], '12:00', p_quantity => 500);
    r := r || '05e over the venue''s 120-guest maximum rejected: FAIL' || E'\n';
  exception when others then
    r := r || format('05e over the venue''s 120-guest maximum rejected ("%s"): ok', sqlerrm) || E'\n';
  end;

  -- 6. Capacity: the caterer (3 at once) takes 3 overlapping events, not a 4th --
  perform set_config('request.jwt.claims', json_build_object('sub', c2, 'role', 'authenticated')::text, true);
  select * into v_b from public.request_booking(v_plated, array[v_day], '18:00');  -- no quantity: 40 guests
  r := r || format('06a 2nd overlapping catering booking accepted (slot %s, 40 guests by default = %s): %s', v_b.slot, v_b.total_cents,
        case when v_b.slot = 2 and v_b.quantity = 40 and v_b.total_cents = 260000 then 'ok' else 'FAIL' end) || E'\n';
  select count(*) into n from public.search_providers(array[v_day], 'catering') s where s.provider_id = v_caterer.id;
  r := r || format('06b with 2 of 3 booked the caterer is still free that day: %s', case when n = 1 then 'ok' else 'FAIL' end) || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', c3, 'role', 'authenticated')::text, true);
  select * into v_b from public.request_booking(v_plated, array[v_day], '19:00', p_quantity => 50);
  r := r || format('06c 3rd overlapping booking accepted (slot %s): %s', v_b.slot, case when v_b.slot = 3 then 'ok' else 'FAIL' end) || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', c4, 'role', 'authenticated')::text, true);
  begin
    perform public.request_booking(v_plated, array[v_day], '20:00', p_quantity => 50);
    r := r || '06d 4th overlapping booking rejected: FAIL' || E'\n';
  exception when others then
    r := r || format('06d 4th overlapping booking rejected ("%s"): ok', sqlerrm) || E'\n';
  end;
  select count(*) into n from public.search_providers(array[v_day], 'catering') s where s.provider_id = v_caterer.id;
  r := r || format('06e fully booked caterer no longer shows as free: %s', case when n = 0 then 'ok' else 'FAIL' end) || E'\n';
  select * into v_b from public.request_booking(v_plated, array[v_day], '08:00', p_quantity => 50);  -- 8am-1pm: before the others
  r := r || format('06f a non-overlapping morning booking that day still fits (slot %s): %s', v_b.slot,
        case when v_b.slot = 1 then 'ok' else 'FAIL' end) || E'\n';

  -- 7. A photographer is still one booking at a time --------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  perform public.request_booking(v_photo_pkg, array[v_day], '14:00');
  perform set_config('request.jwt.claims', json_build_object('sub', c2, 'role', 'authenticated')::text, true);
  begin
    perform public.request_booking(v_photo_pkg, array[v_day], '16:00');
    r := r || '07a photographer double-booking rejected: FAIL' || E'\n';
  exception when others then
    r := r || format('07a photographer double-booking rejected ("%s"): ok', sqlerrm) || E'\n';
  end;
  select count(*) into n from public.search_providers(array[v_day], 'photography') s where s.provider_id = v_photog.id;
  r := r || format('07b booked photographer not free that day: %s', case when n = 0 then 'ok' else 'FAIL' end) || E'\n';

  -- 8. A cancelled booking frees its slot ---------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  select * into v_b from public.bookings where client_id = c1 and package_id = v_plated;
  perform public.cancel_booking(v_b.id);
  perform set_config('request.jwt.claims', json_build_object('sub', c4, 'role', 'authenticated')::text, true);
  select * into v_b from public.request_booking(v_plated, array[v_day], '20:00', p_quantity => 50);
  r := r || format('08 after a cancellation the 4th event fits (slot %s): %s', v_b.slot, case when v_b.slot = 1 then 'ok' else 'FAIL' end) || E'\n';
  reset role;

  raise exception 'VERTICALS TEST RESULTS (rolled back, nothing saved):%', r;
end;
$$;
