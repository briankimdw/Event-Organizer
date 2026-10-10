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
