import { useState } from 'react'
import { CalendarDays, MapPin, Palette, Pencil, Plus, Users, Wallet, X } from 'lucide-react'
import Sheet from '../Sheet.jsx'
import DatePicker from '../DatePicker.jsx'
import { fromKey, isPast } from '../../lib/dates.js'
import { EVENT_TYPES, STYLE_SUGGESTIONS, centsShort, datesLabel, eventTypeName, typeIcon } from './brief.js'

const MAX_DATES = 14

// "What I understood": one chip per brief field. Tapping a chip opens a small
// editor; applying it calls onEdit(field, nextBrief).
export default function BriefChips({ brief, onEdit, disabled = false }) {
  const [editing, setEditing] = useState(null)
  if (!brief) return null

  const TypeIcon = typeIcon(brief.event_type)
  const chips = [
    { field: 'event_type', icon: TypeIcon, label: brief.event_type ? eventTypeName(brief.event_type) : null, empty: 'Event type' },
    { field: 'dates', icon: CalendarDays, label: datesLabel(brief), empty: 'Add dates' },
    { field: 'location_text', icon: MapPin, label: brief.location_text, empty: 'Add location' },
    { field: 'budget_total_cents', icon: Wallet, label: brief.budget_total_cents != null ? `${centsShort(brief.budget_total_cents)} budget` : null, empty: 'Add budget' },
    { field: 'guest_count', icon: Users, label: brief.guest_count != null ? `${brief.guest_count} guests` : null, empty: 'Guests' },
    { field: 'styles', icon: Palette, label: brief.styles.length ? brief.styles.join(', ') : null, empty: 'Style' },
  ]

  const apply = (field, patch) => {
    setEditing(null)
    onEdit(field, { ...brief, ...patch })
  }

  return (
    <div className="plan-understood">
      <div className="plan-label">What I understood <span className="muted">· tap to change</span></div>
      <div className="chips">
        {chips.map(({ field, icon: Icon, label, empty }) => (
          <button
            key={field}
            type="button"
            className={`plan-chip ${label ? '' : 'missing'}`}
            onClick={() => setEditing(field)}
            disabled={disabled}
          >
            {label ? <Icon size={14} /> : <Plus size={14} />}
            <span className="ellipsis">{label || empty}</span>
            {label && <Pencil size={11} className="plan-chip-edit" />}
          </button>
        ))}
      </div>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={SHEET_TITLES[editing]}>
        {editing && <FieldEditor field={editing} brief={brief} onApply={(patch) => apply(editing, patch)} />}
      </Sheet>
    </div>
  )
}

const SHEET_TITLES = {
  event_type: 'What kind of event?',
  dates: 'When is it?',
  location_text: 'Where is it?',
  budget_total_cents: 'Total budget',
  guest_count: 'How many guests?',
  styles: 'Photo style',
}

function FieldEditor({ field, brief, onApply }) {
  switch (field) {
    case 'event_type':
      return <TypeEditor brief={brief} onApply={onApply} />
    case 'dates':
      return <DatesEditor brief={brief} onApply={onApply} />
    case 'location_text':
      return <LocationEditor brief={brief} onApply={onApply} />
    case 'budget_total_cents':
      return <NumberEditor prefix="$" value={brief.budget_total_cents != null ? Math.round(brief.budget_total_cents / 100) : ''} hint="For the whole event. I'll split it across photography, venue and the rest." onApply={(n) => onApply({ budget_total_cents: n == null ? null : n * 100 })} />
    case 'guest_count':
      return <NumberEditor suffix="guests" value={brief.guest_count ?? ''} onApply={(n) => onApply({ guest_count: n })} />
    case 'styles':
      return <StylesEditor brief={brief} onApply={onApply} />
    default:
      return null
  }
}

function TypeEditor({ brief, onApply }) {
  return (
    <div className="plan-type-grid">
      {EVENT_TYPES.map(([slug, name]) => {
        const Icon = typeIcon(slug)
        return (
          <button key={slug} type="button" className={`plan-type ${brief.event_type === slug ? 'on' : ''}`} onClick={() => onApply({ event_type: slug })}>
            <Icon size={18} />
            <span>{name}</span>
          </button>
        )
      })}
    </div>
  )
}

function DatesEditor({ brief, onApply }) {
  const [dates, setDates] = useState(() => [...brief.dates].sort())
  const [month, setMonth] = useState(() => {
    const d = dates[0] ? fromKey(dates[0]) : new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const toggle = (key) =>
    setDates((ds) => (ds.includes(key) ? ds.filter((k) => k !== key) : ds.length >= MAX_DATES ? ds : [...ds, key].sort()))
  return (
    <>
      <DatePicker selected={dates} onToggle={toggle} isDisabled={isPast} month={month} onMonthChange={setMonth} />
      <div className="muted tiny mt-sm">Pick every day you need covered (up to {MAX_DATES}).</div>
      <div className="row gap-xs mt">
        {dates.length > 0 && (
          <button type="button" className="btn ghost" onClick={() => setDates([])}>
            Clear
          </button>
        )}
        <button
          type="button"
          className="btn grow"
          onClick={() => onApply({ dates, start_date: dates[0] ?? null, end_date: dates[dates.length - 1] ?? null })}
        >
          {dates.length ? `Use ${dates.length} date${dates.length > 1 ? 's' : ''}` : 'No date yet'}
        </button>
      </div>
    </>
  )
}

function LocationEditor({ brief, onApply }) {
  const [text, setText] = useState(brief.location_text || '')
  const submit = (e) => {
    e.preventDefault()
    const t = text.trim()
    onApply({ location_text: t || null, location: t === (brief.location_text || '') ? brief.location : null })
  }
  return (
    <form onSubmit={submit}>
      <input className="input" autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="City, venue or neighborhood" />
      <button className="btn block mt">Update location</button>
    </form>
  )
}

function NumberEditor({ value, prefix, suffix, hint, onApply }) {
  const [text, setText] = useState(String(value))
  const n = text.trim() === '' ? null : Math.max(0, Math.round(Number(text.replace(/[^\d.]/g, ''))))
  const valid = n == null || Number.isFinite(n)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) onApply(n)
      }}
    >
      <label className="plan-number">
        {prefix && <span>{prefix}</span>}
        <input autoFocus inputMode="numeric" value={text} onChange={(e) => setText(e.target.value)} placeholder="0" aria-label={suffix || 'Amount'} />
        {suffix && <span className="muted">{suffix}</span>}
      </label>
      {hint && <div className="muted tiny mt-sm">{hint}</div>}
      <button className="btn block mt" disabled={!valid}>
        Update
      </button>
    </form>
  )
}

function StylesEditor({ brief, onApply }) {
  const [styles, setStyles] = useState(brief.styles)
  const [custom, setCustom] = useState('')
  const toggle = (s) => setStyles((xs) => (xs.includes(s) ? xs.filter((x) => x !== s) : [...xs, s]))
  const options = [...new Set([...STYLE_SUGGESTIONS, ...styles])]
  const addCustom = () => {
    const s = custom.trim().toLowerCase()
    if (s && !styles.includes(s)) setStyles((xs) => [...xs, s])
    setCustom('')
  }
  return (
    <>
      <div className="chips">
        {options.map((s) => (
          <button key={s} type="button" className={`chip toggle ${styles.includes(s) ? 'on' : ''}`} onClick={() => toggle(s)}>
            {s}
            {styles.includes(s) && <X size={12} />}
          </button>
        ))}
      </div>
      <form
        className="row gap-xs mt"
        onSubmit={(e) => {
          e.preventDefault()
          addCustom()
        }}
      >
        <input className="input" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Something else, e.g. “vintage”" />
        <button className="btn ghost" disabled={!custom.trim()}>
          Add
        </button>
      </form>
      <button type="button" className="btn block mt" onClick={() => onApply({ styles })}>
        Update style
      </button>
    </>
  )
}
