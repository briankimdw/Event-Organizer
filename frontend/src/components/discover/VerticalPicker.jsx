import { Check, ChevronDown } from 'lucide-react'
import Sheet from '../Sheet.jsx'
import { Loading } from '../States.jsx'
import CatalogIcon, { TintIcon } from '../home/CatalogIcon.jsx'
import { nounFor } from '../../verticals/index.js'
import './discover.css'

// The swipe deck's "what am I swiping through" switch: a chip that opens a sheet.
//   vertical: a catalog vertical, or deckChoices().everything for "For you: everything"
export function VerticalPickerChip({ vertical, onClick }) {
  const all = vertical.slug === 'all'
  return (
    <button
      className={`chip dc-vchip ${all ? 'all' : ''}`}
      style={{ '--tint': vertical.tint }}
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label={`Showing ${all ? 'everything' : vertical.name}. Change`}
    >
      <CatalogIcon name={vertical.icon} size={14} />
      {all ? 'Everything' : vertical.name}
      <ChevronDown size={14} />
    </button>
  )
}

// "8 photographers · 17 posts", "2 caterers · profiles to swipe", "None yet: be the first".
export function choiceCountText(v) {
  if (v.slug === 'all') return `${v.count} ${nounFor(null, v.count)}${v.posts ? ` · ${v.posts} post${v.posts === 1 ? '' : 's'}` : ''}`
  if (!v.count) return 'None yet. Be the first'
  const who = `${v.count} ${nounFor(v.slug, v.count)}`
  return v.posts ? `${who} · ${v.posts} post${v.posts === 1 ? '' : 's'}` : `${who} · profiles to swipe`
}

// choices: deckChoices() (api/home.js): { everything, groups: [{ slug, name, verticals }] }.
// Every vertical can be picked; one with nobody yet shows an invite in the deck.
export function VerticalPickerSheet({ open, onClose, choices, loading, value, onPick }) {
  const row = (v) => {
    const on = v.slug === value
    return (
      <button
        key={v.slug}
        role="option"
        aria-selected={on}
        className={`dc-vrow ${on ? 'on' : ''} ${v.mode === 'empty' ? 'empty' : ''}`}
        onClick={() => onPick(v.slug)}
      >
        <TintIcon item={v} size={40} />
        <span className="grow left-text dc-vrow-text">
          <b className="block">{v.slug === 'all' ? 'For you: everything' : v.name}</b>
          <span className="muted tiny block">{choiceCountText(v)}</span>
        </span>
        {on && <Check size={18} aria-hidden="true" />}
      </button>
    )
  }
  return (
    <Sheet open={open} onClose={onClose} title="Swipe through">
      {loading || !choices ? (
        <Loading inline />
      ) : (
        <div className="dc-vlist" role="listbox" aria-label="What to swipe through">
          {row(choices.everything)}
          {choices.groups.map((g) => (
            <div key={g.slug} role="group" aria-labelledby={`dc-g-${g.slug}`} className="dc-vgroup">
              <div id={`dc-g-${g.slug}`} className="section-label dc-vgroup-label">{g.name}</div>
              {g.verticals.map(row)}
            </div>
          ))}
        </div>
      )}
    </Sheet>
  )
}
