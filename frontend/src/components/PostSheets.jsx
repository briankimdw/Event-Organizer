import { useState } from 'react'
import { Link2, Plus, Flag, Ban, Check } from 'lucide-react'
import Sheet from './Sheet.jsx'
import { useStore } from '../store.jsx'
import { collections, getPerson, img } from '../data/mock.js'

const conversationName = (c) => c.title || c.memberIds.map((id) => getPerson(id).name).join(', ')

// Share a post or profile into a DM, or copy its deep link.
export function ShareSheet({ open, onClose, link, payload }) {
  const { conversations, sendMessage, toast } = useStore()
  const [sent, setSent] = useState(new Set())
  const send = (c) => {
    sendMessage(c.id, payload)
    setSent(new Set([...sent, c.id]))
  }
  return (
    <Sheet open={open} onClose={onClose} title="Share">
      <button
        className="list-row"
        onClick={() => {
          navigator.clipboard?.writeText(`https://photomatch.app${link}`)
          toast('Link copied')
          onClose()
        }}
      >
        <span className="round-icon"><Link2 size={18} /></span>
        <div className="grow">
          <div>Copy link</div>
          <div className="muted small">photomatch.app{link}</div>
        </div>
      </button>
      <div className="section-label">Send in a message</div>
      {conversations.map((c) => (
        <div key={c.id} className="list-row">
          <img className="avatar" src={getPerson(c.memberIds[0]).avatar} alt="" />
          <div className="grow">{conversationName(c)}</div>
          <button className={`btn sm ${sent.has(c.id) ? 'ghost' : ''}`} disabled={sent.has(c.id)} onClick={() => send(c)}>
            {sent.has(c.id) ? 'Sent' : 'Send'}
          </button>
        </div>
      ))}
    </Sheet>
  )
}

export function SaveSheet({ open, onClose, postId }) {
  const { saved, toggleSave, toast } = useStore()
  const [chosen, setChosen] = useState(new Set())
  const pick = (col) => {
    if (!saved.has(postId)) toggleSave(postId)
    setChosen(new Set([...chosen, col.id]))
    toast(`Saved to ${col.name}`)
  }
  return (
    <Sheet open={open} onClose={onClose} title="Save to collection">
      {collections.map((col) => (
        <button key={col.id} className="list-row" onClick={() => pick(col)}>
          <img className="thumb" src={img(col.cover, 120, 120)} alt="" />
          <div className="grow">
            <div>{col.name}</div>
            <div className="muted small">{col.count} saved</div>
          </div>
          {chosen.has(col.id) && <Check size={18} />}
        </button>
      ))}
      <button className="list-row" onClick={() => toast('New collection created')}>
        <span className="round-icon"><Plus size={18} /></span>
        <div className="grow">New collection</div>
      </button>
    </Sheet>
  )
}

// Block / report actions available on every user, post, comment and message.
export function ModerationSheet({ open, onClose, what, username }) {
  const { toast } = useStore()
  const act = (msg) => {
    toast(msg)
    onClose()
  }
  return (
    <Sheet open={open} onClose={onClose}>
      <button className="list-row danger" onClick={() => act(`Reported ${what}. Our team will review it.`)}>
        <span className="round-icon"><Flag size={18} /></span>
        <div className="grow">Report {what}</div>
      </button>
      {username && (
        <button className="list-row danger" onClick={() => act(`Blocked @${username}`)}>
          <span className="round-icon"><Ban size={18} /></span>
          <div className="grow">Block @{username}</div>
        </button>
      )}
    </Sheet>
  )
}
