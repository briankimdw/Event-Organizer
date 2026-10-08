import { Link } from 'react-router-dom'
import { Briefcase, Search, Users } from 'lucide-react'
import { useStore } from '../store.jsx'
import { getPerson } from '../data/mock.js'

export const conversationTitle = (c) => c.title || c.memberIds.map((id) => getPerson(id).name).join(', ')

const preview = (c) => {
  const last = c.messages[c.messages.length - 1]
  if (!last) return 'Say hi 👋'
  const who = last.from === 'u0' ? 'You: ' : c.kind === 'group' ? `${getPerson(last.from).name.split(' ')[0]}: ` : ''
  return who + (last.sharedPostId && !last.text ? 'Shared a post' : last.text)
}

export default function Inbox() {
  const { conversations } = useStore()
  return (
    <div>
      <header className="home-header">
        <div className="title-lg">Messages</div>
      </header>
      <div className="pad-x">
        <div className="search">
          <Search size={16} />
          <input placeholder="Search messages" />
        </div>
      </div>
      <div className="mt-sm">
        {conversations.map((c) => {
          const first = getPerson(c.memberIds[0])
          return (
            <Link key={c.id} to={`/inbox/${c.id}`} className="convo">
              <div className="convo-avatar">
                <img className="avatar" src={first.avatar} alt="" />
                {c.kind === 'group' && <img className="avatar stacked" src={getPerson(c.memberIds[1]).avatar} alt="" />}
              </div>
              <div className="grow ellipsis">
                <div className="row gap-xs">
                  <b>{conversationTitle(c)}</b>
                  {c.kind === 'booking' && <span className="tag"><Briefcase size={10} /> Booking</span>}
                  {c.kind === 'inquiry' && <span className="tag">Inquiry</span>}
                  {c.kind === 'group' && <span className="tag"><Users size={10} /> Group</span>}
                </div>
                <div className="muted small ellipsis">{preview(c)}</div>
              </div>
              <div className="muted tiny">{c.messages[c.messages.length - 1]?.time}</div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
