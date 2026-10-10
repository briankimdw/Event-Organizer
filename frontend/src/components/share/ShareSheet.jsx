import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Link2, Search, Share2, Users } from 'lucide-react'
import Sheet from '../Sheet.jsx'
import { Loading } from '../States.jsx'
import { useAuth } from '../../auth.jsx'
import { useStore } from '../../store.jsx'
import useQuery from '../../lib/useQuery.js'
import {
  listConversations, mergeShareTargets, messageError, searchPeople, shareLink, shareRecipients, shareSupport, shareToChats,
} from '../../api/messages.js'
import './share.css'

const MAX_PICK = 20
const KIND_NOUN = { post: 'post', provider: 'vendor', event: 'event', plan: 'plan' }

// "Send to" sheet (like Instagram's): pick recent chats or people, add a note,
// Send. Each chosen chat gets one message with a card. Copy link and the
// system share sheet are secondary actions.
//
//   <ShareSheet item={{ kind: 'post'|'provider'|'event'|'plan', id, title?, image?, subtitle?, providerId?, link? }} onClose={...} />
//
// Mount it when it should show (or pass open={bool}). kind 'plan' (an unsaved
// plan) only offers the link actions.
export default function ShareSheet({ item, onClose, open = true }) {
  const { user } = useAuth()
  const { toast } = useStore()
  const link = item ? item.link || shareLink(item) : '/'
  const url = typeof window !== 'undefined' ? `${window.location.origin}${link}` : link
  const noun = KIND_NOUN[item?.kind] || 'link'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast('Link copied')
    } catch {
      toast(url)
    }
  }
  const shareOut = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: item?.title || 'Event Organizer', url })
        return
      } catch (e) {
        if (e?.name === 'AbortError') return
      }
    }
    copy()
  }

  if (!item) return null
  return (
    <Sheet open={open} onClose={onClose} title="Share">
      <div className="sh">
        {(item.title || item.image) && (
          <div className="sh-item">
            {item.image ? <img src={item.image} alt="" /> : <span className="sh-item-ph"><Share2 size={16} /></span>}
            <div className="grow ellipsis">
              <b className="ellipsis">{item.title || 'Untitled'}</b>
              {item.subtitle && <div className="muted tiny ellipsis">{item.subtitle}</div>}
            </div>
          </div>
        )}
        {user && item.kind !== 'plan' ? (
          <SendTo item={item} onDone={onClose} actions={<Actions onCopy={copy} onShare={shareOut} />} />
        ) : (
          <>
            {!user && (
              <div className="sh-signin muted small">
                <Link to="/sign-in" onClick={onClose}>Sign in</Link> to send this {noun} in a message.
              </div>
            )}
            <Actions onCopy={copy} onShare={shareOut} />
          </>
        )}
      </div>
    </Sheet>
  )
}

function Actions({ onCopy, onShare }) {
  return (
    <div className="sh-actions">
      <button type="button" onClick={onCopy}>
        <span className="sh-act-icon"><Link2 size={20} /></span>
        Copy link
      </button>
      <button type="button" onClick={onShare}>
        <span className="sh-act-icon"><Share2 size={20} /></span>
        Share to…
      </button>
    </div>
  )
}

function SendTo({ item, onDone, actions }) {
  const { toast } = useStore()
  const { data: conversations, loading } = useQuery(listConversations, [])
  const { data: support } = useQuery(shareSupport, [])
  const [q, setQ] = useState('')
  const [people, setPeople] = useState([])
  const [searching, setSearching] = useState(false)
  const [picked, setPicked] = useState([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const noteRef = useRef()

  // People search (debounced). Chats are filtered locally.
  useEffect(() => {
    const term = q.trim()
    if (!term) {
      setPeople([])
      return undefined
    }
    let live = true
    setSearching(true)
    const t = setTimeout(() => {
      searchPeople(term)
        .then((r) => live && setPeople(r))
        .catch((e) => {
          console.warn(e)
          if (live) setPeople([])
        })
        .finally(() => live && setSearching(false))
    }, 250)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [q])

  const targets = useMemo(() => mergeShareTargets(conversations || [], people, q), [conversations, people, q])
  const pickedKeys = new Set(picked.map((t) => t.key))
  // Keep picked targets visible even when the search no longer matches them.
  const shown = [...picked.filter((t) => !targets.some((x) => x.key === t.key)), ...targets]
  const toggle = (t) => {
    if (pickedKeys.has(t.key)) setPicked(picked.filter((x) => x.key !== t.key))
    else if (picked.length < MAX_PICK) {
      setPicked([...picked, t])
      setTimeout(() => noteRef.current?.focus({ preventScroll: true }), 0)
    }
  }

  const unsupported = support && item.kind === 'event' && !support.event

  const send = async () => {
    if (!picked.length || busy) return
    setBusy(true)
    try {
      const { sent, failed } = await shareToChats({ ...shareRecipients(picked), kind: item.kind, id: item.id, text: note, link: item.link || shareLink(item) })
      const who = sent.length === 1 ? picked.find((t) => t.conversationId === sent[0])?.name || '1 chat' : `${sent.length} chats`
      toast(failed.length ? `Sent to ${who} · ${failed.length} couldn’t be sent` : `Sent to ${who}`)
      onDone()
    } catch (e) {
      console.warn(e)
      toast(messageError(e))
      setBusy(false)
    }
  }

  if (unsupported) {
    return (
      <>
        <div className="sh-signin muted small">Sending events in chat needs a database update. You can still share the link.</div>
        {actions}
      </>
    )
  }

  return (
    <>
      <div className="search sh-search">
        <Search size={16} />
        <input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people and chats" />
      </div>
      {loading && !conversations ? (
        <Loading inline />
      ) : !shown.length ? (
        <div className="sh-empty muted small">
          {q.trim() ? (searching ? 'Searching…' : `No one found for “${q.trim()}”.`) : 'No chats yet. Search for someone to send this to.'}
        </div>
      ) : (
        <div className="sh-grid" role="listbox" aria-multiselectable="true" aria-label="Send to">
          {shown.map((t) => {
            const on = pickedKeys.has(t.key)
            return (
              <button key={t.key} type="button" role="option" aria-selected={on} className={`sh-target ${on ? 'on' : ''}`} onClick={() => toggle(t)}>
                <span className={`sh-av ${t.isGroup && t.avatars.length > 1 ? 'stack' : ''}`}>
                  {t.isGroup && t.avatars.length > 1 ? (
                    <>
                      <img src={t.avatars[0]} alt="" />
                      <img src={t.avatars[1]} alt="" />
                    </>
                  ) : (
                    <img src={t.avatar} alt="" />
                  )}
                  {t.isGroup && t.avatars.length <= 1 && <span className="sh-group-badge"><Users size={10} /></span>}
                  <span className="sh-check">{on && <Check size={13} strokeWidth={3} />}</span>
                </span>
                <span className="sh-name">{t.name}</span>
              </button>
            )
          })}
        </div>
      )}
      <div className="sh-foot">
        {picked.length ? (
          <>
            <input
              ref={noteRef}
              className="sh-note"
              placeholder="Write a message…"
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && send()}
            />
            <button type="button" className="btn block" disabled={busy} onClick={send}>
              {busy ? 'Sending…' : picked.length > 1 ? `Send separately (${picked.length})` : 'Send'}
            </button>
          </>
        ) : (
          actions
        )}
      </div>
    </>
  )
}

export { ShareSheet }
