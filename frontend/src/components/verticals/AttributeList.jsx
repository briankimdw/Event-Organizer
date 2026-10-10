import { Check } from 'lucide-react'
import { attributeEntries, attributeLines, optionLabel } from '../../verticals/index.js'

// Read-only display of a provider's or package's custom fields.
//   fields: a field config (verticals/<slug>/config.js); attrs: the attributes object.
//   compact: one line of short facts ("Up to 200 guests · Buffet"); keys limits/orders them.
export default function AttributeList({ fields = [], attrs = {}, compact = false, keys = null, className = '' }) {
  const fieldOf = (key) => fields.find((f) => f.key === key)
  if (compact) {
    const lines = attributeLines(fields, attrs, keys)
    return lines.length ? <div className={`muted small v-attr-line ${className}`}>{lines.join(' · ')}</div> : null
  }
  const entries = attributeEntries(fields, attrs)
  if (!entries.length) return null
  return (
    <dl className={`v-attrs ${className}`}>
      {entries.map((e) =>
        e.type === 'boolean' ? (
          <div key={e.key} className="v-attr bool">
            <dt><Check size={13} /> {e.label}</dt>
          </div>
        ) : e.type === 'tags' ? (
          <div key={e.key} className="v-attr tags">
            <dt>{e.label}</dt>
            <dd className="chips">{[].concat(e.raw).map((t) => <span key={t} className="chip">{optionLabel(fieldOf(e.key), t)}</span>)}</dd>
          </div>
        ) : (
          <div key={e.key} className="v-attr">
            <dt>{e.label}</dt>
            <dd>{e.value}</dd>
          </div>
        ),
      )}
    </dl>
  )
}
