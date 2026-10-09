import { prettyDay } from './PostFields.jsx'

export const SETTING_FIELDS = [
  ['body', 'Camera'], ['lens', 'Lens'], ['focal', 'Focal length'], ['aperture', 'Aperture'],
  ['shutter', 'Shutter'], ['iso', 'ISO'], ['flash', 'Flash'], ['taken_on', 'Date taken'],
]

const show = (key, v) => (key === 'taken_on' ? prettyDay(v) : key === 'iso' ? `ISO ${v}` : v)

// What the photos' EXIF says, field by field: [{ key, label, values[] }] (only fields found).
export function readFields(items) {
  return SETTING_FIELDS.map(([key, label]) => ({
    key, label, values: [...new Set(items.map((it) => it.settings?.[key]).filter(Boolean))],
  })).filter((f) => f.values.length)
}

// One-line summary of the shown settings, e.g. "Sony ILCE-7M4 · 35mm · f/1.8 · 1/250s · ISO 400".
export function settingsSummary(fields, hidden) {
  const pick = (k) => fields.find((f) => f.key === k && !hidden.has(k))
  return ['body', 'focal', 'aperture', 'shutter', 'iso']
    .map((k) => pick(k))
    .filter(Boolean)
    .map((f) => show(f.key, f.values[0]) + (f.values.length > 1 ? '…' : ''))
    .join(' · ')
}

// Camera settings read from the photos, each with a simple show/hide switch.
// Hidden fields are left out of what's saved for clients. GPS is never read.
export default function CameraSettings({ fields, hidden, onToggle }) {
  if (!fields.length) {
    return <div className="muted small">No camera settings found in these photos. That’s fine: they’re optional.</div>
  }
  return (
    <>
      <div className="muted tiny">Shown on your post to help clients get a feel for your work. Switch off anything you’d rather keep to yourself.</div>
      <div className="cs-list">
        {fields.map(({ key, label, values }) => {
          const off = hidden.has(key)
          return (
            <label key={key} className={`cs-row ${off ? 'off' : ''}`}>
              <span className="cs-label">{label}</span>
              <span className="cs-value">
                {show(key, values[0])}
                {values.length > 1 && <span className="cs-more"> +{values.length - 1} more</span>}
              </span>
              <input type="checkbox" className="switch cs-switch" checked={!off} onChange={() => onToggle(key)} aria-label={`Show ${label}`} />
            </label>
          )
        })}
      </div>
    </>
  )
}
