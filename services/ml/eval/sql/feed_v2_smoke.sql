-- Smoke test on the real schema: 2 vendors x 3 albums x 3 photos with random embeddings,
-- a viewer who swipes; discover_feed / provider_matches must run every code path.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'v1@x.test'), ('00000000-0000-0000-0000-0000000000a2', 'v2@x.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'viewer@x.test');
insert into public.providers (id, profile_id, vertical_id, display_name, slug, status)
select ('00000000-0000-0000-0000-00000000010' || k)::uuid, ('00000000-0000-0000-0000-0000000000a' || k)::uuid,
       (select id from public.service_categories where slug = 'photography' and kind = 'vertical' limit 1),
       'Vendor ' || k, 'vendor-' || k, 'active'
from generate_series(1, 2) k;
insert into public.albums (id, provider_id, title)
select ('00000000-0000-0000-0000-0000000002' || k || a)::uuid, ('00000000-0000-0000-0000-00000000010' || k)::uuid, 'Album ' || k || a
from generate_series(1, 2) k, generate_series(1, 3) a;
insert into public.photos (id, album_id, owner_id, display_path, auto_tags, created_at)
select ('00000000-0000-0000-0000-000000003' || k || a || p)::uuid, ('00000000-0000-0000-0000-0000000002' || k || a)::uuid,
       ('00000000-0000-0000-0000-0000000000a' || k)::uuid, 'x/' || k || a || p || '.jpg',
       case when p = 1 then array['moody'] else array['wedding'] end, now() - (k * 10 + a * 3 + p) * interval '1 minute'
from generate_series(1, 2) k, generate_series(1, 3) a, generate_series(1, 3) p;
insert into public.photo_embeddings (photo_id, embedding, model)
select p.id, (select array_agg(random()::real - 0.5) from generate_series(1, 768) where p.id is not null)::extensions.vector, 'test'
from public.photos p;

do $$
declare n int; m int; r text;
begin
  -- signed out: cold start (spread picks)
  perform set_config('request.jwt.claims', '', true);
  select count(*) into n from public.discover_feed(20, null);
  if n <> 6 then raise exception 'signed out: expected 6 cards (one per album), got %', n; end if;
  -- signed in, no swipes
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', true);
  select count(*) into n from public.discover_feed(20, 'photography');
  if n <> 6 then raise exception 'cold: expected 6, got %', n; end if;
  -- passes only
  insert into public.swipes (user_id, photo_id, action) values
    ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000003111', 'pass');
  select count(*) into n from public.discover_feed(20, null);
  if n <> 6 then raise exception 'passes only: expected 6, got %', n; end if;
  -- likes + a save, three of them: personalised feed + provider_matches
  insert into public.swipes (user_id, photo_id, action) values
    ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000003121', 'like'),
    ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000003211', 'save'),
    ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000003221', 'like');
  select count(*), min(reason) filter (where not exploration) into n, r from public.discover_feed(4, 'photography');
  if n <> 4 then raise exception 'personalised: expected 4, got %', n; end if;
  if r not like 'Because you liked%' and r <> 'Similar to photos you liked' then raise exception 'reason %', r; end if;
  select count(*) into m from public.provider_matches();
  if m <> 2 then raise exception 'provider_matches: expected 2 rows, got %', m; end if;
  -- the anon role can call the feed but not the internal helper
  if has_function_privilege('anon', 'public.taste_profile(uuid, text)', 'execute') then raise exception 'taste_profile is public'; end if;
  if not has_function_privilege('anon', 'public.discover_feed(integer, text)', 'execute') then raise exception 'feed not callable'; end if;
  raise notice 'feed_v2 smoke: ok';
end $$;
select 'feed_v2 smoke ok';
