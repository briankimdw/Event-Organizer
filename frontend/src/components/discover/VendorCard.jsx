import { Link } from 'react-router-dom'
import { CalendarCheck, ChevronRight } from 'lucide-react'
import CatalogIcon from '../home/CatalogIcon.jsx'
import AttributeList from '../verticals/AttributeList.jsx'
import { priceLabel } from '../Booking.jsx'
import useQuery from '../../lib/useQuery.js'
import { addDays, toKey, today } from '../../lib/dates.js'
import { freeDays } from '../../api/catalog.js'
import { verticalConfig, verticalMeta } from '../../verticals/index.js'
import './discover.css'

// When a vendor is next free in the coming 2 weeks: "Free today", "Free Sat, Oct 17", or
// "Booked up for 2 weeks". null while loading (or when `active` is false).
export function useNextFree(providerId, active = true) {
  const days = Array.from({ length: 14 }, (_, i) => addDays(today(), i))
  const free = useQuery(active && providerId ? () => freeDays(providerId, days) : null, [providerId, active])
  if (!free.data) return null
  const first = days.find((d) => free.data.has(toKey(d)))
  if (!first) return 'Booked up for 2 weeks'
  if (toKey(first) === toKey(today())) return 'Free today'
  return `Free ${first.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`
}

// The face of a vendor card in the swipe deck (vendors with no posts to swipe through,
// and non-visual verticals). Without cover photos it's drawn in the vertical's colour,
// with the vendor's key facts, a packages preview and when they're next free.
//   card: a VendorCard from api/discover.js   shot: the cover shown (when there are covers)
//   active: true for the top card (loads availability)
export function VendorFace({ card, shot = 0, active = false }) {
  const p = card.provider
  const v = verticalMeta(card.vertical)
  const nextFree = useNextFree(p.id, active)
  const cover = card.photos[shot] ?? card.photos[0]
  const pkgs = (p.packages || []).slice(0, 2)
  return (
    <div className={`dc-vendor ${cover ? 'has-cover' : ''}`} style={{ '--tint': v.tint }}>
      {cover ? (
        <img src={cover.src} alt="" draggable={false} className="dc-vendor-cover" />
      ) : (
        <span className="dc-vendor-art" aria-hidden="true">
          <CatalogIcon name={v.icon} size={150} strokeWidth={1.2} />
        </span>
      )}
      <div className="dc-vendor-body">
        <span className="dc-vendor-kind">
          <CatalogIcon name={v.icon} size={13} /> {v.noun[0].toUpperCase() + v.noun.slice(1)}
          {p.city ? ` · ${p.city.split(',')[0]}` : ''}
        </span>
        {!cover && <img className="dc-vendor-avatar" src={p.avatar} alt="" draggable={false} />}
        <h2 className="dc-vendor-name">{p.name}</h2>
        {card.lines.length > 0 && (
          <ul className="dc-vendor-facts" aria-label="Highlights">
            {card.lines.map((l) => <li key={l}>{l}</li>)}
          </ul>
        )}
        {pkgs.length > 0 && (
          <ul className="dc-vendor-pkgs" aria-label="Packages">
            {pkgs.map((pkg) => (
              <li key={pkg.id}>
                <span className="ellipsis">{pkg.name}</span>
                <b>{priceLabel(pkg)}</b>
              </li>
            ))}
            {p.packages.length > 2 && <li className="more">+{p.packages.length - 2} more</li>}
          </ul>
        )}
        {nextFree && (
          <span className="dc-vendor-free">
            <CalendarCheck size={13} aria-hidden="true" /> {nextFree}
          </span>
        )}
      </div>
    </div>
  )
}

// Vendor details for the deck's details sheet: about, facts from the vertical's
// fields, services and packages (booking links).
export function VendorDetails({ provider: p }) {
  const config = verticalConfig(p.vertical)
  return (
    <>
      {p.bio && <p className="small mt-sm dc-bio">{p.bio}</p>}
      <AttributeList fields={config.providerFields} attrs={p.attributes} className="mt-sm" />
      {p.categories.length > 0 && (
        <>
        <div className="muted small mt-sm">Services</div>
        <div className="chips mt-xs">
          {p.categories.map((c) => <span key={c} className="chip">{c}</span>)}
        </div>
        </>
      )}
      <h2 className="section-title h4">Packages</h2>
      {p.packages.length === 0 && <div className="muted small">No packages listed yet. Ask for a quote.</div>}
      {p.packages.map((pkg) => (
        <Link key={pkg.id} to={`/book/${p.id}?pkg=${pkg.id}`} className="pkg-line small line" aria-label={`Book ${pkg.name}, ${priceLabel(pkg)}`}>
          <span className="grow">{pkg.name}</span>
          <b>{priceLabel(pkg)}</b>
          <ChevronRight size={14} className="muted" />
        </Link>
      ))}
    </>
  )
}
