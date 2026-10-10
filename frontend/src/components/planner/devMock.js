// DEV ONLY: a stand-in for POST /plan, used with /plan?mock=1 while the
// planner service isn't running. Imported only behind `import.meta.env.DEV`, so
// it never ships in a build. It reads a few words from the message and picks
// real photographers from the database so every link and button works.
import fixture from './devMock.fixture.json'
import { listProviders } from '../../api/catalog.js'
import { PlannerError } from '../../api/planner.js'
import { addDays, fromKey, toKey } from '../../lib/dates.js'

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const TYPES = [
  [/wedding|elop/, 'wedding'],
  [/grad/, 'graduation'],
  [/headshot/, 'headshots'],
  [/portrait/, 'portrait'],
  [/party|birthday/, 'party'],
]
const SPLITS = {
  wedding: [['photography', 'Photography', 0.14, true], ['venue', 'Venue', 0.34, false], ['catering', 'Catering', 0.3, false], ['florals', 'Florals & decor', 0.1, false], ['music', 'Music & DJ', 0.07, false], ['other', 'Buffer', 0.05, false]],
  party: [['photography', 'Photography', 0.25, true], ['venue', 'Venue', 0.35, false], ['catering', 'Food & drinks', 0.3, false], ['other', 'Buffer', 0.1, false]],
  default: [['photography', 'Photography', 1, true]],
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

// A Saturday in the given month (0-11) of the next year it's in the future.
function saturdayIn(month, today) {
  let y = today.getFullYear()
  if (month < today.getMonth() || (month === today.getMonth() && today.getDate() > 20)) y += 1
  let d = new Date(y, month, 8)
  while (d.getDay() !== 6) d = addDays(d, 1)
  return d
}

export async function mockPlan({ message = '', today, previous }) {
  await sleep(1300)
  const m = message.toLowerCase()
  // Say "mock offline" / "mock fail" to see the error states.
  if (m.includes('mock offline')) throw new PlannerError('offline', 'The planner isn’t running.')
  if (m.includes('mock fail')) throw new PlannerError('server', 'The planner hit a problem (500). Try again.', 500)
  const brief = structuredClone(previous || fixture.brief)
  if (!previous) {
    brief.styles = []
    brief.guest_count = null
  }
  const notes = []

  for (const [re, type] of TYPES) if (re.test(m)) brief.event_type = type
  const money = m.match(/\$\s?([\d,.]+)\s*(k)?/)
  if (money) brief.budget_total_cents = Math.round(parseFloat(money[1].replace(/,/g, '')) * (money[2] ? 1000 : 1) * 100)
  if (/cheaper|less|lower/.test(m) && brief.budget_total_cents) {
    brief.budget_total_cents = Math.round(brief.budget_total_cents * 0.8)
    notes.push('trimmed the budget by 20%')
  }
  const guests = m.match(/(\d+)\s*(guests|people)/)
  if (guests) brief.guest_count = Number(guests[1])
  const place = message.match(/\b(?:in|at|near)\s+([A-Z][\w .'-]+?)(?:[,.!?]| in| from| on| for| with| and| under| around|$)/)
  if (place) {
    brief.location_text = place[1].trim()
    brief.location = null
  }
  const month = MONTHS.findIndex((x) => m.includes(x))
  if (month >= 0) {
    const sat = saturdayIn(month, fromKey(today))
    const span = brief.dates.length > 1 ? Math.min(brief.dates.length, 3) : 1
    brief.dates = Array.from({ length: span }, (_, i) => toKey(addDays(sat, i)))
    brief.start_date = brief.dates[0]
    brief.end_date = brief.dates[brief.dates.length - 1]
    notes.push(`moved it to ${MONTHS[month][0].toUpperCase() + MONTHS[month].slice(1)}`)
  }
  for (const s of ['moody', 'candid', 'editorial', 'film', 'bright', 'documentary']) if (m.includes(s) && !brief.styles.includes(s)) brief.styles.push(s)
  brief.title = null

  const type = brief.event_type || 'event'
  const split = SPLITS[type] || SPLITS.default
  const total = brief.budget_total_cents
  const budget = total
    ? split.map(([category, label, pct, bookable]) => ({ category, label, cents: Math.round(total * pct), pct: Math.round(pct * 100), bookable }))
    : []
  const photoBudget = budget.find((b) => b.category === 'photography')?.cents ?? null

  const providers = (await listProviders()).filter((p) => p.packages.some((x) => x.price != null))
  const options = providers
    .map((p) => {
      const h = hash(p.id + type)
      const priced = p.packages.filter((x) => x.price != null)
      const pkg = photoBudget ? [...priced].sort((a, b) => Math.abs(a.price * 100 - photoBudget) - Math.abs(b.price * 100 - photoBudget))[0] : priced[0]
      const price = Math.round(pkg.price * 100)
      const free = brief.dates.filter((_, i) => (h >> i) % 4 !== 0)
      const dist = brief.location_text ? Math.round(((h % 600) / 10 + 2) * 10) / 10 : null
      const travels = dist == null ? null : dist < 45
      const styleMatch = brief.styles.length ? 0.55 + (h % 40) / 100 : null
      const fits = photoBudget == null ? null : price <= photoBudget
      const reasons = [
        free.length === brief.dates.length && brief.dates.length ? 'Free on your date' : free.length ? `Free on ${free.length} of your ${brief.dates.length} dates` : null,
        fits ? `${pkg.name} fits the photography budget` : null,
        p.rating != null && p.rating >= 4.7 ? `Rated ${p.rating.toFixed(1)} by ${p.reviewCount} clients` : null,
        styleMatch && styleMatch > 0.75 ? `Portfolio leans ${brief.styles[0]}` : null,
      ].filter(Boolean)
      return {
        provider_id: p.id, package_id: pkg.id, package_name: pkg.name, price_cents: price, fits_budget: fits,
        free_dates: free, free_on_all_dates: brief.dates.length > 0 && free.length === brief.dates.length,
        distance_km: dist, travels_to_event: travels, style_match: styleMatch, reasons,
        score: (fits ? 2 : 0) + free.length + (styleMatch || 0) + (p.rating || 0) / 5,
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)

  const typeName = { wedding: 'wedding', graduation: 'graduation shoot', headshots: 'headshot session', portrait: 'portrait session', party: 'party' }[type] || 'event'
  const reply = previous
    ? `Done — I ${notes.join(' and ') || 'updated the plan'}. Here's the refreshed shortlist.`
    : `Here's a first draft for your ${typeName}${total ? `. I split your budget and` : ' — I'} found photographers who are free on your ${brief.dates.length > 1 ? 'dates' : 'date'}.`

  return {
    engine: 'rules',
    reply,
    brief,
    questions: [
      !brief.guest_count && type === 'wedding' ? 'Roughly how many guests?' : null,
      !total ? 'What budget should I plan around?' : null,
      !brief.location_text ? 'Where will it be?' : null,
      ...(previous ? [] : fixture.questions.slice(0, 1)),
    ].filter(Boolean).slice(0, 3),
    budget,
    recommendations: [{ category: 'photography', label: 'Photography', budget_cents: photoBudget, options }],
    coming_soon: budget.filter((b) => !b.bookable && b.category !== 'other').map(({ category, label }) => ({ category, label })),
  }
}
