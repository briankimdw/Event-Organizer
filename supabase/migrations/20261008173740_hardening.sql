-- 0007: hardening from the Supabase security/performance advisors.
-- (The optional policy split is in supabase/pending/split_owner_policies.sql.)

-- ---------------------------------------------------------------------------
-- 1. Trigger functions should not be callable through the API (/rest/v1/rpc).
--    Postgres only checks EXECUTE when a trigger is created, so they keep firing.
-- ---------------------------------------------------------------------------
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.providers_check() from public, anon, authenticated;
revoke execute on function public.packages_check() from public, anon, authenticated;
revoke execute on function public.albums_status_guard() from public, anon, authenticated;
revoke execute on function public.add_event_owner() from public, anon, authenticated;
revoke execute on function public.log_booking_status() from public, anon, authenticated;
revoke execute on function public.touch_conversation() from public, anon, authenticated;
revoke execute on function public.create_booking_conversation() from public, anon, authenticated;
revoke execute on function public.refresh_review_aggregates() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Index foreign keys (cheap now while tables are empty; speeds up joins
--    and deletes later).
-- ---------------------------------------------------------------------------
create index albums_category_idx on public.albums (category_id);
create index albums_cover_photo_idx on public.albums (cover_photo_id);
create index blocks_blocked_idx on public.blocks (blocked_id);
create index booking_addons_addon_idx on public.booking_addons (addon_id);
create index booking_events_actor_idx on public.booking_events (actor_id);
create index booking_offers_created_by_idx on public.booking_offers (created_by);
create index bookings_category_idx on public.bookings (category_id);
create index bookings_package_idx on public.bookings (package_id);
create index cancellation_policies_provider_idx on public.cancellation_policies (provider_id);
create index collection_items_photo_idx on public.collection_items (photo_id);
create index conversations_event_idx on public.conversations (event_id);
create index conversations_provider_idx on public.conversations (provider_id);
create index messages_sender_idx on public.messages (sender_id);
create index messages_shared_album_idx on public.messages (shared_album_id);
create index providers_cancellation_policy_idx on public.providers (cancellation_policy_id);
create index reports_reporter_idx on public.reports (reporter_id);
create index reviews_author_idx on public.reviews (author_id);
create index saved_providers_provider_idx on public.saved_providers (provider_id);
create index swipes_album_idx on public.swipes (album_id);
create index swipes_photo_idx on public.swipes (photo_id);
create index swipes_provider_idx on public.swipes (provider_id);
