-- OPTIONAL, not applied yet (it was declined when proposed on 2026-10-08).
-- Performance tidy-up flagged by the Supabase advisor ("multiple permissive policies"):
-- each owner "manage" policy is FOR ALL, so it overlaps with the public SELECT policy
-- and both get evaluated on every read. This swaps each one for three narrower
-- policies (insert / update / delete) with the same condition. Access is unchanged
-- and no data is touched. Worth applying once tables have real traffic.
-- To apply: copy into a new file in supabase/migrations/ (e.g. 0008_split_owner_policies.sql).

do $$
declare
  p record;
begin
  for p in
    select * from (values
      ('service_categories',    'Admins manage categories',             '(select public.is_admin())'),
      ('cancellation_policies', 'Providers manage their own policies',  'provider_id is not null and (select public.owns_provider(provider_id))'),
      ('provider_services',     'Owners manage their services',         '(select public.owns_provider(provider_id))'),
      ('packages',              'Owners manage their packages',         '(select public.owns_provider(provider_id))'),
      ('package_addons',        'Owners manage their add-ons',          '(select public.owns_provider(provider_id))'),
      ('availability_rules',    'Owners manage their working hours',    '(select public.owns_provider(provider_id))'),
      ('blackouts',             'Owners manage their blocked-off time', '(select public.owns_provider(provider_id))'),
      ('albums',                'Owners manage their albums',           '(select public.owns_provider(provider_id))'),
      ('album_tags',            'Owners tag their albums',              '(select public.owns_album(album_id))'),
      ('event_members',         'Event owners manage members',
         'exists (select 1 from public.events e where e.id = event_id and e.owner_id = (select auth.uid()))')
    ) as t (tbl, old_policy, cond)
  loop
    execute format('drop policy %I on public.%I', p.old_policy, p.tbl);
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)',
                   p.old_policy || ' (insert)', p.tbl, p.cond);
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
                   p.old_policy || ' (update)', p.tbl, p.cond, p.cond);
    execute format('create policy %I on public.%I for delete to authenticated using (%s)',
                   p.old_policy || ' (delete)', p.tbl, p.cond);
  end loop;
end;
$$;
