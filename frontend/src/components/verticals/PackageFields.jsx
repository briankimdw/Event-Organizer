import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { optionLabel, optionsOf } from '../../verticals/index.js'

// A form for a vertical's custom fields (a field config from verticals/<slug>/config.js).
//   fields:   [{ key, label, type: 'number'|'text'|'select'|'tags'|'boolean', ... }]
//   values:   the attributes object being edited
//   onChange: (nextValues) => void
// Values stay as typed (numbers may be strings while editing); run them through
// cleanAttributes(fields, values) from verticals/ before saving.
export default function PackageFields({ fields = [], values = {}, onChange }) {
  if (!fields.length) return null
  const set = (key, v) => onChange({ ...values, [key]: v })
  // Short number fields sit two to a row.
  const rows = []
  for (const f of fields) {
    const last = rows[rows.length - 1]
    if (f.type === 'number' && last?.length === 1 && last[0].type === 'number') last.push(f)
    else rows.push([f])
  }
  return (
    <div className="v-fields">
      {rows.map((row) => (
        <div key={row[0].key} className={row.length > 1 ? 'row gap-xs mt-sm top' : 'mt-sm'}>
          {row.map((f) => (
            <Field key={f.key} field={f} value={values[f.key]} onChange={(v) => set(f.key, v)} grow={row.length > 1} />
          ))}
        </div>
      ))}
    </div>
  )
}

function Field({ field: f, value, onChange, grow }) {
  if (f.type === 'boolean') {
    return (
      <label className="toggle-row v-bool">
        <div className="grow small">{f.label}</div>
        <input type="checkbox" className="switch" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
      </label>
    )
  }
  if (f.type === 'tags') return <TagsField field={f} value={value} onChange={onChange} />
  return (
    <label className={`field ${grow ? 'grow' : ''}`}>
      <span>{f.label}</span>
      {f.type === 'number' ? (
        <input className="input" type="number" inputMode="decimal" min={f.min} max={f.max} step={f.step || 1}
          value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      ) : f.type === 'select' ? (
        <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">Not specified</option>
          {value && !optionsOf(f).some((o) => o.value === value) && <option value={value}>{value}</option>}
          {optionsOf(f).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input className="input" maxLength={f.maxLength || 120} placeholder={f.placeholder} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  )
}

// Suggested options as toggle chips, plus free text when the field allows it.
function TagsField({ field: f, value, onChange }) {
  const [draft, setDraft] = useState('')
  const list = Array.isArray(value) ? value : []
  const full = f.max != null && list.length >= f.max
  const toggle = (t) => onChange(list.includes(t) ? list.filter((x) => x !== t) : full ? list : [...list, t])
  const add = () => {
    const t = draft.trim()
    if (t && !list.includes(t) && !full) onChange([...list, t])
    setDraft('')
  }
  const options = optionsOf(f)
  const extra = list.filter((t) => !options.some((o) => o.value === t))
  return (
    <div className="field">
      <span>{f.label}</span>
      <div className="chips">
        {options.map((o) => (
          <button type="button" key={o.value} className={`chip toggle ${list.includes(o.value) ? 'on' : ''}`} aria-pressed={list.includes(o.value)} onClick={() => toggle(o.value)}>{o.label}</button>
        ))}
        {extra.map((t) => (
          <button type="button" key={t} className="chip toggle on" onClick={() => toggle(t)} aria-label={`Remove ${optionLabel(f, t)}`}>{optionLabel(f, t)} <X size={12} /></button>
        ))}
      </div>
      {f.custom && !full && (
        <div className="row gap-xs mt-xs">
          <input className="input grow" maxLength={80} placeholder={f.placeholder || 'Add your own'} value={draft}
            onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
          <button type="button" className="btn ghost sm" disabled={!draft.trim()} onClick={add} aria-label={`Add to ${f.label}`}><Plus size={14} /> Add</button>
        </div>
      )}
    </div>
  )
}
