import { Link } from 'react-router-dom'
import { Send, Store } from 'lucide-react'
import { TintIcon } from './CatalogIcon.jsx'
import { useStore } from '../../store.jsx'
import { inviteMessage, pluralLower } from '../../api/home.js'
import { OCCASIONS, VERTICALS } from '../../verticals/catalog.js'
import './home.css'

// Uber Eats-style category tiles: every vertical as a tinted icon, two rows that
// scroll sideways. Tap -> /services/:vertical.
//   counts: Map(vertical slug -> providers), for the accessible label only.
// The grid fills column by column, so interleave the halves: row 1 then reads
// as the first half of the catalog (the most-booked services), row 2 the rest.
const half = Math.ceil(VERTICALS.length / 2)
const RAIL_ORDER = VERTICALS.slice(0, half).flatMap((v, i) => [v, VERTICALS[half + i]].filter(Boolean))

export function VerticalRail({ counts }) {
  return (
    <nav className="hd-rail scroll-x" aria-label="Services">
      {RAIL_ORDER.map((v) => {
        const n = counts?.get(v.slug) || 0
        return (
          <Link
            key={v.slug}
            to={`/services/${v.slug}`}
            className="hd-rail-item"
            aria-label={`${v.name}${counts ? (n ? `, ${n} available` : ', coming soon') : ''}`}
          >
            <TintIcon item={v} size={52} />
            <span>{v.name}</span>
          </Link>
        )
      })}
    </nav>
  )
}

// The Knot-style "Plan by occasion" cards. Tap -> /occasions/:slug.
export function OccasionRow() {
  return (
    <div className="h-scroll hd-occasions">
      {OCCASIONS.map((o) => (
        <Link key={o.slug} to={`/occasions/${o.slug}`} className="hd-occasion" style={{ '--tint': o.tint }}>
          <TintIcon item={o} size={40} className="on-card" />
          <b>{o.name}</b>
          <span className="tiny">{o.needs.length} vendor types</span>
        </Link>
      ))}
    </div>
  )
}

// "Know a great caterer? Invite them": shares the app, or copies the link.
export function useInvite() {
  const { toast } = useStore()
  return async (vertical = null) => {
    const { title, text } = inviteMessage(vertical)
    const url = window.location.origin
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url })
        return
      }
      await navigator.clipboard.writeText(`${text} ${url}`)
      toast('Invite link copied. Send it to them!')
    } catch (e) {
      if (e?.name !== 'AbortError') toast('Couldn’t share. Copy the link from your browser instead.')
    }
  }
}

// Marketplace cold start: verticals with no providers yet, as one calm card
// instead of many empty sections.
//   soon: catalog verticals with no providers
export function ComingSoonCard({ soon }) {
  const invite = useInvite()
  if (!soon.length) return null
  const names = soon.slice(0, 3).map((v, i) => (i ? pluralLower(v) : v.plural))
  const more = soon.length - names.length
  const first = soon[0]
  return (
    <div className="hd-soon">
      <div className="hd-soon-icons" aria-hidden="true">
        {soon.slice(0, 6).map((v) => (
          <TintIcon key={v.slug} item={v} size={34} />
        ))}
      </div>
      <b className="block mt-sm">Coming soon near you</b>
      <p className="muted small mt-xs">
        {names.join(', ')}
        {more > 0 ? ` and ${more} more` : ''} are joining. Know a great {first.noun}? Invite them, and you’ll be able to book them here.
      </p>
      <div className="row gap-xs mt">
        <button className="btn sm grow" onClick={() => invite(first)}>
          <Send size={14} /> Invite a vendor
        </button>
        <Link to="/new-listing" className="btn sm ghost grow">
          <Store size={14} /> List your services
        </Link>
      </div>
    </div>
  )
}
