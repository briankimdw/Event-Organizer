import { ChevronDown } from 'lucide-react'
import VerticalIcon from '../verticals/VerticalIcon.jsx'
import { postConfig } from '../../verticals/index.js'
import './upload.css'

export const LIMITS = { title: 120, caption: 2200, location: 120 }

const pad = (n) => String(n).padStart(2, '0')
export const todayKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const prettyDay = (key) =>
  key ? new Date(`${key}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''

// Required fields first. Returns { field: message } for anything that needs fixing.
// The title is optional (a post without one is named after its category and occasion).
export function validatePost({ title, categoryId, shotOn }) {
  const errors = {}
  if (title.trim().length > LIMITS.title) errors.title = `Keep the title under ${LIMITS.title} characters.`
  if (!categoryId) errors.category = 'Pick what kind of work this is.'
  if (shotOn && shotOn > todayKey()) errors.shotOn = 'The date can’t be in the future.'
  return errors
}

const Counter = ({ value, max }) => (value.length > max * 0.8 ? <span className={`pf-count ${value.length > max ? 'over' : ''}`}>{value.length}/{max}</span> : null)

// fallback: the title used when this is left empty (shown as a hint).
export function TitleField({ value, onChange, error, placeholder = 'e.g. Nguyen–Park wedding', autoFocus, fallback }) {
  return (
    <label className="field pf-field">
      <span className="pf-label">Title <span className="pf-optional">optional</span> <Counter value={value} max={LIMITS.title} /></span>
      <input className={`input ${error ? 'invalid' : ''}`} maxLength={LIMITS.title} value={value} autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-invalid={!!error} enterKeyHint="done" />
      {error ? <small className="field-hint" role="alert">{error}</small>
        : !value.trim() && fallback ? <small className="muted tiny pf-hint">Left blank, it’s called “{fallback}”.</small> : null}
    </label>
  )
}

export function CategoryField({ value, onChange, services, error, label = 'Category' }) {
  return (
    <div className="field pf-field" role="group" aria-label={label}>
      <span className="pf-label">{label}</span>
      <div className="chips">
        {services === null ? <span className="muted tiny">Loading…</span>
          : services.length === 0 ? <span className="muted tiny">No categories for this service yet.</span>
          : services.map((s) => (
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

// The event this was for (optional): one of OCCASIONS. occasions: from occasionsFor(vertical).
export function OccasionField({ value, onChange, occasions }) {
  return (
    <div className="field pf-field" role="group" aria-label="Occasion">
      <span className="pf-label">Occasion <span className="pf-optional">optional</span></span>
      <div className="chips">
        {occasions.map((o) => (
          <button type="button" key={o.slug} className={`chip toggle ${value === o.slug ? 'on' : ''}`} aria-pressed={value === o.slug}
            onClick={() => onChange(value === o.slug ? null : o.slug)}>
            <VerticalIcon name={o.icon} size={13} /> {o.name}
          </button>
        ))}
      </div>
    </div>
  )
}

export function CaptionField({ value, onChange, placeholder = postConfig(null).caption }) {
  return (
    <label className="field pf-field">
      <span className="pf-label">Caption <Counter value={value} max={LIMITS.caption} /></span>
      <textarea className="input" rows={3} maxLength={LIMITS.caption} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} />
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
          <span className="pf-label">Date</span>
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
