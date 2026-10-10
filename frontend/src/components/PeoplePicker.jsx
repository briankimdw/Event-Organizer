import { useEffect, useState } from 'react'
import { Camera, Check, Search, X } from 'lucide-react'
import { Loading } from './States.jsx'
import { searchPeople } from '../api/messages.js'

// Search for people by name or @username and pick one or more.
// selected: [{ profileId, name, avatar, ... }]; onChange(nextSelected).
// exclude: profile ids that can't be picked (e.g. people already in the group).
export default function PeoplePicker({ selected, onChange, exclude = [], autoFocus = true, max = 30 }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(false)

  // Debounced search; an empty box shows people you've talked to.
  useEffect(() => {
    let live = true
    setBusy(true)
    const t = setTimeout(() => {
      searchPeople(q)
        .then((r) => live && setResults(r))
        .catch((e) => {
          console.warn(e)
          if (live) setResults([])
        })
        .finally(() => live && setBusy(false))
    }, q ? 250 : 0)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [q])

  const picked = new Set(selected.map((p) => p.profileId))
  const toggle = (p) => {
    if (picked.has(p.profileId)) onChange(selected.filter((x) => x.profileId !== p.profileId))
    else if (selected.length < max) onChange([...selected, p])
  }
  const list = (results || []).filter((p) => !exclude.includes(p.profileId))

  return (
    <div className="people-picker">
      <div className="pp-field">
        {selected.map((p) => (
          <button key={p.profileId} type="button" className="pp-token" onClick={() => toggle(p)} aria-label={`Remove ${p.name}`}>
            {p.name.split(' ')[0]} <X size={12} />
          </button>
        ))}
        <div className="pp-input">
          <Search size={15} />
          <input
            autoFocus={autoFocus}
            placeholder={selected.length ? 'Add more…' : 'Search by name or @username'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Backspace' && !q && selected.length && onChange(selected.slice(0, -1))}
          />
        </div>
      </div>

      <div className="pp-label muted tiny">{q.trim() ? 'People' : 'Recent'}</div>
      {busy && !results ? (
        <Loading inline />
      ) : !list.length ? (
        <div className="muted small pp-empty">
          {q.trim() ? `No one found for “${q.trim()}”.` : 'Search for anyone on photomatch: vendors or clients.'}
        </div>
      ) : (
        <ul className="pp-list">
          {list.map((p) => {
            const on = picked.has(p.profileId)
            return (
              <li key={p.profileId}>
                <button type="button" className={`pp-row ${on ? 'on' : ''}`} onClick={() => toggle(p)}>
                  <img className="avatar" src={p.avatar} alt="" />
                  <div className="grow ellipsis">
                    <div className="ellipsis">
                      <b>{p.name}</b>
                      {p.isPhotographer && (
                        <span className="pp-badge" title="Vendor">
                          <Camera size={11} />
                        </span>
                      )}
                    </div>
                    <div className="muted tiny ellipsis">{[p.username && `@${p.username}`, p.businessName && p.businessName !== p.name ? p.businessName : null, p.city].filter(Boolean).join(' · ')}</div>
                  </div>
                  <span className={`pp-check ${on ? 'on' : ''}`}>{on && <Check size={14} strokeWidth={3} />}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
