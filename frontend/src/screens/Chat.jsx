import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Calendar, ChevronRight, MoreHorizontal, SendHorizontal } from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import { StatusPill } from '../components/Booking.jsx'
import { ModerationSheet } from '../components/PostSheets.jsx'
import { conversationTitle } from './Inbox.jsx'
import { useStore } from '../store.jsx'
import { findPackage, getPerson, img, posts } from '../data/mock.js'

export default function Chat() {
  const { id } = useParams()
  const { conversations, sendMessage, bookings } = useStore()
  const c = conversations.find((x) => x.id === id)
  const [draft, setDraft] = useState('')
  const [menu, setMenu] = useState(null)
  const bottom = useRef()
  const booking = c.bookingId && bookings.find((b) => b.id === c.bookingId)
  const other = getPerson(c.memberIds[0])

  useEffect(() => bottom.current?.scrollIntoView(), [c.messages.length])

  const send = (e) => {
    e.preventDefault()
    if (!draft.trim()) return
    sendMessage(c.id, { text: draft.trim() })
    setDraft('')
  }

  return (
    <div className="chat">
      <TopBar
        title={conversationTitle(c)}
        subtitle={c.kind === 'group' ? `${c.memberIds.length + 1} members` : `@${other.username}`}
        right={
          <button className="icon-btn" onClick={() => setMenu({ what: 'conversation', username: c.kind === 'group' ? null : other.username })}>
            <MoreHorizontal size={20} />
          </button>
        }
      />

      {booking && (
        <Link to={`/bookings/${booking.id}`} className="pinned-booking">
          <Calendar size={18} />
          <div className="grow">
            <b className="small">{findPackage(booking.packageId).pkg.name}</b>
            <div className="muted tiny">{booking.date} · {booking.location}</div>
          </div>
          <StatusPill status={booking.status} />
          <ChevronRight size={16} />
        </Link>
      )}

      <div className="messages">
        {c.kind === 'inquiry' && c.messages.length === 0 && (
          <div className="empty small">Ask {other.name.split(' ')[0]} about availability, pricing or style.</div>
        )}
        {c.messages.map((m, i) => {
          const mine = m.from === 'u0'
          const author = getPerson(m.from)
          const shared = m.sharedPostId && posts.find((p) => p.id === m.sharedPostId)
          return (
            <div key={i} className={`msg ${mine ? 'mine' : ''}`}>
              {!mine && <img className="avatar sm" src={author.avatar} alt="" />}
              <div className="msg-col">
                {!mine && c.kind === 'group' && <div className="muted tiny">{author.name}</div>}
                {shared && (
                  <Link to={`/post/${shared.id}`} className="shared-post">
                    <img src={img(shared.photos[0], 400, 400)} alt="" />
                    <div className="tiny pad-xs">
                      <b>{getPerson(shared.authorId).username}</b> · {shared.exif.focal} · {shared.exif.aperture}
                    </div>
                  </Link>
                )}
                {m.text && (
                  <div className="bubble" onContextMenu={(e) => { e.preventDefault(); setMenu({ what: 'message', username: mine ? null : author.username }) }}>
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
        <input placeholder="Message…" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button className="icon-btn accent" disabled={!draft.trim()} aria-label="Send">
          <SendHorizontal size={20} />
        </button>
      </form>

      <ModerationSheet open={!!menu} onClose={() => setMenu(null)} what={menu?.what} username={menu?.username} />
    </div>
  )
}
