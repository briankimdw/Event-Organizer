import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Plus, Search, UserPlus, X } from 'lucide-react'
import Sheet from '../Sheet.jsx'
import { searchVendors } from '../../api/portfolio.js'
import './upload.css'

export const MAX_CREDITS = 10

// A vendor from searchVendors() as an entry in a post's credits.
export const toCreditItem = (v) => ({ providerId: v.id, name: v.name, avatar: v.avatar, vertical: v.vertical, label: v.label, role: null })

// Credits on a post: the other vendors who worked that event (a florist credits the
// photographer and the venue). value: [{ providerId, name, avatar, label }]; exclude: provider
// ids that can't be credited (the listing posting it).
export function CreditsField({ value, onChange, exclude = [] }) {
  const [picking, setPicking] = useState(false)
  const remove = (id) => onChange(value.filter((c) => c.providerId !== id))
  return (
    <div className="field pf-field" role="group" aria-label="Credits">
      <span className="pf-label">Credits <span className="pf-optional">optional</span></span>
      <span className="muted tiny cr-help">Tag the other vendors who worked this event. Your post shows on their profile too.</span>
      <div className="cr-list">
        {value.map((c) => (
          <span key={c.providerId} className="cr-chip">
            <img className="cr-avatar" src={c.avatar} alt="" />
            <span className="cr-text"><b>{c.name}</b><small>{c.label}</small></span>
            <button type="button" className="cr-remove" onClick={() => remove(c.providerId)} aria-label={`Remove ${c.name}`}><X size={13} /></button>
          </span>
        ))}
        {value.length < MAX_CREDITS && (
          <button type="button" className="cr-add" onClick={() => setPicking(true)}>
            <UserPlus size={15} /> {value.length ? 'Tag another' : 'Tag a vendor'}
          </button>
        )}
      </div>
      <VendorPicker open={picking} onClose={() => setPicking(false)} picked={value} exclude={exclude}
        onToggle={(v) => onChange(value.some((c) => c.providerId === v.id) ? value.filter((c) => c.providerId !== v.id) : [...value, toCreditItem(v)].slice(0, MAX_CREDITS))} />
    </div>
  )
}

// Search vendors by name; tap to tag / untag.
function VendorPicker({ open, onClose, picked, exclude, onToggle }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)
  const [error, setError] = useState('')
  const seq = useRef(0)

  useEffect(() => {
    if (!open) return
    const n = ++seq.current
    const t = setTimeout(() => {
      searchVendors(q, { exclude, limit: 15 })
        .then((r) => { if (n === seq.current) { setResults(r); setError('') } })
        .catch(() => n === seq.current && setError('Couldn’t search right now.'))
    }, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [q, open]) // eslint-disable-line react-hooks/exhaustive-deps

  const isOn = (id) => picked.some((c) => c.providerId === id)
  const full = picked.length >= MAX_CREDITS
  return (
    <Sheet open={open} onClose={onClose} title="Tag a vendor">
      <div className="input-prefix cr-search">
        <Search size={16} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" aria-label="Search vendors" enterKeyHint="search" />
        {q && <button type="button" className="icon-btn" onClick={() => setQ('')} aria-label="Clear"><X size={14} /></button>}
      </div>
      <div className="cr-results" aria-live="polite">
        {error ? <div className="muted small cr-empty">{error}</div>
          : results === null ? <div className="muted small cr-empty">Searching…</div>
          : results.length === 0 ? <div className="muted small cr-empty">{q ? `No vendors called “${q}”.` : 'No vendors yet.'}</div>
          : results.map((v) => {
            const on = isOn(v.id)
            return (
              <button type="button" key={v.id} className={`list-row cr-row ${on ? 'on' : ''}`} onClick={() => onToggle(v)} disabled={!on && full} aria-pressed={on}>
                <img className="avatar" src={v.avatar} alt="" />
                <span className="grow">
                  <span className="small block"><b>{v.name}</b></span>
                  <span className="muted tiny block">{[v.label, v.city].filter(Boolean).join(' · ')}</span>
                </span>
                <span className={`cr-tick ${on ? 'on' : ''}`}>{on ? <Check size={15} strokeWidth={3} /> : <Plus size={15} />}</span>
              </button>
            )
          })}
      </div>
      {full && <div className="muted tiny">You can tag up to {MAX_CREDITS} vendors.</div>}
      <div className="sheet-actions">
        <button type="button" className="btn accent block" onClick={onClose}>Done{picked.length ? ` · ${picked.length} tagged` : ''}</button>
      </div>
    </Sheet>
  )
}

// Credits on a post in the viewer: tappable vendor chips. dark: on the black viewer.
export function CreditChips({ credits, dark = false, onNavigate }) {
  if (!credits?.length) return null
  return (
    <div className={`cr-viewer ${dark ? 'dark' : ''}`} aria-label="Vendors on this event">
      {credits.map((c) => (
        <Link key={c.providerId} to={`/u/${c.providerId}`} className="cr-chip link" onClick={onNavigate}>
          <img className="cr-avatar" src={c.avatar} alt="" />
          <span className="cr-text"><b>{c.name}</b><small>{c.label}</small></span>
        </Link>
      ))}
    </div>
  )
}
