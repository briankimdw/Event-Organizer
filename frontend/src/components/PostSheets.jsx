import { useState } from 'react'
import { Link2, Plus, Flag, Ban, Check, Bookmark } from 'lucide-react'
import Sheet from './Sheet.jsx'
import { Loading, EmptyState } from './States.jsx'
import { useStore } from '../store.jsx'
import { useAuth } from '../auth.jsx'
import useQuery from '../lib/useQuery.js'
import { supabase } from '../lib/supabase.js'
import { listConversations, sendMessage } from '../api/messages.js'
import { addToCollection, createCollection, listCollections } from '../api/social.js'

// Share a post or profile into one of my conversations, or copy its link.
// payload: { text?, sharedAlbumId? } — what gets sent as the message.
export function ShareSheet({ open, onClose, link, payload = {} }) {
  const { toast } = useStore()
  const { user } = useAuth()
  const { data: conversations, loading } = useQuery(open && user ? listConversations : null, [open, user?.id])
  const [sent, setSent] = useState(new Set())
  const send = async (c) => {
    setSent(new Set([...sent, c.id]))
    try {
      await sendMessage(c.id, { text: payload.text || (payload.sharedAlbumId ? null : `https://photomatch.app${link}`), sharedAlbumId: payload.sharedAlbumId ?? null })
    } catch (e) {
      console.warn(e)
      toast('Couldn’t send. Try again.')
      setSent((s) => new Set([...s].filter((id) => id !== c.id)))
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Share">
      <button
        className="list-row"
        onClick={() => {
          navigator.clipboard?.writeText(`${window.location.origin}${link}`)
          toast('Link copied')
          onClose()
        }}
      >
        <span className="round-icon"><Link2 size={18} /></span>
        <div className="grow">
          <div>Copy link</div>
          <div className="muted small">{window.location.host}{link}</div>
        </div>
      </button>
      {user && (
        <>
          <div className="section-label">Send in a message</div>
          {loading && <Loading inline />}
          {!loading && !conversations?.length && <div className="muted small" style={{ padding: '4px 16px 12px' }}>No conversations yet.</div>}
          {conversations?.map((c) => (
            <div key={c.id} className="list-row">
              <img className="avatar" src={c.members[0]?.avatar} alt="" />
              <div className="grow">{c.title}</div>
              <button className={`btn sm ${sent.has(c.id) ? 'ghost' : ''}`} disabled={sent.has(c.id)} onClick={() => send(c)}>
                {sent.has(c.id) ? 'Sent' : 'Send'}
              </button>
            </div>
          ))}
        </>
      )}
    </Sheet>
  )
}

// Save a photo into one of my collections (or a new one).
export function SaveSheet({ open, onClose, photoId }) {
  const { toast, markSaved } = useStore()
  const { user } = useAuth()
  const { data: collections, loading, reload } = useQuery(open && user ? listCollections : null, [open, user?.id])
  const [chosen, setChosen] = useState(new Set())

  const pick = async (col) => {
    setChosen(new Set([...chosen, col.id]))
    try {
      await addToCollection(col.id, photoId)
      markSaved(photoId)
      toast(`Saved to ${col.name}`)
    } catch (e) {
      console.warn(e)
      toast('Couldn’t save. Try again.')
    }
  }
  const create = async () => {
    const name = window.prompt('Name your collection')?.trim()
    if (!name) return
    try {
      const col = await createCollection(name.slice(0, 60))
      await pick(col)
      reload()
    } catch (e) {
      console.warn(e)
      toast('Couldn’t create the collection')
    }
  }

  if (!user) {
    return (
      <Sheet open={open} onClose={onClose} title="Save to collection">
        <EmptyState compact icon={Bookmark} title="Sign in to save photos" text="Collections keep the shots you love in one place." />
      </Sheet>
    )
  }
  return (
    <Sheet open={open} onClose={onClose} title="Save to collection">
      {loading && <Loading inline />}
      {collections?.map((col) => (
        <button key={col.id} className="list-row" onClick={() => pick(col)}>
          {col.cover ? <img className="thumb" src={col.cover} alt="" /> : <span className="round-icon"><Bookmark size={18} /></span>}
          <div className="grow">
            <div>{col.name}</div>
            <div className="muted small">{col.count} saved</div>
          </div>
          {(chosen.has(col.id) || col.photoIds.includes(photoId)) && <Check size={18} />}
        </button>
      ))}
      <button className="list-row" onClick={create}>
        <span className="round-icon"><Plus size={18} /></span>
        <div className="grow">New collection</div>
      </button>
    </Sheet>
  )
}

// Block / report. target: { type: 'profile'|'provider'|'album'|'photo'|'message'|'review', id }.
// blockProfileId: the person's profile id (shows "Block @username").
export function ModerationSheet({ open, onClose, what, username, target, blockProfileId }) {
  const { toast } = useStore()
  const { user } = useAuth()
  const act = async (kind) => {
    if (!user) {
      toast('Sign in to report or block')
      return onClose()
    }
    try {
      if (kind === 'report' && target?.id) {
        const { error } = await supabase.from('reports').insert({ target_type: target.type, target_id: target.id, reason: `Reported ${what} from the app` })
        if (error) throw error
      }
      if (kind === 'block' && blockProfileId) {
        const { error } = await supabase.from('blocks').upsert({ blocked_id: blockProfileId }, { ignoreDuplicates: true })
        if (error) throw error
      }
      toast(kind === 'report' ? `Reported ${what}. Our team will review it.` : `Blocked @${username}`)
    } catch (e) {
      console.warn(e)
      toast('Couldn’t send that. Try again.')
    }
    onClose()
  }
  return (
    <Sheet open={open} onClose={onClose}>
      <button className="list-row danger" onClick={() => act('report')}>
        <span className="round-icon"><Flag size={18} /></span>
        <div className="grow">Report {what}</div>
      </button>
      {username && (
        <button className="list-row danger" onClick={() => act('block')}>
          <span className="round-icon"><Ban size={18} /></span>
          <div className="grow">Block @{username}</div>
        </button>
      )}
    </Sheet>
  )
}
