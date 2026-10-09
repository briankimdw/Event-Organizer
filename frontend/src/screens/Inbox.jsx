import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Briefcase, MessageCircle, Search, Users } from 'lucide-react'
import ProfileLink from '../components/ProfileLink.jsx'
import { EmptyState, ErrorState, Loading, SignInPrompt } from '../components/States.jsx'
import { useAuth } from '../auth.jsx'
import useQuery from '../lib/useQuery.js'
import { ago } from '../lib/dates.js'
import { listConversations } from '../api/messages.js'

const preview = (c) => {
  const last = c.lastMessage
  if (!last) return 'Say hi 👋'
  return (last.fromMe ? 'You: ' : '') + (last.text || 'Shared a post')
}

export default function Inbox() {
  const { user, loading: authLoading } = useAuth()
  const { data, loading, error, reload } = useQuery(user ? listConversations : null, [user?.id])
  const [q, setQ] = useState('')

  const query = q.trim().toLowerCase()
  const list = (data || []).filter(
    (c) => !query || c.title.toLowerCase().includes(query) || c.lastMessage?.text?.toLowerCase().includes(query) || c.booking?.packageName?.toLowerCase().includes(query),
  )

  return (
    <div>
      <header className="home-header">
        <div className="title-lg">Messages</div>
      </header>
      {authLoading ? (
        <Loading />
      ) : !user ? (
        <SignInPrompt title="Sign in to see your messages" text="Chat with photographers about bookings, pricing and style." />
      ) : (
        <>
          <div className="pad-x">
            <div className="search">
              <Search size={16} />
              <input placeholder="Search messages" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          {loading && !data ? (
            <Loading />
          ) : error ? (
            <ErrorState error={error} onRetry={reload} />
          ) : !data?.length ? (
            <EmptyState
              icon={MessageCircle}
              title="No messages yet"
              text="Ask a photographer a question from their profile, or request a booking to start a thread."
              action={<Link className="btn sm ghost" to="/search">Find photographers</Link>}
            />
          ) : !list.length ? (
            <EmptyState compact icon={Search} title="No matches" text={`Nothing matches “${q.trim()}”.`} />
          ) : (
            <div className="mt-sm">
              {list.map((c) => {
                const [first, second] = c.members
                return (
                  <Link key={c.id} to={`/inbox/${c.id}`} className={`convo ${c.unread ? 'unread' : ''}`}>
                    <div className="convo-avatar">
                      {first && <ProfileLink id={first.id}><img className="avatar" src={first.avatar} alt="" /></ProfileLink>}
                      {c.kind === 'group' && second && <img className="avatar stacked" src={second.avatar} alt="" />}
                    </div>
                    <div className="grow ellipsis">
                      <div className="row gap-xs">
                        <b>{c.title}</b>
                        {c.kind === 'booking' && <span className="tag"><Briefcase size={10} /> Booking</span>}
                        {c.kind === 'inquiry' && <span className="tag">Inquiry</span>}
                        {c.kind === 'group' && <span className="tag"><Users size={10} /> Group</span>}
                      </div>
                      <div className={`small ellipsis ${c.unread ? '' : 'muted'}`}>{preview(c)}</div>
                    </div>
                    <div className="convo-meta">
                      <div className="muted tiny">{ago(c.lastMessage?.at || c.lastMessageAt)}</div>
                      {c.unread && <span className="unread-dot" aria-label="Unread" />}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
