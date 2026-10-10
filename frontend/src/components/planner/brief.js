// Display helpers for planner briefs, plus the precise follow-up messages sent
// when the user corrects a field by hand.
import { Briefcase, Camera, Cake, GraduationCap, Heart, PartyPopper, Sparkles, UserSquare } from 'lucide-react'
import { money } from '../../lib/format.js'
import { fromKey } from '../../lib/dates.js'
import { eventTypeName } from '../../api/events.js'

export const EVENT_TYPES = [
  ['wedding', 'Wedding'],
  ['engagement', 'Engagement'],
  ['graduation', 'Graduation'],
  ['headshots', 'Headshots'],
  ['portrait', 'Portrait session'],
  ['party', 'Party'],
  ['corporate', 'Corporate event'],
  ['event', 'Other event'],
]
export const STYLE_SUGGESTIONS = ['candid', 'moody', 'editorial', 'bright & airy', 'film', 'documentary', 'classic', 'golden hour']

const TYPE_ICONS = {
  wedding: Heart,
  engagement: Heart,
  graduation: GraduationCap,
  headshots: UserSquare,
  portrait: Camera,
  party: PartyPopper,
  birthday: Cake,
  corporate: Briefcase,
  event: PartyPopper,
}
export const typeIcon = (type) => TYPE_ICONS[type] || Sparkles
export { eventTypeName }

export const cents = (c) => (c == null ? null : money(Math.round(c) / 100))
// "$15k" for the compact summary chips, "$1,500" below 10k.
export const centsShort = (c) => {
  if (c == null) return null
  const d = c / 100
  return d >= 10000 ? `$${(d / 1000).toFixed(d % 1000 === 0 ? 0 : 1)}k` : money(Math.round(d))
}

const md = (k) => fromKey(k).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const mdy = (k) => fromKey(k).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const sameYear = (a, b) => a.slice(0, 4) === b.slice(0, 4)
const contiguous = (keys) => keys.every((k, i) => i === 0 || (fromKey(k) - fromKey(keys[i - 1])) / 86400000 === 1)

// "Jun 12, 2027", "Jun 12 – 14, 2027", "Jun 12, 13 & 20", or null.
export function datesLabel(brief) {
  const keys = [...(brief?.dates || [])].sort()
  if (!keys.length && brief?.start_date) keys.push(brief.start_date, ...(brief.end_date && brief.end_date !== brief.start_date ? [brief.end_date] : []))
  if (!keys.length) return null
  if (keys.length === 1) return mdy(keys[0])
  const first = keys[0]
  const last = keys[keys.length - 1]
  if (contiguous(keys)) {
    const sameMonth = first.slice(0, 7) === last.slice(0, 7)
    if (sameMonth) return `${md(first)} – ${fromKey(last).getDate()}, ${last.slice(0, 4)}`
    return sameYear(first, last) ? `${md(first)} – ${md(last)}, ${last.slice(0, 4)}` : `${mdy(first)} – ${mdy(last)}`
  }
  if (keys.length <= 3) return `${keys.slice(0, -1).map(md).join(', ')} & ${md(last)}`
  return `${keys.length} dates from ${md(first)}`
}

// Short list of dates for "free on" lines.
export const shortDates = (keys) => (keys.length <= 2 ? keys.map(md).join(' & ') : `${keys.slice(0, 2).map(md).join(', ')} +${keys.length - 2}`)

const list = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

// The sentence sent to the planner when a chip is edited (the edited brief goes as `previous` too).
export function followUpFor(field, brief) {
  switch (field) {
    case 'event_type':
      return `It's a ${eventTypeName(brief.event_type).toLowerCase()}.`
    case 'dates': {
      const keys = [...brief.dates].sort()
      return keys.length ? `Change the date${keys.length > 1 ? 's' : ''} to ${list(keys.map(mdy))}.` : 'I haven’t picked a date yet.'
    }
    case 'location_text':
      return brief.location_text ? `The location is ${brief.location_text}.` : 'I haven’t picked a location yet.'
    case 'budget_total_cents':
      return brief.budget_total_cents != null ? `Set my total budget to ${cents(brief.budget_total_cents)}.` : 'I don’t have a budget yet.'
    case 'guest_count':
      return brief.guest_count != null ? `There will be ${brief.guest_count} guests.` : 'I’m not sure how many guests yet.'
    case 'styles':
      return brief.styles.length ? `The style I want is ${list(brief.styles)}.` : 'I don’t have a style preference.'
    default:
      return 'Update the plan.'
  }
}
