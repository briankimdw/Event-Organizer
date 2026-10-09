// Inbox: conversations (direct messages, group chats, booking threads,
// inquiries) and their messages. You only ever see conversations you're a
// member of (Row-Level Security); new conversations are created through
// database functions that also enforce blocks.
import { supabase } from '../lib/supabase.js'
import { avatarUrl, photoUrl } from '../lib/format.js'

const must = ({ data, error }) => {
  if (error) throw error
  return data
}

const viewer = async () => (await supabase.auth.getSession()).data.session?.user.id ?? null

// Turn database errors into something to show people.
export const messageError = (err) => {
  const msg = err?.message || ''
  if (/function .* does not exist|Could not find the function/i.test(msg)) return 'Messaging isn’t fully set up yet (database update pending).'
  return msg.replace(/^.*?ERROR:\s*/, '') || 'Something went wrong'
}

export const CONVERSATION_COLUMNS = `
  id, kind, title, booking_id, provider_id, created_at, last_message_at,
  provider:providers!conversations_provider_id_fkey(id, display_name, profile_id),
  booking:bookings!conversations_booking_id_fkey(id, status, time_range, package_snapshot),
  members:conversation_members(profile_id, last_read_at, joined_at,
    profile:profiles!conversation_members_profile_id_fkey(id, username, display_name, avatar_path,
      listing:providers!providers_profile_id_fkey(id, display_name, status)))`

const toMember = (m, row) => {
  // In inquiries/booking threads the photographer shows under their business name.
  const listing = (m.profile?.listing || []).find((l) => l.status === 'active') || null
  const isThreadProvider = row.provider && row.provider.profile_id === m.profile_id
  const name = isThreadProvider ? row.provider.display_name : m.profile?.display_name || m.profile?.username || 'Someone'
  return {
    // Link target for /u/:id: the photographer listing if they have one, else the profile.
    id: isThreadProvider ? row.provider.id : listing?.id ?? m.profile_id,
    profileId: m.profile_id,
    name,
    username: m.profile?.username,
    avatar: avatarUrl(m.profile?.avatar_path, name),
    isPhotographer: !!(isThreadProvider || listing),
    lastReadAt: m.last_read_at,
  }
}

// A conversations row as the object screens use, from the viewer's side.
function toConversation(row, uid, last = null) {
  const me = row.members.find((m) => m.profile_id === uid)
  const others = row.members.filter((m) => m.profile_id !== uid).map((m) => toMember(m, row))
  const lastAt = last?.created_at || row.last_message_at
  return {
    id: row.id,
    kind: row.kind, // 'direct' | 'group' | 'booking' | 'inquiry' | 'event'
    isGroup: row.kind === 'group',
    title: row.title || others.map((o) => (row.kind === 'group' ? o.name.split(' ')[0] : o.name)).join(', ') || 'Just you',
    customTitle: row.title,
    bookingId: row.booking_id,
    booking: row.booking ? { id: row.booking.id, status: row.booking.status, packageName: row.booking.package_snapshot?.name } : null,
    providerId: row.provider_id,
    members: others, // everyone except me
    memberIds: others.map((o) => o.id),
    myLastReadAt: me?.last_read_at ?? null,
    lastMessage: last ? { text: last.body || (last.shared_album_id ? 'Shared a post' : ''), fromMe: last.sender_id === uid, at: last.created_at, senderId: last.sender_id } : null,
    lastMessageAt: lastAt || row.created_at,
    unread: !!(last && last.sender_id !== uid && (!me?.last_read_at || me.last_read_at < last.created_at)),
  }
}

// My conversations, most recent first, each with its last message.
export async function listConversations() {
  const uid = await viewer()
  if (!uid) return []
  const rows = must(await supabase.from('conversations').select(CONVERSATION_COLUMNS).order('last_message_at', { ascending: false, nullsFirst: false }).limit(100))
  if (!rows.length) return []
  // The last message of each conversation (small parallel queries; each uses the (conversation_id, created_at) index).
  const lasts = await Promise.all(
    rows.map((r) =>
      supabase
        .from('messages')
        .select('conversation_id, body, shared_album_id, sender_id, created_at')
        .eq('conversation_id', r.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .then(({ data }) => data?.[0] ?? null),
    ),
  )
  return rows
    .map((r, i) => toConversation(r, uid, lasts[i]))
    // Empty threads you started but never wrote in stay out of the list (except booking threads).
    .filter((c) => c.lastMessage || c.kind === 'booking' || c.kind === 'group')
    .sort((a, b) => (b.lastMessageAt || '').localeCompare(a.lastMessageAt || ''))
}

export async function getConversation(id) {
  const uid = await viewer()
  const row = must(await supabase.from('conversations').select(CONVERSATION_COLUMNS).eq('id', id).maybeSingle())
  return row ? toConversation(row, uid) : null
}

// How many conversations have unread messages (for the tab badge).
export async function unreadCount() {
  const list = await listConversations()
  return list.filter((c) => c.unread).length
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export const MESSAGE_COLUMNS = `
  id, conversation_id, sender_id, body, shared_album_id, created_at,
  album:albums!messages_shared_album_id_fkey(id, title, provider_id, cover:photos!albums_cover_photo_fk(display_path))`

const toMessage = (m, uid) => ({
  id: m.id,
  conversationId: m.conversation_id,
  from: m.sender_id,
  mine: m.sender_id === uid,
  text: m.body ?? '',
  sharedAlbum: m.album ? { id: m.album.id, title: m.album.title, providerId: m.album.provider_id, cover: photoUrl(m.album.cover?.display_path) } : null,
  sharedAlbumId: m.shared_album_id,
  at: m.created_at,
  time: new Date(m.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
})

// The latest messages of a conversation, oldest first.
export async function listMessages(conversationId, limit = 300) {
  const uid = await viewer()
  const rows = must(await supabase.from('messages').select(MESSAGE_COLUMNS).eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(limit))
  return rows.reverse().map((m) => toMessage(m, uid))
}

// Send a message (text and/or a shared album). Returns the saved message.
export async function sendMessage(conversationId, { text = null, sharedAlbumId = null }) {
  const uid = await viewer()
  const row = must(
    await supabase
      .from('messages')
      .insert({ conversation_id: conversationId, body: text?.trim() || null, shared_album_id: sharedAlbumId })
      .select(MESSAGE_COLUMNS)
      .single(),
  )
  return toMessage(row, uid)
}

export async function markRead(conversationId) {
  const uid = await viewer()
  if (!uid) return
  await supabase.from('conversation_members').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', conversationId).eq('profile_id', uid)
}

// ---------------------------------------------------------------------------
// Starting conversations
// ---------------------------------------------------------------------------

// "Ask a question": open (or reopen) an inquiry thread with a photographer. Returns its id.
export const startInquiry = async (providerId) => must(await supabase.rpc('start_inquiry', { p_provider_id: providerId }))

// Open (or reopen) a one-to-one thread with anyone. Returns its id.
export const startDirectMessage = async (profileId) => must(await supabase.rpc('start_direct_message', { p_profile_id: profileId }))

// New group with at least two other people. Returns its id.
export const createGroup = async (title, profileIds) => must(await supabase.rpc('create_group_chat', { p_title: title || null, p_member_ids: profileIds }))

export const addGroupMembers = async (conversationId, profileIds) =>
  must(await supabase.rpc('add_group_members', { p_conversation_id: conversationId, p_member_ids: profileIds }))

export const renameGroup = async (conversationId, title) => must(await supabase.rpc('rename_group', { p_conversation_id: conversationId, p_title: title }))

export const leaveGroup = async (conversationId) => must(await supabase.rpc('leave_group', { p_conversation_id: conversationId }))

// People to message: matches on name or @username (everyone, photographers and
// clients), minus me and anyone I've blocked. Empty query = people I've talked to.
export async function searchPeople(q = '') {
  const uid = await viewer()
  const term = q.trim().replace(/^@/, '').replace(/[%_,()]/g, ' ').trim()
  const blocked = uid ? new Set(must(await supabase.from('blocks').select('blocked_id').eq('blocker_id', uid)).map((b) => b.blocked_id)) : new Set()

  let rows
  if (!term) {
    if (!uid) return []
    const convs = await listConversations()
    const seen = new Map()
    for (const c of convs) for (const m of c.members) if (!seen.has(m.profileId)) seen.set(m.profileId, m)
    return [...seen.values()].filter((p) => !blocked.has(p.profileId)).slice(0, 20).map((p) => ({ ...p, recent: true }))
  }
  rows = must(
    await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_path, city, listing:providers!providers_profile_id_fkey(id, display_name, status)')
      .or(`display_name.ilike.%${term}%,username.ilike.%${term}%`)
      .neq('display_name', '')
      .limit(25),
  )
  return rows
    .filter((r) => r.id !== uid && !blocked.has(r.id))
    .map((r) => {
      const listing = (r.listing || []).find((l) => l.status === 'active') || null
      const name = r.display_name || r.username
      return { id: listing?.id ?? r.id, profileId: r.id, name, username: r.username, avatar: avatarUrl(r.avatar_path, name), city: r.city, isPhotographer: !!listing, businessName: listing?.display_name ?? null }
    })
}

// ---------------------------------------------------------------------------
// Live updates (Supabase Realtime)
// ---------------------------------------------------------------------------

let channelSeq = 0

// One conversation: new messages, read receipts and "typing…".
//   const live = openChat(id, { onMessage, onRead, onTyping })
//   live.typing()   // tell the others I'm typing (throttled)
//   live.close()
export function openChat(conversationId, { onMessage, onRead, onTyping } = {}) {
  let uid = null
  let me = null
  viewer().then((id) => (uid = id))
  supabase.auth.getSession().then(({ data }) => (me = data.session?.user ?? null))

  // Message + read-receipt events (database changes, filtered by RLS).
  const db = supabase
    .channel(`chat-db:${conversationId}:${++channelSeq}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, async (payload) => {
      const { data } = await supabase.from('messages').select(MESSAGE_COLUMNS).eq('id', payload.new.id).maybeSingle()
      onMessage?.(toMessage(data || payload.new, uid))
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_members', filter: `conversation_id=eq.${conversationId}` }, (payload) => {
      if (payload.new.profile_id !== uid) onRead?.(payload.new.profile_id, payload.new.last_read_at)
    })
    .subscribe()

  // Typing indicator: a broadcast between the people who have the chat open (nothing is stored).
  const live = supabase
    .channel(`typing:${conversationId}`, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (payload?.profileId && payload.profileId !== uid) onTyping?.(payload.profileId)
    })
    .subscribe()

  let lastTyping = 0
  return {
    typing() {
      const now = Date.now()
      if (now - lastTyping < 2500 || !me) return
      lastTyping = now
      live.send({ type: 'broadcast', event: 'typing', payload: { profileId: me.id } }).catch(() => {})
    },
    close() {
      supabase.removeChannel(db)
      supabase.removeChannel(live)
    },
  }
}

// Back-compat: new messages in one conversation. Returns an unsubscribe function.
export function subscribeToMessages(conversationId, onMessage) {
  const live = openChat(conversationId, { onMessage })
  return () => live.close()
}

// Anything new for me anywhere (a message in any of my conversations, or a
// read marker moving): calls onChange (debounced). For the inbox list and the tab badge.
export function subscribeToInbox(onChange) {
  let timer
  const fire = () => {
    clearTimeout(timer)
    timer = setTimeout(onChange, 300)
  }
  const channel = supabase
    .channel(`inbox:${++channelSeq}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, fire)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_members' }, fire)
    .subscribe()
  return () => {
    clearTimeout(timer)
    supabase.removeChannel(channel)
  }
}
