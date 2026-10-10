// Events: a plan the user saved from the AI planner (public.events). Owners
// create them; members (the owner, for now) can see and edit them.
//
// The events table holds the essentials (type, dates, place, guests, budget).
// The planner's full brief (styles, exact dates, notes) is also kept in this
// browser so reopening a plan here restores everything; elsewhere it's rebuilt
// from the columns.
import { supabase } from '../lib/supabase.js'
import { addDays, fromKey, toKey } from '../lib/dates.js'
import { toEWKT } from './locations.js'

const must = ({ data, error }) => {
  if (error) throw error
  return data
}

const COLUMNS = 'id, owner_id, title, type, starts_at, ends_at, location_text, guest_count, budget_cents, currency, status, created_at, updated_at'

const TYPE_NAMES = {
  wedding: 'Wedding',
  engagement: 'Engagement',
  graduation: 'Graduation',
  headshots: 'Headshots',
  portrait: 'Portrait session',
  event: 'Event',
  party: 'Party',
  birthday: 'Birthday',
  corporate: 'Corporate event',
}
export const eventTypeName = (type) =>
  !type ? 'Event' : TYPE_NAMES[type] || type.replace(/[-_]/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

// ---- brief <-> row ----------------------------------------------------------

// A date key at local noon, so it reads back as the same day in this time zone.
const keyToTs = (key) => (key ? new Date(`${key}T12:00:00`).toISOString() : null)
const tsToKey = (ts) => (ts ? toKey(new Date(ts)) : null)

export function titleFor(brief) {
  const t = (brief?.title || '').trim()
  if (t) return t.slice(0, 120)
  const name = eventTypeName(brief?.event_type)
  const place = (brief?.location_text || '').split(',')[0].trim()
  return (place ? `${name} in ${place}` : name).slice(0, 120)
}

function rowFromBrief(brief) {
  const dates = [...(brief.dates || [])].sort()
  const start = brief.start_date || dates[0] || null
  const end = brief.end_date || dates[dates.length - 1] || start
  return {
    title: titleFor(brief),
    type: brief.event_type || null,
    starts_at: keyToTs(start),
    ends_at: keyToTs(end && start && end < start ? start : end),
    location_text: brief.location_text || null,
    location: brief.location?.lat != null && brief.location?.lng != null ? toEWKT(brief.location) : null,
    guest_count: brief.guest_count ?? null,
    budget_cents: brief.budget_total_cents != null ? Math.round(brief.budget_total_cents) : null,
  }
}

// Rebuild a planner brief from the stored columns (dates become the full range, up to 14 days).
function briefFromRow(row) {
  const start = tsToKey(row.starts_at)
  const end = tsToKey(row.ends_at) || start
  const dates = []
  if (start) {
    for (let d = fromKey(start); toKey(d) <= end && dates.length < 14; d = addDays(d, 1)) dates.push(toKey(d))
  }
  return {
    event_type: row.type,
    title: row.title,
    start_date: start,
    end_date: end,
    dates,
    location_text: row.location_text,
    location: null,
    budget_total_cents: row.budget_cents,
    guest_count: row.guest_count,
    styles: [],
    services_needed: [],
    notes: null,
  }
}

const BRIEF_KEY = (id) => `planner-brief:${id}`
function rememberBrief(id, brief) {
  try {
    localStorage.setItem(BRIEF_KEY(id), JSON.stringify(brief))
  } catch {
    /* storage unavailable: the columns are enough */
  }
}
function recallBrief(id) {
  try {
    return JSON.parse(localStorage.getItem(BRIEF_KEY(id)) || 'null')
  } catch {
    return null
  }
}

// A row as the object screens use.
export function toEvent(row) {
  const fromColumns = briefFromRow(row)
  const saved = recallBrief(row.id)
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    type: row.type,
    typeName: eventTypeName(row.type),
    startDate: fromColumns.start_date,
    endDate: fromColumns.end_date,
    locationText: row.location_text,
    guestCount: row.guest_count,
    budgetCents: row.budget_cents,
    currency: row.currency,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // The saved columns win over anything remembered, in case it was edited elsewhere.
    brief: saved ? { ...saved, ...pickDefined(fromColumns, ['title', 'event_type', 'location_text', 'guest_count', 'budget_total_cents']) } : fromColumns,
  }
}
const pickDefined = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] != null).map((k) => [k, o[k]]))

// ---- queries ----------------------------------------------------------------

export async function createEvent(brief, { status = 'planning' } = {}) {
  const row = must(await supabase.from('events').insert({ ...rowFromBrief(brief), status }).select(COLUMNS).single())
  rememberBrief(row.id, brief)
  return toEvent(row)
}

// Events I can see (mine, plus any I've been added to), most recently changed first.
export async function listMyEvents() {
  const rows = must(await supabase.from('events').select(COLUMNS).order('updated_at', { ascending: false }).limit(50))
  return rows.map(toEvent)
}

export async function getEvent(id) {
  const row = must(await supabase.from('events').select(COLUMNS).eq('id', id).maybeSingle())
  return row ? toEvent(row) : null
}

// patch: a planner brief (saves all its fields) and/or { status }.
export async function updateEvent(id, { brief, status } = {}) {
  const patch = { ...(brief ? rowFromBrief(brief) : {}), ...(status ? { status } : {}) }
  const row = must(await supabase.from('events').update(patch).eq('id', id).select(COLUMNS).single())
  if (brief) rememberBrief(id, brief)
  return toEvent(row)
}
