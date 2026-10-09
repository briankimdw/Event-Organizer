// Inbox: conversations (booking threads, inquiries, group chats) and messages.
// You only ever see conversations you're a member of (Row-Level Security).
import { supabase } from '../lib/supabase.js'
import { avatarUrl, photoUrl } from '../lib/format.js'

const must = ({ data, error }) => {
  if (error) throw error
  return data
}

const viewer = async () => (await supabase.auth.getSession()).data.session?.user.id ?? null

export const CONVERSATION_COLUMNS = `
  id, kind, title, booking_id, provider_id, created_at, last_message_at,
  provider:providers!conversations_provider_id_fkey(id, display_name, profile_id),
  booking:bookings!conversations_booking_id_fkey(id, status, time_range, package_snapshot),
  members:conversation_members(profile_id, last_read_at,
    profile:profiles!conversation_members_profile_id_fkey(id, username, display_name, avatar_path))`

// A conversations row as the object screens use, from the viewer's side.
function toConversation(row, uid, last = null) {
  const me = row.members.find((m) => m.profile_id === uid)
  const others = row.members.filter((m) => m.profile_id !== uid).map((m) => {
    const isProvider = row.provider && row.provider.profile_id === m.profile_id
    const name = isProvider ? row.provider.display_name : m.profile?.display_name || m.profile?.username
    return {
      // Link target for /u/:id: the photographer listing for providers, else the profile.
      id: isProvider ? row.provider.id : m.profile_id,
      profileId: m.profile_id,
      name,
      username: m.profile?.username,
      avatar: avatarUrl(m.profile?.avatar_path, name),
    }
  })
  return {
    id: row.id,
    kind: row.kind, // 'booking' | 'inquiry' | 'group' | 'event'
    title: row.title || others.map((o) => o.name).join(', ') || 'Conversation',
    bookingId: row.booking_id,
    booking: row.booking ? { id: row.booking.id, status: row.booking.status, packageName: row.booking.package_snapshot?.name } : null,
    providerId: row.provider_id,
    members: others, // everyone except me
    memberIds: others.map((o) => o.id),
    lastMessage: last ? { text: last.body || (last.shared_album_id ? 'Shared a post' : ''), fromMe: last.sender_id === uid, at: last.created_at } : null,
    lastMessageAt: row.last_message_at || row.created_at,
    unread: !!(row.last_message_at && last && last.sender_id !== uid && (!me?.last_read_at || me.last_read_at < row.last_message_at)),
  }
}

// My conversations, most recent first, each with its last message.
export async function listConversations() {
  const uid = await viewer()
  if (!uid) return []
  const rows = must(
    await supabase.from('conversations').select(CONVERSATION_COLUMNS).order('last_message_at', { ascending: false, nullsFirst: false }),
  )
  if (!rows.length) return []
  // Last message per conversation (one small query instead of N).
  const recent = must(
    await supabase
      .from('messages')
      .select('conversation_id, body, shared_album_id, sender_id, created_at')
      .in('conversation_id', rows.map((r) => r.id))
      .order('created_at', { ascending: false })
      .limit(200),
  )
  const lastBy = new Map()
  for (const m of recent) if (!lastBy.has(m.conversation_id)) lastBy.set(m.conversation_id, m)
  return rows.map((r) => toConversation(r, uid, lastBy.get(r.id)))
}

export async function getConversation(id) {
  const uid = await viewer()
  const row = must(await supabase.from('conversations').select(CONVERSATION_COLUMNS).eq('id', id).maybeSingle())
  return row ? toConversation(row, uid) : null
}

export const MESSAGE_COLUMNS = `
  id, conversation_id, sender_id, body, shared_album_id, created_at,
  album:albums!messages_shared_album_id_fkey(id, title, provider_id, cover:photos!albums_cover_photo_fk(display_path))`

const toMessage = (m, uid) => ({
  id: m.id,
  from: m.sender_id,
  mine: m.sender_id === uid,
  text: m.body ?? '',
  sharedAlbum: m.album ? { id: m.album.id, title: m.album.title, providerId: m.album.provider_id, cover: photoUrl(m.album.cover?.display_path) } : null,
  sharedAlbumId: m.shared_album_id,
  at: m.created_at,
  time: new Date(m.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
})

export async function listMessages(conversationId) {
  const uid = await viewer()
  const rows = must(
    await supabase.from('messages').select(MESSAGE_COLUMNS).eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(500),
  )
  return rows.map((m) => toMessage(m, uid))
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

// Live updates: calls onMessage(message) for every new message in the conversation.
// Returns an unsubscribe function.
export function subscribeToMessages(conversationId, onMessage) {
  let uid = null
  viewer().then((id) => (uid = id))
  const channel = supabase
    .channel(`messages:${conversationId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, async (payload) => {
      // Re-read to get the shared album embed (and to respect RLS).
      const { data } = await supabase.from('messages').select(MESSAGE_COLUMNS).eq('id', payload.new.id).maybeSingle()
      onMessage(toMessage(data || payload.new, uid))
    })
    .subscribe()
  return () => supabase.removeChannel(channel)
}

export async function markRead(conversationId) {
  const uid = await viewer()
  if (!uid) return
  await supabase.from('conversation_members').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', conversationId).eq('profile_id', uid)
}

// "Ask a question": open (or reopen) an inquiry thread with a photographer. Returns its id.
export const startInquiry = async (providerId) => must(await supabase.rpc('start_inquiry', { p_provider_id: providerId }))

// How many conversations have unread messages (for the tab badge).
export async function unreadCount() {
  const list = await listConversations()
  return list.filter((c) => c.unread).length
}
