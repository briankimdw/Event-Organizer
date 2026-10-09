import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Calendar, ChevronRight, MessageCircle, MoreHorizontal, SendHorizontal } from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import { StatusPill } from '../components/Booking.jsx'
import { ModerationSheet } from '../components/PostSheets.jsx'
import ProfileLink from '../components/ProfileLink.jsx'
import { EmptyState, ErrorState, Loading, SignInPrompt } from '../components/States.jsx'
import { useStore } from '../store.jsx'
import { useAuth } from '../auth.jsx'
import useQuery from '../lib/useQuery.js'
import { avatarUrl } from '../lib/format.js'
import { getConversation, listMessages, markRead, sendMessage, subscribeToMessages } from '../api/messages.js'
import { getBooking } from '../api/bookings.js'

const loadThread = async (id) => {
  const [conversation, messages] = await Promise.all([getConversation(id), listMessages(id)])
  return { conversation, messages }
}

// Append a message unless we already have it (our own sends also arrive via realtime).
const withMessage = (msg) => (d) => (!d || d.messages.some((m) => m.id === msg.id) ? d : { ...d, messages: [...d.messages, msg] })

export default function Chat() {
  const { id } = useParams()
  const { toast } = useStore()
  const { user, loading: authLoading } = useAuth()
  const { data, loading, error, reload, setData } = useQuery(user ? () => loadThread(id) : null, [id, user?.id])
  const c = data?.conversation
  const messages = data?.messages || []
  const { data: booking } = useQuery(c?.bookingId ? () => getBooking(c.bookingId) : null, [c?.bookingId])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [menu, setMenu] = useState(null)
  const bottom = useRef()

  // Mark read on open, then listen for new messages.
  const ready = !!c
  useEffect(() => {
    if (!ready) return
    markRead(id).catch((e) => console.warn(e))
    const unsubscribe = subscribeToMessages(id, (msg) => {
      setData(withMessage(msg))
      if (!msg.mine) markRead(id).catch((e) => console.warn(e))
    })
    return unsubscribe
  }, [id, ready, setData])

  useEffect(() => bottom.current?.scrollIntoView(), [messages.length])

  const send = async (e) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    setDraft('')
    try {
      setData(withMessage(await sendMessage(id, { text })))
    } catch (err) {
      console.warn(err)
      setDraft(text)
      toast('Couldn’t send. Try again.')
    } finally {
      setSending(false)
    }
  }

  if (authLoading || (loading && !data)) {
    return (
      <div className="chat">
        <TopBar title="Messages" />
        <Loading />
      </div>
    )
  }
  if (!user) {
    return (
      <div className="chat">
        <TopBar title="Messages" />
        <SignInPrompt title="Sign in to see this conversation" />
      </div>
    )
  }
  if (error) {
    return (
      <div className="chat">
        <TopBar title="Messages" />
        <ErrorState error={error} onRetry={reload} />
      </div>
    )
  }
  if (!c) {
    return (
      <div className="chat">
        <TopBar title="Messages" />
        <EmptyState
          icon={MessageCircle}
          title="Conversation not found"
          text="It may have been removed, or you’re not part of it."
          action={<Link className="btn sm ghost" to="/inbox">Back to messages</Link>}
        />
      </div>
    )
  }

  const isGroup = c.kind === 'group'
  const other = c.members[0]
  const byProfile = new Map(c.members.map((m) => [m.profileId, m]))
  const authorOf = (m) => byProfile.get(m.from) || { id: m.from, profileId: m.from, name: 'Former member', avatar: avatarUrl(null, '?') }
  const pinned = c.bookingId ? { status: booking?.status ?? c.booking?.status, name: booking?.packageName ?? c.booking?.packageName ?? 'Booking' } : null

  return (
    <div className="chat">
      <TopBar
        title={isGroup || !other ? c.title : <ProfileLink id={other.id}>{c.title}</ProfileLink>}
        subtitle={isGroup ? `${c.members.length + 1} members` : other?.username ? `@${other.username}` : null}
        right={
          <button
            className="icon-btn"
            aria-label="More"
            onClick={() =>
              setMenu({
                what: 'conversation',
                username: isGroup ? null : other?.username,
                target: !isGroup && other ? { type: 'profile', id: other.profileId } : null,
                blockProfileId: isGroup ? null : other?.profileId,
              })
            }
          >
            <MoreHorizontal size={20} />
          </button>
        }
      />

      {pinned && (
        <Link to={`/bookings/${c.bookingId}`} className="pinned-booking">
          <Calendar size={18} />
          <div className="grow">
            <b className="small">{pinned.name}</b>
            {booking && <div className="muted tiny">{[booking.date, booking.location].filter(Boolean).join(' · ')}</div>}
          </div>
          {pinned.status && <StatusPill status={pinned.status} />}
          <ChevronRight size={16} />
        </Link>
      )}

      <div className="messages">
        {messages.length === 0 && (
          <div className="empty small">
            {c.kind === 'inquiry' && other ? `Ask ${other.name?.split(' ')[0] || 'them'} about availability, pricing or style.` : 'No messages yet. Say hi.'}
          </div>
        )}
        {messages.map((m) => {
          const author = m.mine ? null : authorOf(m)
          const shared = m.sharedAlbum
          return (
            <div key={m.id} className={`msg ${m.mine ? 'mine' : ''}`}>
              {!m.mine && <ProfileLink id={author.id}><img className="avatar sm" src={author.avatar} alt="" /></ProfileLink>}
              <div className="msg-col">
                {!m.mine && isGroup && <ProfileLink id={author.id} className="muted tiny">{author.name}</ProfileLink>}
                {shared && (
                  <Link to={`/gallery/${shared.providerId}?post=${shared.id}`} className="shared-post">
                    {shared.cover && <img src={shared.cover} alt="" loading="lazy" />}
                    <div className="tiny pad-xs"><b>{shared.title || 'Album'}</b></div>
                  </Link>
                )}
                {!shared && m.sharedAlbumId && <div className="bubble muted">Shared a post that’s no longer available</div>}
                {m.text && (
                  <div
                    className="bubble"
                    title={m.time}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      if (m.mine) return
                      setMenu({ what: 'message', username: author.username, target: { type: 'message', id: m.id }, blockProfileId: author.profileId })
                    }}
                  >
                    {m.text}
                  </div>
                )}
              </div>
            </div>
          )
        })}
        <div ref={bottom} />
      </div>

      <form className="composer sticky-bottom" onSubmit={send}>
        <input placeholder="Message…" maxLength={4000} value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button className="icon-btn accent" disabled={!draft.trim() || sending} aria-label="Send">
          <SendHorizontal size={20} />
        </button>
      </form>

      <ModerationSheet
        open={!!menu}
        onClose={() => setMenu(null)}
        what={menu?.what}
        username={menu?.username}
        target={menu?.target}
        blockProfileId={menu?.blockProfileId}
      />
    </div>
  )
}
