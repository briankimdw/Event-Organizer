-- 0006: messaging, two-sided reviews, discovery (swipes, shortlist, collections),
-- follows, notifications, reports and blocks.

create type public.conversation_kind as enum ('inquiry', 'booking', 'group', 'event');
create type public.review_direction as enum ('client_to_provider', 'provider_to_client');
create type public.swipe_action as enum ('like', 'pass', 'save');
create type public.correction_kind as enum ('tag', 'provider');
create type public.report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------
create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  kind            public.conversation_kind not null,
  provider_id     uuid references public.providers (id) on delete cascade,  -- inquiries + booking threads
  booking_id      uuid unique references public.bookings (id) on delete cascade,
  event_id        uuid references public.events (id) on delete cascade,
  title           text check (char_length(title) <= 80),                    -- group chats
  created_at      timestamptz not null default now(),
  last_message_at timestamptz
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  last_read_at    timestamptz,
  joined_at       timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);

create index conversation_members_profile_idx on public.conversation_members (profile_id);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body            text check (char_length(body) between 1 and 4000),
  shared_album_id uuid references public.albums (id) on delete set null,
  created_at      timestamptz not null default now(),
  check (body is not null or shared_album_id is not null)
);

create index messages_conversation_idx on public.messages (conversation_id, created_at);

create function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_members m
    where m.conversation_id = p_conversation_id and m.profile_id = (select auth.uid())
  );
$$;

alter table public.conversations enable row level security;

create policy "Members see their conversations"
  on public.conversations for select
  to authenticated
  using ((select public.is_conversation_member(id)));

alter table public.conversation_members enable row level security;

create policy "Members see who is in their conversations"
  on public.conversation_members for select
  to authenticated
  using ((select public.is_conversation_member(conversation_id)));

create policy "Members update their own read marker"
  on public.conversation_members for update
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

revoke update on public.conversation_members from anon, authenticated;
grant update (last_read_at) on public.conversation_members to authenticated;

alter table public.messages enable row level security;

create policy "Members read messages"
  on public.messages for select
  to authenticated
  using ((select public.is_conversation_member(conversation_id)));

create policy "Members send messages as themselves"
  on public.messages for insert
  to authenticated
  with check (sender_id = (select auth.uid()) and (select public.is_conversation_member(conversation_id)));

create function public.touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation();

-- Live updates for chat.
alter publication supabase_realtime add table public.messages;

-- Start (or reopen) an inquiry with a provider: "Ask a question".
create function public.start_inquiry(p_provider_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_owner uuid;
  v_conversation uuid;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = 'insufficient_privilege';
  end if;
  select profile_id into v_owner from public.providers where id = p_provider_id and status = 'active';
  if v_owner is null then
    raise exception 'Provider not found';
  end if;
  if v_owner = v_uid then
    raise exception 'You can''t message yourself';
  end if;

  select c.id into v_conversation
  from public.conversations c
  join public.conversation_members m on m.conversation_id = c.id and m.profile_id = v_uid
  where c.kind = 'inquiry' and c.provider_id = p_provider_id
  limit 1;

  if v_conversation is null then
    insert into public.conversations (kind, provider_id) values ('inquiry', p_provider_id)
    returning id into v_conversation;
    insert into public.conversation_members (conversation_id, profile_id)
    values (v_conversation, v_uid), (v_conversation, v_owner);
  end if;
  return v_conversation;
end;
$$;

revoke execute on function public.start_inquiry(uuid) from public, anon;
grant execute on function public.start_inquiry(uuid) to authenticated;

-- Every booking gets its own thread between the client and the provider.
create function public.create_booking_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation uuid;
  v_owner uuid;
begin
  select profile_id into v_owner from public.providers where id = new.provider_id;
  insert into public.conversations (kind, provider_id, booking_id) values ('booking', new.provider_id, new.id)
  returning id into v_conversation;
  insert into public.conversation_members (conversation_id, profile_id)
  values (v_conversation, new.client_id), (v_conversation, v_owner)
  on conflict do nothing;
  return new;
end;
$$;

create trigger bookings_create_conversation
  after insert on public.bookings
  for each row execute function public.create_booking_conversation();

-- ---------------------------------------------------------------------------
-- Reviews: two-sided and double-blind. Only after a completed booking.
-- ---------------------------------------------------------------------------
create table public.reviews (
  id                 uuid primary key default gen_random_uuid(),
  booking_id         uuid not null references public.bookings (id) on delete cascade,
  provider_id        uuid not null references public.providers (id) on delete cascade,
  author_id          uuid not null references public.profiles (id) on delete cascade,
  subject_profile_id uuid not null references public.profiles (id) on delete cascade,
  direction          public.review_direction not null,
  rating             smallint not null check (rating between 1 and 5),
  body               text check (char_length(body) <= 2000),
  created_at         timestamptz not null default now(),
  revealed_at        timestamptz,
  unique (booking_id, direction)
);

create index reviews_provider_idx on public.reviews (provider_id) where revealed_at is not null;
create index reviews_subject_idx on public.reviews (subject_profile_id) where revealed_at is not null;

alter table public.reviews enable row level security;

create policy "Revealed reviews are public; authors see their own"
  on public.reviews for select
  to anon, authenticated
  using (revealed_at is not null or author_id = (select auth.uid()));
-- No insert/update policies: use submit_review().

-- Keep provider and client ratings in sync with revealed reviews.
create function public.refresh_review_aggregates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.revealed_at is null then
    return new;
  end if;
  if new.direction = 'client_to_provider' then
    update public.providers p set
      rating_avg = s.avg, rating_count = s.cnt
    from (
      select round(avg(rating), 2) as avg, count(*)::integer as cnt
      from public.reviews
      where provider_id = new.provider_id and direction = 'client_to_provider' and revealed_at is not null
    ) s
    where p.id = new.provider_id;
  else
    update public.profiles pr set
      client_rating_avg = s.avg, client_rating_count = s.cnt
    from (
      select round(avg(rating), 2) as avg, count(*)::integer as cnt
      from public.reviews
      where subject_profile_id = new.subject_profile_id and direction = 'provider_to_client' and revealed_at is not null
    ) s
    where pr.id = new.subject_profile_id;
  end if;
  return new;
end;
$$;

create trigger reviews_refresh_aggregates
  after insert or update of revealed_at on public.reviews
  for each row execute function public.refresh_review_aggregates();

-- Leave a review within 14 days of completion. Both reviews are revealed at
-- once when the second one arrives (or by the scheduled job after 14 days).
create function public.submit_review(p_booking_id uuid, p_rating smallint, p_body text default null)
returns public.reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  b public.bookings;
  v_owner uuid;
  v_review public.reviews;
begin
  select * into b from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Booking not found';
  end if;
  select profile_id into v_owner from public.providers where id = b.provider_id;
  if v_uid is distinct from b.client_id and v_uid is distinct from v_owner then
    raise exception 'Booking not found';
  end if;
  if b.status <> 'completed' or b.completed_at < now() - interval '14 days' then
    raise exception 'Reviews open when a booking is completed and close after 14 days';
  end if;

  insert into public.reviews (booking_id, provider_id, author_id, subject_profile_id, direction, rating, body)
  values (
    b.id, b.provider_id, v_uid,
    case when v_uid = b.client_id then v_owner else b.client_id end,
    case when v_uid = b.client_id then 'client_to_provider'::public.review_direction
         else 'provider_to_client'::public.review_direction end,
    p_rating, p_body
  )
  returning * into v_review;

  if (select count(*) from public.reviews where booking_id = b.id) = 2 then
    update public.reviews set revealed_at = now() where booking_id = b.id and revealed_at is null;
    select * into v_review from public.reviews where id = v_review.id;
  end if;
  return v_review;
exception when unique_violation then
  raise exception 'You already reviewed this booking';
end;
$$;

revoke execute on function public.submit_review(uuid, smallint, text) from public, anon;
grant execute on function public.submit_review(uuid, smallint, text) to authenticated;

select cron.schedule(
  'reveal-reviews', '15 * * * *',
  $$update public.reviews r set revealed_at = now()
    from public.bookings b
    where r.booking_id = b.id and r.revealed_at is null and b.completed_at < now() - interval '14 days'$$
);

-- ---------------------------------------------------------------------------
-- Discovery: swipes (training data for the recommender), taste corrections,
-- the shortlist, collections, follows.
-- ---------------------------------------------------------------------------
create table public.swipes (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  photo_id     uuid references public.photos (id) on delete set null,
  album_id     uuid references public.albums (id) on delete set null,
  provider_id  uuid references public.providers (id) on delete cascade,
  action       public.swipe_action not null,
  dwell_ms     integer check (dwell_ms >= 0),
  position     integer,
  session_id   uuid,
  reason_shown text,
  created_at   timestamptz not null default now()
);

create index swipes_user_idx on public.swipes (user_id, created_at desc);

alter table public.swipes enable row level security;

create policy "Users log their own swipes"
  on public.swipes for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users see their own swipes"
  on public.swipes for select
  to authenticated
  using (user_id = (select auth.uid()));

create table public.taste_corrections (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind       public.correction_kind not null,
  value      text not null check (char_length(value) <= 80),
  created_at timestamptz not null default now(),
  unique (user_id, kind, value)
);

alter table public.taste_corrections enable row level security;

create policy "Users manage their taste corrections"
  on public.taste_corrections for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create table public.saved_providers (
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  provider_id uuid not null references public.providers (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, provider_id)
);

alter table public.saved_providers enable row level security;

create policy "Users manage their shortlist"
  on public.saved_providers for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create table public.collections (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now()
);

create index collections_owner_idx on public.collections (owner_id);

alter table public.collections enable row level security;

create policy "Users manage their collections"
  on public.collections for all
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create table public.collection_items (
  collection_id uuid not null references public.collections (id) on delete cascade,
  photo_id      uuid not null references public.photos (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (collection_id, photo_id)
);

alter table public.collection_items enable row level security;

create policy "Users manage items in their collections"
  on public.collection_items for all
  to authenticated
  using (exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = (select auth.uid())));

create table public.follows (
  follower_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  provider_id uuid not null references public.providers (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, provider_id)
);

create index follows_provider_idx on public.follows (provider_id);

alter table public.follows enable row level security;

create policy "Follows are public"
  on public.follows for select
  to anon, authenticated
  using (true);

create policy "Users follow and unfollow"
  on public.follows for insert
  to authenticated
  with check (follower_id = (select auth.uid()));

create policy "Users unfollow"
  on public.follows for delete
  to authenticated
  using (follower_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Notifications (created by server code and triggers)
-- ---------------------------------------------------------------------------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       text not null,
  payload    jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "Users see their notifications"
  on public.notifications for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Users mark their notifications read"
  on public.notifications for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke update on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- Safety: reports and blocks
-- ---------------------------------------------------------------------------
create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('profile', 'provider', 'album', 'photo', 'message', 'review')),
  target_id   uuid not null,
  reason      text not null check (char_length(reason) between 1 and 1000),
  status      public.report_status not null default 'open',
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

create index reports_status_idx on public.reports (status, created_at);

alter table public.reports enable row level security;

create policy "Users file reports"
  on public.reports for insert
  to authenticated
  with check (reporter_id = (select auth.uid()));

create policy "Reporters and admins see reports"
  on public.reports for select
  to authenticated
  using (reporter_id = (select auth.uid()) or (select public.is_admin()));

create policy "Admins handle reports"
  on public.reports for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create table public.blocks (
  blocker_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.blocks enable row level security;

create policy "Users manage their blocks"
  on public.blocks for all
  to authenticated
  using (blocker_id = (select auth.uid()))
  with check (blocker_id = (select auth.uid()));
