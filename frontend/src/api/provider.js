// The signed-in photographer's own business data: packages, blocked-off days
// and working hours. Row-Level Security only lets owners change their own rows.
import { supabase } from '../lib/supabase.js'
import { toPackage } from '../lib/format.js'
import { addDays, fromKey, toKey } from '../lib/dates.js'
import { invalidate } from './catalog.js'

const must = ({ data, error }) => {
  if (error) throw error
  return data
}

const DEFAULT_TZ = 'America/Los_Angeles'

// ---------------------------------------------------------------------------
// Packages
// ---------------------------------------------------------------------------

// `*` so min_quantity / max_quantity come through once the all-verticals migration is applied.
const PACKAGE_COLUMNS = '*, category:service_categories(name)'

// All my packages, hidden ones included (public pages only show active ones).
export async function listMyPackages(providerId) {
  if (!providerId) return []
  const rows = must(await supabase.from('packages').select(PACKAGE_COLUMNS).eq('provider_id', providerId).order('sort_order').order('created_at'))
  return rows.map(toPackage)
}

// Form values (dollars, hours) -> a packages row. Only sets attributes that have a value,
// because the category schemas reject nulls.
//   form: { name, description?, categoryId, priceType, price, hours, depositPct,
//           attributes: { min_guests: 50, cuisines: [...] } }  (keys from verticals/<slug>/config.js;
//           run them through cleanAttributes(fields, attrs) first for typed values;
//           min_quantity / max_quantity found there are written to their package columns) 
// The older photography form keys (editedPhotos, turnaroundDays, editingLevel, secondShooter)
// still work and win over `attributes` when present.
function toRow(f) {
  const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v))
  const attributes = {}
  const columns = {}
  for (const [k, v] of Object.entries(f.attributes || {})) {
    // Guest / piece limits are columns. Only sent when the form has them, so
    // photography packages still save on a database without these columns.
    if (k === 'min_quantity' || k === 'max_quantity') {
      columns[k] = v === '' || v == null ? null : Math.max(1, Math.round(Number(v)))
      continue
    }
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue
    attributes[k] = v
  }
  const setInt = (key, v) => {
    const n = num(v)
    if (n == null) delete attributes[key]
    else attributes[key] = Math.max(0, Math.round(n))
  }
  if ('editedPhotos' in f) setInt('edited_photos', f.editedPhotos)
  if ('turnaroundDays' in f) setInt('turnaround_days', f.turnaroundDays)
  if ('editingLevel' in f) {
    if (f.editingLevel?.trim()) attributes.editing_level = f.editingLevel.trim().slice(0, 80)
    else delete attributes.editing_level
  }
  if (f.secondShooter != null) attributes.second_shooter_included = !!f.secondShooter
  const price = num(f.price)
  const hours = num(f.hours)
  const row = {
    name: f.name.trim().slice(0, 80),
    category_id: f.categoryId,
    price_type: f.priceType,
    price_cents: f.priceType === 'quote' ? null : Math.round((price ?? 0) * 100),
    duration_minutes: hours && hours > 0 ? Math.round(hours * 60) : null,
    deposit_pct: Math.min(100, Math.max(0, Math.round(num(f.depositPct) ?? 30))),
    attributes,
    ...columns,
  }
  if ('description' in f) row.description = f.description?.trim().slice(0, 1000) || null
  return row
}

export async function createPackage(providerId, form) {
  const row = must(
    await supabase
      .from('packages')
      .insert({ ...toRow(form), provider_id: providerId, sort_order: form.sortOrder ?? 0 })
      .select(PACKAGE_COLUMNS)
      .single(),
  )
  invalidate('providers')
  return toPackage(row)
}

export async function updatePackage(id, form) {
  const row = must(await supabase.from('packages').update(toRow(form)).eq('id', id).select(PACKAGE_COLUMNS).single())
  invalidate('providers')
  return toPackage(row)
}

// Hide / show a package (bookings keep pointing at it, so we never hard-delete).
export async function setPackageActive(id, active) {
  const row = must(await supabase.from('packages').update({ is_active: active }).eq('id', id).select(PACKAGE_COLUMNS).single())
  invalidate('providers')
  return toPackage(row)
}

// ---------------------------------------------------------------------------
// Listing details
// ---------------------------------------------------------------------------

// Replace a listing's custom fields (cuisines, capacity, genres...). Keys must match the
// vertical's provider JSON Schema; pass them through cleanAttributes(fields, attrs) first.
export async function updateProviderAttributes(providerId, attributes) {
  const row = must(await supabase.from('providers').update({ attributes }).eq('id', providerId).select('id, attributes').single())
  invalidate('providers')
  return row.attributes
}

// ---------------------------------------------------------------------------
// Working hours
// ---------------------------------------------------------------------------

// [{ weekday 0..6 (0 = Sunday), start 'HH:MM', end 'HH:MM' }]
export async function listWorkingHours(providerId) {
  if (!providerId) return []
  const rows = must(await supabase.from('availability_rules').select('weekday, start_time, end_time').eq('provider_id', providerId).order('weekday'))
  return rows.map((r) => ({ weekday: r.weekday, start: r.start_time.slice(0, 5), end: r.end_time.slice(0, 5) }))
}

// ---------------------------------------------------------------------------
// Blocked-off days (blackouts)
// ---------------------------------------------------------------------------

// '["2026-10-17 07:00:00+00","2026-10-19 07:00:00+00")' -> [Date, Date]
// (Postgres writes offsets as "+00"; JS Date needs "+00:00".)
const toDate = (s) => new Date(s.trim().replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00'))
const parseRange = (range) => {
  const [a = '', b = ''] = String(range).replace(/[[\]()"]/g, '').split(',')
  return [toDate(a), toDate(b)]
}

// 'YYYY-MM-DD' of a moment in a time zone.
const keyIn = (date, timeZone) => date.toLocaleDateString('en-CA', { timeZone })

// [{ id, start, end, days: ['YYYY-MM-DD', ...] }], days in the photographer's time zone.
export async function listBlackouts(providerId, timeZone = DEFAULT_TZ) {
  if (!providerId) return []
  const rows = must(await supabase.from('blackouts').select('id, during').eq('provider_id', providerId))
  return rows
    .map((r) => {
      const [start, end] = parseRange(r.during)
      if (Number.isNaN(+start) || Number.isNaN(+end)) return null
      const days = []
      let d = fromKey(keyIn(start, timeZone))
      const last = keyIn(new Date(end - 1), timeZone)
      for (let i = 0; i < 400 && toKey(d) <= last; i++, d = addDays(d, 1)) days.push(toKey(d))
      return { id: r.id, start, end, days }
    })
    .filter(Boolean)
}

// A whole day in a time zone as a tstzrange literal (Postgres resolves the zone name).
const dayRange = (key, timeZone) => `["${key} 00:00:00 ${timeZone}","${toKey(addDays(fromKey(key), 1))} 00:00:00 ${timeZone}")`

// Block off one day ('YYYY-MM-DD', in the photographer's time zone).
export async function addBlackout(providerId, dayKey, timeZone = DEFAULT_TZ) {
  const row = must(await supabase.from('blackouts').insert({ provider_id: providerId, during: dayRange(dayKey, timeZone) }).select('id').single())
  invalidate('providers')
  return row
}

// Free up one day. If it's part of a longer blocked-off stretch, the rest stays blocked.
export async function removeBlackoutDay(providerId, blackout, dayKey, timeZone = DEFAULT_TZ) {
  const next = toKey(addDays(fromKey(dayKey), 1))
  const pieces = []
  if (blackout.days[0] < dayKey) pieces.push(`["${blackout.start.toISOString()}","${dayKey} 00:00:00 ${timeZone}")`)
  if (blackout.days[blackout.days.length - 1] > dayKey) pieces.push(`["${next} 00:00:00 ${timeZone}","${blackout.end.toISOString()}")`)
  if (pieces.length) must(await supabase.from('blackouts').insert(pieces.map((during) => ({ provider_id: providerId, during }))))
  must(await supabase.from('blackouts').delete().eq('id', blackout.id))
  invalidate('providers')
}
