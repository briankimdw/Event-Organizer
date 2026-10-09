import { ChevronDown } from 'lucide-react'

export const LIMITS = { title: 120, caption: 2200, location: 120 }

const pad = (n) => String(n).padStart(2, '0')
export const todayKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const prettyDay = (key) =>
  key ? new Date(`${key}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''

// Required fields first. Returns { field: message } for anything that needs fixing.
export function validatePost({ title, categoryId, shotOn }) {
  const errors = {}
  if (!title.trim()) errors.title = 'Give your post a title.'
  else if (title.trim().length > LIMITS.title) errors.title = `Keep the title under ${LIMITS.title} characters.`
  if (!categoryId) errors.category = 'Pick the kind of shoot this was.'
  if (shotOn && shotOn > todayKey()) errors.shotOn = 'The shoot date can’t be in the future.'
  return errors
}

const Counter = ({ value, max }) => (value.length > max * 0.8 ? <span className={`pf-count ${value.length > max ? 'over' : ''}`}>{value.length}/{max}</span> : null)

export function TitleField({ value, onChange, error, placeholder = 'e.g. Nguyen–Park wedding', autoFocus }) {
  return (
    <label className="field pf-field">
      <span className="pf-label">Title <Counter value={value} max={LIMITS.title} /></span>
      <input className={`input ${error ? 'invalid' : ''}`} maxLength={LIMITS.title} value={value} autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-invalid={!!error} enterKeyHint="done" />
      {error && <small className="field-hint" role="alert">{error}</small>}
    </label>
  )
}

export function CategoryField({ value, onChange, services, error }) {
  return (
    <div className="field pf-field" role="group" aria-label="Category">
      <span className="pf-label">Category</span>
      <div className="chips">
        {services === null ? <span className="muted tiny">Loading…</span> : services.map((s) => (
          <button type="button" key={s.id} className={`chip toggle ${value === s.id ? 'on' : ''}`} aria-pressed={value === s.id}
            onClick={() => onChange(value === s.id ? null : s.id)}>
            {s.name}
          </button>
        ))}
      </div>
      {error && <small className="field-hint" role="alert">{error}</small>}
    </div>
  )
}

export function CaptionField({ value, onChange }) {
  return (
    <label className="field pf-field">
      <span className="pf-label">Caption <Counter value={value} max={LIMITS.caption} /></span>
      <textarea className="input" rows={3} maxLength={LIMITS.caption} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder="The story behind the shoot, the light, the couple…" />
    </label>
  )
}

export function PlaceDateFields({ location, onLocation, shotOn, onShotOn, dateError, dateHint }) {
  return (
    <>
      <div className="pf-pair">
        <label className="field pf-field grow">
          <span className="pf-label">Location</span>
          <input className="input" maxLength={LIMITS.location} value={location} onChange={(e) => onLocation(e.target.value)} placeholder="City or venue" />
        </label>
        <label className="field pf-field pf-date">
          <span className="pf-label">Shoot date</span>
          <input className={`input ${dateError ? 'invalid' : ''}`} type="date" max={todayKey()} value={shotOn} onChange={(e) => onShotOn(e.target.value)} />
        </label>
      </div>
      {dateError ? <small className="field-hint" role="alert">{dateError}</small> : dateHint && <small className="muted tiny pf-hint">{dateHint}</small>}
    </>
  )
}

// A tucked-away section: a row that opens to show its children.
export function Disclosure({ title, summary, open, onToggle, children, badge }) {
  return (
    <div className={`pf-disclosure ${open ? 'open' : ''}`}>
      <button type="button" className="pf-disclosure-head" onClick={onToggle} aria-expanded={open}>
        <div className="grow">
          <div className="pf-disclosure-title">{title}{badge}</div>
          {!open && summary && <div className="muted tiny pf-disclosure-summary">{summary}</div>}
        </div>
        <ChevronDown size={18} className="pf-chevron" />
      </button>
      {open && <div className="pf-disclosure-body">{children}</div>}
    </div>
  )
}
