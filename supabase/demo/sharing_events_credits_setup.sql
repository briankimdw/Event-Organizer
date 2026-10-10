-- SHARING + EVENTS WITH FRIENDS + POST CREDITS: paste this whole file into the
-- Supabase SQL Editor and run it. Safe to run more than once.
--
-- Prerequisite: supabase/demo/all_verticals_setup.sql has been run (it has).
-- The following files concatenated in this order (if you change one, update this file too):
--   1. supabase/migrations/20261011000000_share_cards.sql  (Share cards: vendor/event shares in chat with a safe preview)
--   2. supabase/migrations/20261011000100_event_groups.sql  (Events with friends: group chat, invites, hiring board, votes)
--   3. supabase/migrations/20261011000200_post_credits.sql  (Post credits: tag the other vendors who worked an event)
--   4. records 1-3 in supabase_migrations.schema_migrations

-- ============================================================================
-- 1. 20261011000000_share_cards.sql
-- ============================================================================
-- Share cards in chat ("Send to"): a message can carry a post (shared_album_id,
-- already there), a vendor (shared_provider_id) or an event (shared_event_id).
--
-- share_preview: a small snapshot of the shared thing, written by the database
-- (never by the client) when the message is sent:
--   post     { kind, id, title, provider_id, vendor, cover }
--   provider { kind, id, name, slug, avatar }
--   event    { kind, id, title, type, starts_at, ends_at, location_text, cover }
--
-- Why a snapshot for events: events are private (only event members can read
-- the row). People in a chat where an event was shared are usually NOT members,
-- so the card can't read the event. Rather than open the events table (or a
-- function that would have to decide who may see which event), the sender, who
-- must be a member, hands over a fixed set of safe fields at send time. Budget,
-- guest count, members and notes never leave the events table. Members can still
-- open the live event; everyone else sees the card as it was when it was sent.
-- The snapshot also keeps a card readable after its post, vendor or event is
-- deleted (the foreign key is set to null; the preview remains).

alter table public.messages
  add column if not exists shared_provider_id uuid references public.providers (id) on delete set null,
  add column if not exists shared_event_id    uuid references public.events (id) on delete set null,
  add column if not exists share_preview      jsonb;

-- One shared thing per message, and a message needs text or something shared.
alter table public.messages drop constraint if exists messages_check;
alter table public.messages drop constraint if exists messages_body_or_attachment;
alter table public.messages drop constraint if exists messages_one_attachment;

-- Older post shares without text: give them a preview so deleting the post
-- doesn't trip the "needs text or an attachment" rule.
update public.messages m
set share_preview = jsonb_strip_nulls(jsonb_build_object('kind', 'post', 'id', a.id, 'title', a.title, 'provider_id', a.provider_id))
from public.albums a
where a.id = m.shared_album_id and m.share_preview is null;

alter table public.messages
  add constraint messages_body_or_attachment check (
    body is not null or shared_album_id is not null or shared_provider_id is not null
    or shared_event_id is not null or share_preview is not null
  ),
  add constraint messages_one_attachment check (
    num_nonnulls(shared_album_id, shared_provider_id, shared_event_id) <= 1
  );

-- Foreign keys with "on delete set null" need an index on the referencing side.
create index if not exists messages_shared_provider_idx on public.messages (shared_provider_id) where shared_provider_id is not null;
create index if not exists messages_shared_event_idx on public.messages (shared_event_id) where shared_event_id is not null;

-- ---------------------------------------------------------------------------
-- Fill share_preview on insert (and check the sender may share the thing).
-- Runs as the table owner so it can read the event the sender belongs to.
-- ---------------------------------------------------------------------------
create or replace function public.messages_share_preview()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_preview jsonb;
begin
  -- Never trust a client-supplied preview.
  new.share_preview := null;

  if new.shared_event_id is not null then
    if not exists (
      select 1 from public.events e
      where e.id = new.shared_event_id
        and (e.owner_id = new.sender_id
             or exists (select 1 from public.event_members em where em.event_id = e.id and em.profile_id = new.sender_id))
    ) then
      raise exception 'You can only share events you''re part of' using errcode = 'insufficient_privilege';
    end if;
    -- to_jsonb(e) lets a later cover column (cover_path) flow through without a change here.
    select jsonb_strip_nulls(jsonb_build_object(
             'kind', 'event',
             'id', e.id,
             'title', e.title,
             'type', e.type,
             'starts_at', e.starts_at,
             'ends_at', e.ends_at,
             'location_text', e.location_text,
             'cover', to_jsonb(e) ->> 'cover_path'))
      into v_preview
    from public.events e
    where e.id = new.shared_event_id;

  elsif new.shared_provider_id is not null then
    select jsonb_strip_nulls(jsonb_build_object(
             'kind', 'provider',
             'id', p.id,
             'name', p.display_name,
             'slug', p.slug,
             'avatar', pr.avatar_path))
      into v_preview
    from public.providers p
    left join public.profiles pr on pr.id = p.profile_id
    where p.id = new.shared_provider_id
      and (p.status = 'active' or p.profile_id = new.sender_id);
    if v_preview is null then
      raise exception 'Vendor not found';
    end if;

  elsif new.shared_album_id is not null then
    select jsonb_strip_nulls(jsonb_build_object(
             'kind', 'post',
             'id', a.id,
             'title', a.title,
             'provider_id', a.provider_id,
             'vendor', p.display_name,
             'cover', ph.display_path))
      into v_preview
    from public.albums a
    join public.providers p on p.id = a.provider_id
    left join public.photos ph on ph.id = a.cover_photo_id
    where a.id = new.shared_album_id
      and (a.status = 'published' or p.profile_id = new.sender_id);
    if v_preview is null then
      raise exception 'Post not found';
    end if;
  end if;

  new.share_preview := v_preview;
  return new;
end;
$$;
revoke execute on function public.messages_share_preview() from public, anon, authenticated;

drop trigger if exists messages_share_preview on public.messages;
create trigger messages_share_preview
  before insert on public.messages
  for each row execute function public.messages_share_preview();

-- Messages have no update policy, so clients can't change a card (or its
-- preview) after sending.

-- ============================================================================
-- 2. 20261011000100_event_groups.sql
-- ============================================================================
-- Events with friends: plan one event together, like a group chat built around it.
--
-- * Every event gets a group chat (a conversations row of kind 'event' with
--   event_id), created automatically when the event is created. Its title
--   follows the event's title.
-- * Event members (owner + co-planners) are kept in sync with the chat's
--   members by triggers: inviting someone adds them to the chat, leaving or
--   being removed takes them out.
-- * "Who we're hiring": candidate vendors per event (event_candidates), with
--   a status (considering -> shortlisted -> booked) and thumbs-up votes from
--   members (event_candidate_votes). Bookings that carry this event_id show as
--   booked in the app (event_bookings() lets co-planners see them).
--
-- Only event members can see or change any of it (Row-Level Security).
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Candidates and votes
-- ---------------------------------------------------------------------------
create table if not exists public.event_candidates (
  event_id      uuid not null references public.events (id) on delete cascade,
  provider_id   uuid not null references public.providers (id) on delete cascade,
  vertical_slug text not null check (vertical_slug ~ '^[a-z0-9-]{2,40}$'),
  status        text not null default 'considering' check (status in ('considering', 'shortlisted', 'booked')),
  added_by      uuid default auth.uid() references public.profiles (id) on delete set null,
  note          text check (char_length(note) <= 500),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (event_id, provider_id)
);

create index if not exists event_candidates_provider_idx on public.event_candidates (provider_id);
create index if not exists event_candidates_added_by_idx on public.event_candidates (added_by);

drop trigger if exists event_candidates_updated_at on public.event_candidates;
create trigger event_candidates_updated_at
  before update on public.event_candidates
  for each row execute function extensions.moddatetime (updated_at);

create table if not exists public.event_candidate_votes (
  event_id    uuid not null,
  provider_id uuid not null,
  profile_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (event_id, provider_id, profile_id),
  foreign key (event_id, provider_id) references public.event_candidates (event_id, provider_id) on delete cascade
);

create index if not exists event_candidate_votes_profile_idx on public.event_candidate_votes (profile_id);

alter table public.event_candidates enable row level security;
alter table public.event_candidate_votes enable row level security;

drop policy if exists "Members see the event's candidates" on public.event_candidates;
create policy "Members see the event's candidates"
  on public.event_candidates for select
  to authenticated
  using ((select public.is_event_member(event_id)));

drop policy if exists "Members add candidates" on public.event_candidates;
create policy "Members add candidates"
  on public.event_candidates for insert
  to authenticated
  with check ((select public.is_event_member(event_id)) and added_by = (select auth.uid()));

drop policy if exists "Members update candidates" on public.event_candidates;
create policy "Members update candidates"
  on public.event_candidates for update
  to authenticated
  using ((select public.is_event_member(event_id)))
  with check ((select public.is_event_member(event_id)));

drop policy if exists "Members remove candidates" on public.event_candidates;
create policy "Members remove candidates"
  on public.event_candidates for delete
  to authenticated
  using ((select public.is_event_member(event_id)));

-- Only the status and note change after a candidate is added.
revoke update on public.event_candidates from anon, authenticated;
grant update (status, note) on public.event_candidates to authenticated;
revoke all on public.event_candidates, public.event_candidate_votes from anon;

drop policy if exists "Members see votes" on public.event_candidate_votes;
create policy "Members see votes"
  on public.event_candidate_votes for select
  to authenticated
  using ((select public.is_event_member(event_id)));

drop policy if exists "Members vote for themselves" on public.event_candidate_votes;
create policy "Members vote for themselves"
  on public.event_candidate_votes for insert
  to authenticated
  with check (profile_id = (select auth.uid()) and (select public.is_event_member(event_id)));

drop policy if exists "Members take back their vote" on public.event_candidate_votes;
create policy "Members take back their vote"
  on public.event_candidate_votes for delete
  to authenticated
  using (profile_id = (select auth.uid()));

-- Owners always see their own events. (Before this, `insert ... returning` on
-- events failed RLS: the owner's member row is only added by an AFTER trigger,
-- so "Members see their events" didn't match the new row yet.)
drop policy if exists "Members see their events" on public.events;
create policy "Members see their events"
  on public.events for select
  to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_event_member(id)));

-- One chat per event.
create unique index if not exists conversations_one_chat_per_event
  on public.conversations (event_id) where kind = 'event';

-- ---------------------------------------------------------------------------
-- 2. The event's chat, created with the event and kept in sync
-- ---------------------------------------------------------------------------

-- The event's chat id (or null).
create or replace function public.event_chat_id(p_event_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.conversations c where c.event_id = p_event_id and c.kind = 'event' limit 1;
$$;
revoke execute on function public.event_chat_id(uuid) from public, anon, authenticated;

-- Create the chat for an event (if it has none) with every current member in it.
create or replace function public.ensure_event_chat_for(p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation uuid := public.event_chat_id(p_event_id);
  v_title text;
begin
  if v_conversation is null then
    select left(e.title, 80) into v_title from public.events e where e.id = p_event_id;
    if not found then
      return null;
    end if;
    insert into public.conversations (kind, event_id, title)
    values ('event', p_event_id, v_title)
    on conflict do nothing
    returning id into v_conversation;
    v_conversation := coalesce(v_conversation, public.event_chat_id(p_event_id));
  end if;
  insert into public.conversation_members (conversation_id, profile_id)
  select v_conversation, m.profile_id from public.event_members m where m.event_id = p_event_id
  on conflict do nothing;
  return v_conversation;
end;
$$;
revoke execute on function public.ensure_event_chat_for(uuid) from public, anon, authenticated;

create or replace function public.events_create_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.ensure_event_chat_for(new.id);
  return new;
end;
$$;
revoke execute on function public.events_create_chat() from public, anon, authenticated;

-- Runs after events_add_owner (triggers fire in name order), so the owner is already a member.
drop trigger if exists events_create_chat on public.events;
create trigger events_create_chat
  after insert on public.events
  for each row execute function public.events_create_chat();

-- Renaming the event renames its chat.
create or replace function public.events_sync_chat_title()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations set title = left(new.title, 80) where event_id = new.id and kind = 'event';
  return new;
end;
$$;
revoke execute on function public.events_sync_chat_title() from public, anon, authenticated;

drop trigger if exists events_sync_chat_title on public.events;
create trigger events_sync_chat_title
  after update of title on public.events
  for each row when (old.title is distinct from new.title)
  execute function public.events_sync_chat_title();

-- Event members <-> chat members.
create or replace function public.event_members_sync_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.conversation_members (conversation_id, profile_id)
    select c.id, new.profile_id from public.conversations c where c.event_id = new.event_id and c.kind = 'event'
    on conflict do nothing;
    return new;
  end if;
  delete from public.conversation_members cm
  using public.conversations c
  where c.id = cm.conversation_id and c.event_id = old.event_id and c.kind = 'event' and cm.profile_id = old.profile_id;
  return old;
end;
$$;
revoke execute on function public.event_members_sync_chat() from public, anon, authenticated;

drop trigger if exists event_members_sync_chat on public.event_members;
create trigger event_members_sync_chat
  after insert or delete on public.event_members
  for each row execute function public.event_members_sync_chat();

-- The owner can't be removed while the event exists (deleting the event still cascades).
create or replace function public.event_members_keep_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'owner' and exists (select 1 from public.events e where e.id = old.event_id and e.owner_id = old.profile_id) then
    raise exception 'The event''s owner can''t leave it. Delete the event instead.';
  end if;
  return old;
end;
$$;
revoke execute on function public.event_members_keep_owner() from public, anon, authenticated;

drop trigger if exists event_members_keep_owner on public.event_members;
create trigger event_members_keep_owner
  before delete on public.event_members
  for each row execute function public.event_members_keep_owner();

-- Backfill: events made before this migration get their chat.
do $$
declare
  r record;
begin
  for r in select e.id from public.events e where public.event_chat_id(e.id) is null loop
    perform public.ensure_event_chat_for(r.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Functions the app calls
-- ---------------------------------------------------------------------------

-- A short system-style line in the event chat, sent as the current user.
create or replace function public.post_event_note(p_event_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation uuid := public.event_chat_id(p_event_id);
begin
  if v_conversation is null or (select auth.uid()) is null or coalesce(trim(p_body), '') = '' then
    return;
  end if;
  insert into public.messages (conversation_id, sender_id, body)
  values (v_conversation, (select auth.uid()), left(p_body, 4000));
end;
$$;
revoke execute on function public.post_event_note(uuid, text) from public, anon, authenticated;

create or replace function public.first_name_of(p_profile_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(split_part(trim(p.display_name), ' ', 1), ''), p.username::text, 'Someone')
  from public.profiles p where p.id = p_profile_id;
$$;
revoke execute on function public.first_name_of(uuid) from public, anon, authenticated;

-- Invite people to an event (any member can): they become co-planners and join its chat.
-- Returns how many were added. Skips people already in it; refuses blocked people.
create or replace function public.invite_to_event(p_event_id uuid, p_profile_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_new uuid[];
  v_names text;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = 'insufficient_privilege';
  end if;
  if not public.is_event_member(p_event_id) then
    raise exception 'Event not found';
  end if;
  select coalesce(array_agg(distinct m), '{}') into v_new
  from unnest(coalesce(p_profile_ids, '{}')) m
  where m is not null
    and exists (select 1 from public.profiles p where p.id = m)
    and not exists (select 1 from public.event_members em where em.event_id = p_event_id and em.profile_id = m);
  if cardinality(v_new) = 0 then
    return 0;
  end if;
  if exists (select 1 from unnest(v_new) m where public.is_blocked_between(v_uid, m)) then
    raise exception 'You can''t add someone you''ve blocked (or who blocked you)';
  end if;
  if (select count(*) from public.event_members where event_id = p_event_id) + cardinality(v_new) > 50 then
    raise exception 'Events can have up to 50 planners';
  end if;

  perform public.ensure_event_chat_for(p_event_id);
  insert into public.event_members (event_id, profile_id, role)
  select p_event_id, m, 'co_planner' from unnest(v_new) m
  on conflict do nothing;

  select string_agg(public.first_name_of(m), ', ') into v_names from unnest(v_new) m;
  perform public.post_event_note(p_event_id, format('%s added %s to the planning', public.first_name_of(v_uid), v_names));
  return cardinality(v_new);
end;
$$;

-- Create an event with its chat, optionally inviting people. Returns { event_id, conversation_id }.
create or replace function public.create_event_with_chat(
  p_title text,
  p_type text default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_location_text text default null,
  p_guest_count integer default null,
  p_budget_cents bigint default null,
  p_invite_ids uuid[] default '{}',
  p_status public.event_status default 'planning'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_event uuid;
  v_conversation uuid;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'Give the event a name';
  end if;
  insert into public.events (owner_id, title, type, starts_at, ends_at, location_text, guest_count, budget_cents, status)
  values (v_uid, left(trim(p_title), 120), nullif(trim(coalesce(p_type, '')), ''), p_starts_at,
          case when p_ends_at is not null and p_starts_at is not null and p_ends_at < p_starts_at then p_starts_at else p_ends_at end,
          nullif(left(trim(coalesce(p_location_text, '')), 200), ''), p_guest_count, p_budget_cents, coalesce(p_status, 'planning'))
  returning id into v_event;
  v_conversation := public.ensure_event_chat_for(v_event);
  if cardinality(coalesce(p_invite_ids, '{}')) > 0 then
    perform public.invite_to_event(v_event, p_invite_ids);
  end if;
  return jsonb_build_object('event_id', v_event, 'conversation_id', v_conversation);
end;
$$;

-- Leave an event you co-plan (and its chat). Owners delete the event instead.
create or replace function public.leave_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if not public.is_event_member(p_event_id) then
    raise exception 'Event not found';
  end if;
  if exists (select 1 from public.events e where e.id = p_event_id and e.owner_id = v_uid) then
    raise exception 'You own this event. Delete it instead, or ask someone else to keep planning.';
  end if;
  perform public.post_event_note(p_event_id, format('%s left the planning', public.first_name_of(v_uid)));
  delete from public.event_members where event_id = p_event_id and profile_id = v_uid;
end;
$$;

-- The owner removes a co-planner (and takes them out of the chat).
create or replace function public.remove_event_member(p_event_id uuid, p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if not exists (select 1 from public.events e where e.id = p_event_id and e.owner_id = v_uid) then
    raise exception 'Only the event''s owner can remove people';
  end if;
  if p_profile_id = v_uid then
    raise exception 'You own this event. Delete it instead.';
  end if;
  delete from public.event_members where event_id = p_event_id and profile_id = p_profile_id;
end;
$$;

-- The event's chat id for a member (creates it for events that somehow have none).
create or replace function public.ensure_event_chat(p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_event_member(p_event_id) then
    raise exception 'Event not found';
  end if;
  return public.ensure_event_chat_for(p_event_id);
end;
$$;

-- Add a vendor to the board (or move it to another category) and say so in the chat.
create or replace function public.add_event_candidate(
  p_event_id uuid,
  p_provider_id uuid,
  p_vertical_slug text default null,
  p_note text default null
)
returns public.event_candidates
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_vertical text;
  v_vertical_name text;
  v_provider text;
  v_row public.event_candidates;
  v_existed boolean;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = 'insufficient_privilege';
  end if;
  if not public.is_event_member(p_event_id) then
    raise exception 'Event not found';
  end if;
  select p.display_name, sc.slug, sc.name into v_provider, v_vertical, v_vertical_name
  from public.providers p
  join public.service_categories sc on sc.id = p.vertical_id
  where p.id = p_provider_id and p.status = 'active';
  if not found then
    raise exception 'Vendor not found';
  end if;
  if nullif(trim(coalesce(p_vertical_slug, '')), '') is not null then
    v_vertical := lower(trim(p_vertical_slug));
    v_vertical_name := coalesce((select sc.name from public.service_categories sc where sc.slug = v_vertical), initcap(replace(v_vertical, '-', ' ')));
  end if;

  v_existed := exists (select 1 from public.event_candidates c where c.event_id = p_event_id and c.provider_id = p_provider_id);
  insert into public.event_candidates (event_id, provider_id, vertical_slug, added_by, note)
  values (p_event_id, p_provider_id, v_vertical, v_uid, nullif(left(trim(coalesce(p_note, '')), 500), ''))
  on conflict (event_id, provider_id) do update
    set vertical_slug = excluded.vertical_slug,
        note = coalesce(excluded.note, public.event_candidates.note)
  returning * into v_row;

  if not v_existed then
    perform public.post_event_note(p_event_id, format('%s added %s to %s', public.first_name_of(v_uid), v_provider, v_vertical_name));
  end if;
  return v_row;
end;
$$;

-- Move a candidate along (considering -> shortlisted -> booked); shortlisting and booking are announced.
create or replace function public.set_event_candidate_status(p_event_id uuid, p_provider_id uuid, p_status text)
returns public.event_candidates
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.event_candidates;
  v_old text;
  v_provider text;
begin
  if not public.is_event_member(p_event_id) then
    raise exception 'Event not found';
  end if;
  select status into v_old from public.event_candidates where event_id = p_event_id and provider_id = p_provider_id;
  if not found then
    raise exception 'That vendor isn''t on this event''s board';
  end if;
  update public.event_candidates set status = p_status
  where event_id = p_event_id and provider_id = p_provider_id
  returning * into v_row;
  if v_old is distinct from p_status and p_status in ('shortlisted', 'booked') then
    select display_name into v_provider from public.providers where id = p_provider_id;
    perform public.post_event_note(p_event_id, format('%s %s %s', public.first_name_of(v_uid),
      case p_status when 'booked' then 'marked as booked:' else 'shortlisted' end, v_provider));
  end if;
  return v_row;
end;
$$;

-- Bookings attached to an event, for everyone planning it (bookings themselves stay private
-- to the client and the vendor, so co-planners see only these few fields).
create or replace function public.event_bookings(p_event_id uuid)
returns table (
  id uuid,
  provider_id uuid,
  client_id uuid,
  status public.booking_status,
  starts_at timestamptz,
  total_cents integer,
  currency text,
  package_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.provider_id, b.client_id, b.status, lower(b.time_range), b.total_cents, b.currency, b.package_snapshot ->> 'name'
  from public.bookings b
  where b.event_id = p_event_id and public.is_event_member(p_event_id)
  order by lower(b.time_range);
$$;

revoke execute on function public.invite_to_event(uuid, uuid[]) from public, anon;
revoke execute on function public.create_event_with_chat(text, text, timestamptz, timestamptz, text, integer, bigint, uuid[], public.event_status) from public, anon;
revoke execute on function public.leave_event(uuid) from public, anon;
revoke execute on function public.remove_event_member(uuid, uuid) from public, anon;
revoke execute on function public.ensure_event_chat(uuid) from public, anon;
revoke execute on function public.add_event_candidate(uuid, uuid, text, text) from public, anon;
revoke execute on function public.set_event_candidate_status(uuid, uuid, text) from public, anon;
revoke execute on function public.event_bookings(uuid) from public, anon;
grant execute on function public.invite_to_event(uuid, uuid[]) to authenticated;
grant execute on function public.create_event_with_chat(text, text, timestamptz, timestamptz, text, integer, bigint, uuid[], public.event_status) to authenticated;
grant execute on function public.leave_event(uuid) to authenticated;
grant execute on function public.remove_event_member(uuid, uuid) to authenticated;
grant execute on function public.ensure_event_chat(uuid) to authenticated;
grant execute on function public.add_event_candidate(uuid, uuid, text, text) to authenticated;
grant execute on function public.set_event_candidate_status(uuid, uuid, text) to authenticated;
grant execute on function public.event_bookings(uuid) to authenticated;

-- Live board: candidate and vote changes stream to everyone planning (Realtime applies RLS).
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'event_candidates') then
    alter publication supabase_realtime add table public.event_candidates;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'event_candidate_votes') then
    alter publication supabase_realtime add table public.event_candidate_votes;
  end if;
end $$;

-- ============================================================================
-- 3. 20261011000200_post_credits.sql
-- ============================================================================
-- Post credits: on a post (album), tag the other vendors who worked that event
-- (a florist credits the photographer and the venue). Credits show on the post
-- as tappable vendor chips, and as "Tagged in" on the credited vendor's profile.
--
-- Also seeds one tag per occasion (tags.slug 'occasion-<occasion slug>') so a
-- post's occasion can be stored in album_tags. The app creates missing ones
-- itself (any signed-in user can add 'user' tags), so the seed is only tidiness.
--
-- Safe to run more than once.

create table if not exists public.album_credits (
  album_id    uuid not null references public.albums (id) on delete cascade,
  provider_id uuid not null references public.providers (id) on delete cascade,
  -- What they did, e.g. 'Photographer', 'Venue', 'Second shooter'. Null = their vertical.
  role        text check (role is null or char_length(role) between 1 and 40),
  created_at  timestamptz not null default now(),
  primary key (album_id, provider_id)
);

-- "Tagged in" on a vendor's profile: newest first.
create index if not exists album_credits_provider_idx on public.album_credits (provider_id, created_at desc);

-- At most 20 credits on one post.
create or replace function public.album_credits_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.album_credits c where c.album_id = new.album_id) >= 20 then
    raise exception 'A post can credit at most 20 vendors' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.album_credits_limit() from public, anon, authenticated;

drop trigger if exists album_credits_limit on public.album_credits;
create trigger album_credits_limit
  before insert on public.album_credits
  for each row execute function public.album_credits_limit();

alter table public.album_credits enable row level security;

-- Credits are visible wherever the post is (published + active listing, or the owner / an admin).
drop policy if exists "Credits follow their post's visibility" on public.album_credits;
create policy "Credits follow their post's visibility"
  on public.album_credits for select
  to anon, authenticated
  using ((select public.can_view_album(album_id)));

-- The post's owner credits active vendors, never their own listing on that post.
drop policy if exists "Owners credit vendors on their posts" on public.album_credits;
create policy "Owners credit vendors on their posts"
  on public.album_credits for insert
  to authenticated
  with check (
    (select public.owns_album(album_id))
    and exists (select 1 from public.providers p where p.id = provider_id and p.status = 'active')
    and not exists (select 1 from public.albums a where a.id = album_id and a.provider_id = album_credits.provider_id)
  );

-- The owner removes credits; a credited vendor can remove themselves.
drop policy if exists "Owners and credited vendors remove credits" on public.album_credits;
create policy "Owners and credited vendors remove credits"
  on public.album_credits for delete
  to authenticated
  using ((select public.owns_album(album_id)) or (select public.owns_provider(provider_id)));

-- Credits are added or removed, never edited.
revoke update on public.album_credits from anon, authenticated;

-- Occasion tags (slugs match OCCASIONS in frontend/src/verticals/catalog.js).
insert into public.tags (slug, name, kind) values
  ('occasion-wedding', 'Wedding', 'genre'),
  ('occasion-birthday', 'Birthday', 'genre'),
  ('occasion-graduation', 'Graduation', 'genre'),
  ('occasion-engagement', 'Proposal', 'genre'),
  ('occasion-corporate', 'Corporate', 'genre'),
  ('occasion-baby-shower', 'Baby shower', 'genre'),
  ('occasion-quinceanera', 'Quinceañera', 'genre'),
  ('occasion-dinner-party', 'Dinner party', 'genre'),
  ('occasion-bachelor', 'Bachelor/ette', 'genre'),
  ('occasion-holiday-party', 'Holiday party', 'genre')
on conflict (slug) do nothing;

-- ============================================================================
-- 4. Migration history (what `supabase db push` / the MCP check)
-- ============================================================================
do $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    insert into supabase_migrations.schema_migrations (version, name)
    values ('20261011000000', 'share_cards'),
           ('20261011000100', 'event_groups'),
           ('20261011000200', 'post_credits')
    on conflict (version) do nothing;
  end if;
end $$;

-- Check: all three should be true.
select to_regclass('public.event_candidates') is not null as event_groups,
       to_regclass('public.album_credits') is not null as post_credits,
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'messages'
               and column_name = 'shared_event_id') as share_cards;
