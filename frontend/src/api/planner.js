// AI event planner: talks to the Python service (services/ml, POST /plan).
// The service turns a message like "a wedding in Napa on June 13, $15k" into a
// structured brief, a budget split and photographer recommendations. It only
// drafts: the user always approves and books through the normal flow.
import { supabase } from '../lib/supabase.js'
import { toKey } from '../lib/dates.js'

// VITE_ML_URL (frontend/.env.local) wins; otherwise the same host as the page on
// port 8000, so a phone on the LAN reaches the dev machine's service too.
export const ML_URL = (import.meta.env.VITE_ML_URL || `http://${location.hostname}:8000`).replace(/\/+$/, '')

// Errors carry a `kind` the screen can act on:
//   'offline' the service isn't reachable, 'auth' sign in again, 'server' anything else.
export class PlannerError extends Error {
  constructor(kind, message, status = null) {
    super(message)
    this.kind = kind
    this.status = status
  }
}

async function authHeader() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// Dev only: /plan?mock=1 answers from a local fixture instead of the service
// (sticks for the browser tab; ?mock=0 turns it off). Never active in a build.
export function mockEnabled() {
  if (!import.meta.env.DEV) return false
  try {
    const flag = new URLSearchParams(location.search).get('mock')
    if (flag === '1') sessionStorage.setItem('planner-mock', '1')
    if (flag === '0') sessionStorage.removeItem('planner-mock')
    return sessionStorage.getItem('planner-mock') === '1'
  } catch {
    return false
  }
}

// message: what the user typed. previous: the last brief (for follow-ups like
// "make it cheaper"). history: [{ role: 'user'|'assistant', text }].
export async function planEvent({ message, previous = null, history = [], signal } = {}) {
  const body = { message, today: toKey(new Date()), previous, history }
  if (import.meta.env.DEV && mockEnabled()) {
    const { mockPlan } = await import('../components/planner/devMock.js')
    return normalizePlan(await mockPlan(body))
  }

  let res
  try {
    res = await fetch(`${ML_URL}/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new PlannerError('offline', 'The planner isn’t running.')
  }
  if (res.status === 401 || res.status === 403) throw new PlannerError('auth', 'Sign in again to use the planner.', res.status)
  if (!res.ok) {
    let detail = ''
    try {
      const j = await res.json()
      detail = typeof j.detail === 'string' ? j.detail : j.message || ''
    } catch {
      /* not JSON */
    }
    throw new PlannerError('server', detail || `The planner hit a problem (${res.status}). Try again.`, res.status)
  }
  return normalizePlan(await res.json())
}

// { ok, claude } or null when the service is down.
export async function plannerHealth() {
  if (import.meta.env.DEV && mockEnabled()) return { ok: true, claude: false, mock: true }
  try {
    const res = await fetch(`${ML_URL}/plan/health`)
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

// Any field can come back null or missing: fill in safe defaults so screens
// can render without checks everywhere.
const arr = (x) => (Array.isArray(x) ? x : [])
export function normalizeBrief(b) {
  if (!b) return null
  return {
    event_type: b.event_type ?? null,
    title: b.title ?? null,
    start_date: b.start_date ?? null,
    end_date: b.end_date ?? null,
    dates: arr(b.dates),
    location_text: b.location_text ?? null,
    location: b.location ?? null,
    budget_total_cents: b.budget_total_cents ?? null,
    guest_count: b.guest_count ?? null,
    styles: arr(b.styles),
    services_needed: arr(b.services_needed),
    notes: b.notes ?? null,
  }
}

export function normalizePlan(p = {}) {
  return {
    engine: p.engine || null,
    reply: p.reply || '',
    brief: normalizeBrief(p.brief),
    questions: arr(p.questions).filter(Boolean),
    budget: arr(p.budget).filter((b) => b && b.cents != null),
    recommendations: arr(p.recommendations).map((r) => ({
      ...r,
      options: arr(r.options).map((o) => ({ ...o, free_dates: arr(o.free_dates), reasons: arr(o.reasons) })),
    })),
    coming_soon: arr(p.coming_soon),
  }
}
