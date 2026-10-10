import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import Sheet from '../Sheet.jsx'
import VerticalIcon from '../verticals/VerticalIcon.jsx'
import { verticalMeta } from '../../verticals/index.js'
import './upload.css'

// "Posting to": which of your listings a post belongs to. Only shown when you have more
// than one (a caterer who also runs a bar). providers: providers rows (+ `vertical`).
export default function ListingPicker({ providers, value, onChange }) {
  const [open, setOpen] = useState(false)
  if (!providers || providers.length < 2) return null
  const current = providers.find((p) => p.id === value) || providers[0]
  const meta = verticalMeta(current.vertical)
  return (
    <>
      <button type="button" className="lp-pill" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className="lp-icon" style={{ '--tint': meta.tint }}><VerticalIcon name={meta.icon} size={14} /></span>
        <span className="lp-text">Posting to <b>{current.display_name}</b> · {meta.name}</span>
        <ChevronDown size={16} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Post to which listing?">
        <div className="lp-list">
          {providers.map((p) => {
            const m = verticalMeta(p.vertical)
            const on = p.id === current.id
            return (
              <button type="button" key={p.id} className={`list-row lp-row ${on ? 'on' : ''}`} aria-pressed={on}
                onClick={() => { onChange(p.id); setOpen(false) }}>
                <span className="lp-icon lg" style={{ '--tint': m.tint }}><VerticalIcon name={m.icon} size={18} /></span>
                <span className="grow">
                  <span className="small block"><b>{p.display_name}</b></span>
                  <span className="muted tiny block">{m.name}</span>
                </span>
                {on && <Check size={18} className="accent-text" />}
              </button>
            )
          })}
        </div>
      </Sheet>
    </>
  )
}
