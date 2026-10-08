import { Link } from 'react-router-dom'
import {
  Building2, Camera, ChevronRight, GraduationCap, Heart, Layers, Package, PartyPopper,
  Star, Users, UserSquare, Presentation,
} from 'lucide-react'
import { IdVerified, ProBadge } from '../components/Badges.jsx'
import ProfileLink from '../components/ProfileLink.jsx'
import SearchLauncher from '../components/SearchLauncher.jsx'
import { StatusPill, money, startingPrice } from '../components/Booking.jsx'
import { useStore } from '../store.jsx'
import { findPackage, img, me, providers, tasteProfile } from '../data/mock.js'

const CATEGORY_ICONS = [
  ['Wedding', Heart],
  ['Graduation', GraduationCap],
  ['Portrait', Camera],
  ['Event', PartyPopper],
  ['Headshots', UserSquare],
  ['Real estate', Building2],
  ['Product', Package],
  ['Coaching', Presentation],
  ['Meetups', Users],
]

// Booking states where the client has something to do.
const NEEDS_ACTION = {
  accepted: 'Pay the deposit to lock in your date',
  countered: 'Review the counter offer',
  delivered: 'Your photos are ready',
}

// Oct 10–11 are offsets 2 and 3 in each provider's availability list.
const WEEKEND = [2, 3]

export default function Home() {
  const { bookings } = useStore()

  const actionItems = bookings.filter((b) => NEEDS_ACTION[b.status])
  const upcoming = bookings.filter((b) => ['requested', 'confirmed'].includes(b.status))
  const matched = [...providers].sort((a, b) => b.tasteMatch - a.tasteMatch).slice(0, 5)
  const weekend = providers.filter((p) => WEEKEND.some((d) => !p.unavailable.includes(d)) && p.packages.some((x) => x.price))
  const topNear = providers.filter((p) => p.distanceKm <= 20).sort((a, b) => b.rating - a.rating).slice(0, 4)

  return (
    <div className="home">
      <header className="home-header">
        <div>
          <div className="muted small">Hi {me.name.split(' ')[0]}</div>
          <div className="title-lg">Find your photographer</div>
        </div>
      </header>

      <div className="pad-x">
        <SearchLauncher placeholder="Search styles, occasions, names" />
      </div>

      {(actionItems.length > 0 || upcoming.length > 0) && (
        <section>
          <SectionHead title="Your bookings" to="/bookings" />
          <div className="h-scroll">
            {[...actionItems, ...upcoming].map((b) => {
              const { provider, pkg } = findPackage(b.packageId)
              return (
                <Link key={b.id} to={`/bookings/${b.id}`} className={`booking-tile ${NEEDS_ACTION[b.status] ? 'action' : ''}`}>
                  <ProfileLink id={provider.id} className="row gap-xs">
                    <img className="avatar sm" src={provider.avatar} alt="" />
                    <b className="small grow ellipsis">{provider.name}</b>
                  </ProfileLink>
                  <div className="small mt-xs">{pkg.name}</div>
                  <div className="muted tiny">{b.date}</div>
                  <div className="mt-sm">
                    {NEEDS_ACTION[b.status] ? <span className="action-text">{NEEDS_ACTION[b.status]} →</span> : <StatusPill status={b.status} />}
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      <section>
        <SectionHead title="What are you planning?" />
        <div className="cat-grid pad-x">
          {CATEGORY_ICONS.map(([name, Icon]) => (
            <Link key={name} to={`/search?cat=${encodeURIComponent(name)}`} className="cat-tile">
              <Icon size={22} />
              <span>{name}</span>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <SectionHead title="Matched to your taste" sub={`Based on your ${tasteProfile.swipes} swipes`} to="/search" />
        <div className="h-scroll">
          {matched.map((p) => (
            <Link key={p.id} to={`/u/${p.id}`} className="match-tile">
              <div className="match-tile-img">
                <img src={img(`${p.id}-grid-0`, 400, 300)} alt="" loading="lazy" />
                <span className="match-badge">{p.tasteMatch}% match</span>
              </div>
              <div className="pad-tile">
                <div className="person-name small">
                  {p.name} {p.idVerified && <IdVerified />} {p.pro && <ProBadge />}
                </div>
                <div className="muted tiny">{p.specialties.slice(0, 2).join(' · ')}</div>
                <div className="tiny row gap-xs mt-xs">
                  <Star size={11} className="star-on" fill="currentColor" /> {p.rating}
                  <span className="muted">· from {money(startingPrice(p))}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="pad-x">
        <Link to="/discover" className="discover-banner">
          <div className="banner-stack">
            <img src={img('d2-p2-1', 120, 160)} alt="" />
            <img src={img('d1-p1-1', 120, 160)} alt="" />
          </div>
          <div className="grow">
            <b>Not sure what style you want?</b>
            <div className="small">Swipe through real work and we'll match you with photographers.</div>
          </div>
          <Layers size={20} />
        </Link>
      </div>

      <section>
        <SectionHead title="Available this weekend" sub="Sat Oct 10 – Sun Oct 11" to="/search" />
        <div className="pad-x">
          {weekend.slice(0, 4).map((p) => (
            <ProviderRow key={p.id} p={p} />
          ))}
        </div>
      </section>

      <section>
        <SectionHead title="Top rated near you" to="/search" />
        <div className="pad-x">
          {topNear.map((p) => (
            <ProviderRow key={p.id} p={p} />
          ))}
        </div>
      </section>
    </div>
  )
}

function SectionHead({ title, sub, to }) {
  return (
    <div className="section-head">
      <div>
        <h3>{title}</h3>
        {sub && <div className="muted tiny">{sub}</div>}
      </div>
      {to && (
        <Link to={to} className="small muted inline-icon">
          See all <ChevronRight size={14} />
        </Link>
      )}
    </div>
  )
}

function ProviderRow({ p }) {
  return (
    <Link to={`/u/${p.id}`} className="provider-row">
      <img className="provider-row-img" src={img(`${p.id}-grid-1`, 200, 200)} alt="" loading="lazy" />
      <div className="grow">
        <div className="person-name small">
          {p.name} {p.idVerified && <IdVerified />} {p.pro && <ProBadge />}
        </div>
        <div className="muted tiny">{p.specialties.join(' · ')}</div>
        <div className="tiny row gap-xs mt-xs">
          <Star size={11} className="star-on" fill="currentColor" /> {p.rating} ({p.reviewCount})
          <span className="muted">· {p.distanceKm} km · from {money(startingPrice(p))}</span>
        </div>
      </div>
      <div className="match"><b>{p.tasteMatch}%</b><span>match</span></div>
    </Link>
  )
}

