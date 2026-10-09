-- Messaging between any two people (direct messages) and group chats.
--
-- Before this, conversations only came from bookings (one thread per booking)
-- and inquiries (client -> photographer). Conversations and members can't be
-- inserted directly through the API (no insert policies), so everything goes
-- through the security-definer functions below, which also enforce blocks.

alter type public.conversation_kind add value if not exists 'direct';

-- Has either person blocked the other?
create or replace function public.is_blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b) or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;
revoke execute on function public.is_blocked_between(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Direct messages: open (or reopen) the one-to-one thread with someone.
-- ---------------------------------------------------------------------------
create or replace function public.start_direct_message(p_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_conversation uuid;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = 'insufficient_privilege';
  end if;
  if p_profile_id is null or p_profile_id = v_uid then
    raise exception 'You can''t message yourself';
  end if;
  if not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception 'Person not found';
  end if;
  if public.is_blocked_between(v_uid, p_profile_id) then
    raise exception 'You can''t message this person';
  end if;

  -- An existing direct thread with exactly these two people.
  select c.id into v_conversation
  from public.conversations c
  where c.kind = 'direct'
    and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.profile_id = v_uid)
    and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.profile_id = p_profile_id)
  limit 1;

  if v_conversation is null then
    insert into public.conversations (kind) values ('direct') returning id into v_conversation;
    insert into public.conversation_members (conversation_id, profile_id)
    values (v_conversation, v_uid), (v_conversation, p_profile_id);
  end if;
  return v_conversation;
end;
$$;

-- ---------------------------------------------------------------------------
-- Group chats
-- ---------------------------------------------------------------------------
create or replace function public.create_group_chat(p_title text, p_member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_members uuid[];
  v_conversation uuid;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = 'insufficient_privilege';
  end if;
  select coalesce(array_agg(distinct m), '{}') into v_members
  from unnest(coalesce(p_member_ids, '{}')) m
  where m is not null and m <> v_uid and exists (select 1 from public.profiles p where p.id = m);
  if cardinality(v_members) < 2 then
    raise exception 'Add at least two people to start a group';
  end if;
  if cardinality(v_members) > 30 then
    raise exception 'Groups can have up to 31 people';
  end if;
  if exists (select 1 from unnest(v_members) m where public.is_blocked_between(v_uid, m)) then
    raise exception 'You can''t add someone you''ve blocked (or who blocked you)';
  end if;

  insert into public.conversations (kind, title)
  values ('group', nullif(left(trim(coalesce(p_title, '')), 80), ''))
  returning id into v_conversation;
  insert into public.conversation_members (conversation_id, profile_id)
  select v_conversation, m from unnest(array_append(v_members, v_uid)) m;
  return v_conversation;
end;
$$;

-- Add people to a group you're in.
create or replace function public.add_group_members(p_conversation_id uuid, p_member_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_added integer;
begin
  if not exists (select 1 from public.conversations c where c.id = p_conversation_id and c.kind = 'group')
     or not public.is_conversation_member(p_conversation_id) then
    raise exception 'Group not found';
  end if;
  if exists (select 1 from unnest(coalesce(p_member_ids, '{}')) m where public.is_blocked_between(v_uid, m)) then
    raise exception 'You can''t add someone you''ve blocked (or who blocked you)';
  end if;
  if (select count(*) from public.conversation_members where conversation_id = p_conversation_id)
     + cardinality(coalesce(p_member_ids, '{}')) > 31 then
    raise exception 'Groups can have up to 31 people';
  end if;
  insert into public.conversation_members (conversation_id, profile_id)
  select p_conversation_id, m from unnest(p_member_ids) m
  where exists (select 1 from public.profiles p where p.id = m)
  on conflict do nothing;
  get diagnostics v_added = row_count;
  return v_added;
end;
$$;

-- Rename a group you're in.
create or replace function public.rename_group(p_conversation_id uuid, p_title text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.conversations c where c.id = p_conversation_id and c.kind = 'group')
     or not public.is_conversation_member(p_conversation_id) then
    raise exception 'Group not found';
  end if;
  update public.conversations set title = nullif(left(trim(coalesce(p_title, '')), 80), '') where id = p_conversation_id;
end;
$$;

-- Leave a group (booking threads, inquiries and direct messages can't be left).
create or replace function public.leave_group(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.conversations c where c.id = p_conversation_id and c.kind = 'group')
     or not public.is_conversation_member(p_conversation_id) then
    raise exception 'Group not found';
  end if;
  delete from public.conversation_members where conversation_id = p_conversation_id and profile_id = (select auth.uid());
end;
$$;

revoke execute on function public.start_direct_message(uuid) from public, anon;
revoke execute on function public.create_group_chat(text, uuid[]) from public, anon;
revoke execute on function public.add_group_members(uuid, uuid[]) from public, anon;
revoke execute on function public.rename_group(uuid, text) from public, anon;
revoke execute on function public.leave_group(uuid) from public, anon;
grant execute on function public.start_direct_message(uuid) to authenticated;
grant execute on function public.create_group_chat(text, uuid[]) to authenticated;
grant execute on function public.add_group_members(uuid, uuid[]) to authenticated;
grant execute on function public.rename_group(uuid, text) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Blocks apply to one-to-one threads: if either person blocked the other,
-- neither can send there. (Group chats stay usable; the app hides blocked
-- people's messages.)
-- ---------------------------------------------------------------------------
create or replace function public.messages_block_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.conversations c
    join public.conversation_members m on m.conversation_id = c.id and m.profile_id <> new.sender_id
    where c.id = new.conversation_id
      and c.kind in ('direct', 'inquiry', 'booking')
      and public.is_blocked_between(new.sender_id, m.profile_id)
  ) then
    raise exception 'You can''t message this person' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
revoke execute on function public.messages_block_check() from public, anon, authenticated;

drop trigger if exists messages_block_check on public.messages;
create trigger messages_block_check
  before insert on public.messages
  for each row execute function public.messages_block_check();

-- ---------------------------------------------------------------------------
-- Read receipts update live ("Seen"): stream read-marker changes too.
-- (Realtime applies RLS: members only see members of their own conversations.)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversation_members'
  ) then
    alter publication supabase_realtime add table public.conversation_members;
  end if;
end $$;
