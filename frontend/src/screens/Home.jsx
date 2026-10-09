import { Link } from 'react-router-dom'
import {
  Building2, Camera, ChevronRight, Plus, GraduationCap, Heart, Layers, Package, PartyPopper,
  Star, Users, UserSquare, Presentation,
} from 'lucide-react'
import { IdVerified, ProBadge } from '../components/Badges.jsx'
import ProfileLink from '../components/ProfileLink.jsx'
import SearchLauncher from '../components/SearchLauncher.jsx'
import { StatusPill, money, startingPrice } from '../components/Booking.jsx'
import { ErrorState, Loading } from '../components/States.jsx'
import { useAuth } from '../auth.jsx'
import useQuery from '../lib/useQuery.js'
import { addDays, fmtChip, toKey, today } from '../lib/dates.js'
import { getCategories, listProviders, searchProviders, withMatches } from '../api/catalog.js'
import { listMyBookings } from '../api/bookings.js'

// Icons for the service categories (by slug); anything new gets a camera.
const CATEGORY_ICONS = {
  wedding: Heart,
  graduation: GraduationCap,
  portrait: Camera,
  event: PartyPopper,
  headshots: UserSquare,
  'real-estate': Building2,
  product: Package,
  coaching: Presentation,
  meetups: Users,
}

// Booking states where the client has something to do.
const NEEDS_ACTION = {
  accepted: 'Pay the deposit to lock in your date',
  countered: 'Review the counter offer',
  delivered: 'Your photos are ready',
}

// The coming weekend: this Sat + Sun (just Sunday if today is Sunday).
function comingWeekend() {
  const t = today()
  if (t.getDay() === 0) return [t]
  const sat = addDays(t, 6 - t.getDay())
  return [sat, addDays(sat, 1)]
}

const byRating = (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || b.reviewCount - a.reviewCount

export default function Home() {
  const { user, profile } = useAuth()
  const uid = user?.id ?? null
  const firstName = (profile?.display_name || '').split(' ')[0]

  const weekendDays = comingWeekend()
  const weekendKeys = weekendDays.map(toKey)

  const cats = useQuery(() => getCategories(), [])
  const all = useQuery(() => listProviders().then(withMatches), [uid])
  const weekend = useQuery(() => searchProviders({ dates: weekendKeys }), [weekendKeys.join(',')])
  const bookings = useQuery(uid ? () => listMyBookings() : null, [uid])

  const providers = all.data || []
  const matchOf = new Map(providers.map((p) => [p.id, p.tasteMatch]))
  const hasMatches = providers.some((p) => p.tasteMatch != null)
  const matched = hasMatches
    ? providers.filter((p) => p.tasteMatch != null).sort((a, b) => b.tasteMatch - a.tasteMatch).slice(0, 5)
    : [...providers].sort(byRating).slice(0, 5)
  // Bottom list: top rated when the carousel is taste matches, otherwise the newest listings.
  const bottom = hasMatches
    ? { title: 'Top rated', list: [...providers].filter((p) => p.rating != null).sort(byRating).slice(0, 4) }
    : { title: 'New on photomatch', list: [...providers].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 4) }
  const freeThisWeekend = (weekend.data || [])
    .filter((p) => p.freeDates.length > 0)
    .map((p) => ({ ...p, tasteMatch: matchOf.get(p.id) ?? null }))
    .slice(0, 4)
  // Two real photos for the Discover banner, from different photographers.
  const bannerShots = providers.map((p) => p.cover).filter(Boolean).slice(0, 2)

  const myBookings = bookings.data || []
  const actionItems = myBookings.filter((b) => b.role === 'client' && NEEDS_ACTION[b.status])
  const upcoming = myBookings
    .filter((b) => ['requested', 'confirmed'].includes(b.status) && b.day >= today())
    .sort((a, b) => a.start - b.start)
  const bookingTiles = [...actionItems, ...upcoming]

  return (
    <div className="home">
      <header className="home-header">
        <div>
          <div className="muted small">{firstName ? `Hi ${firstName}` : 'Welcome'}</div>
          <div className="title-lg">Find your photographer</div>
        </div>
        <Link to="/upload" className="post-btn" aria-label="Post photos">
          <Plus size={18} /> Post
        </Link>
      </header>

      <div className="pad-x">
        <SearchLauncher placeholder="Search styles, occasions, names" />
      </div>

      {bookings.error && (
        <section>
          <SectionHead title="Your bookings" to="/bookings" />
          <ErrorState error={bookings.error} onRetry={bookings.reload} />
        </section>
      )}
      {bookingTiles.length > 0 && (
        <section>
          <SectionHead title="Your bookings" to="/bookings" />
          <div className="h-scroll">
            {bookingTiles.map((b) => (
              <Link key={b.id} to={`/bookings/${b.id}`} className={`booking-tile ${NEEDS_ACTION[b.status] ? 'action' : ''}`}>
                <ProfileLink id={b.provider.id} className="row gap-xs">
                  <img className="avatar sm" src={b.provider.avatar} alt="" />
                  <b className="small grow ellipsis">{b.provider.name}</b>
                </ProfileLink>
                <div className="small mt-xs">{b.packageName}</div>
                <div className="muted tiny">{b.date}</div>
                <div className="mt-sm">
                  {NEEDS_ACTION[b.status] ? <span className="action-text">{NEEDS_ACTION[b.status]} →</span> : <StatusPill status={b.status} />}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionHead title="What are you planning?" />
        {cats.loading && <Loading inline />}
        {cats.error && <ErrorState error={cats.error} onRetry={cats.reload} />}
        <div className="cat-grid pad-x">
          {(cats.data || []).map((c) => {
            const Icon = CATEGORY_ICONS[c.slug] || Camera
            return (
              <Link key={c.slug} to={`/search?cat=${encodeURIComponent(c.slug)}`} className="cat-tile">
                <Icon size={22} />
                <span>{c.name}</span>
              </Link>
            )
          })}
        </div>
      </section>

      <section>
        <SectionHead
          title={hasMatches ? 'Matched to your taste' : 'Top rated photographers'}
          sub={hasMatches ? 'Based on your Discover swipes' : 'Swipe in Discover to get matched'}
          to="/search"
        />
        {all.loading && <Loading inline />}
        {all.error && <ErrorState error={all.error} onRetry={all.reload} />}
        <div className="h-scroll">
          {matched.map((p) => (
            <Link key={p.id} to={`/u/${p.id}`} className="match-tile">
              <div className="match-tile-img">
                {p.cover ? <img src={p.cover} alt="" loading="lazy" /> : <div className="img-ph" />}
                {p.tasteMatch != null && <span className="match-badge">{p.tasteMatch}% match</span>}
              </div>
              <div className="pad-tile">
                <div className="person-name small">
                  {p.name} {p.idVerified && <IdVerified />} {p.pro && <ProBadge />}
                </div>
                <div className="muted tiny">{p.specialties.slice(0, 2).join(' · ')}</div>
                <div className="tiny row gap-xs mt-xs">
                  <RatingInline p={p} />
                  {startingPrice(p) != null && <span className="muted">· from {money(startingPrice(p))}</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="pad-x">
        <Link to="/discover" className="discover-banner">
          {bannerShots.length === 2 && (
            <div className="banner-stack">
              {bannerShots.map((src) => <img key={src} src={src} alt="" />)}
            </div>
          )}
          <div className="grow">
            <b>Not sure what style you want?</b>
            <div className="small">Swipe through real work and we'll match you with photographers.</div>
          </div>
          <Layers size={20} />
        </Link>
      </div>

      <section>
        <SectionHead
          title="Available this weekend"
          sub={weekendDays.map(fmtChip).join(' – ')}
          to={`/search?dates=${weekendKeys.join(',')}`}
        />
        <div className="pad-x">
          {weekend.loading && <Loading inline />}
          {weekend.error && <ErrorState error={weekend.error} onRetry={weekend.reload} />}
          {!weekend.loading && !weekend.error && freeThisWeekend.length === 0 && (
            <div className="muted small">Nobody has free time this weekend yet.</div>
          )}
          {freeThisWeekend.map((p) => (
            <ProviderRow key={p.id} p={p} />
          ))}
        </div>
      </section>

      {bottom.list.length > 0 && (
        <section>
          <SectionHead title={bottom.title} to="/search" />
          <div className="pad-x">
            {bottom.list.map((p) => (
              <ProviderRow key={p.id} p={p} />
            ))}
          </div>
        </section>
      )}
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

// "★ 4.9 (12)", or "New" before the first review.
function RatingInline({ p, count = false }) {
  if (p.rating == null) return <span className="new-tag">New</span>
  return (
    <>
      <Star size={11} className="star-on" fill="currentColor" /> {p.rating.toFixed(1)}
      {count && ` (${p.reviewCount})`}
    </>
  )
}

function ProviderRow({ p }) {
  const photo = p.covers[1] || p.cover
  return (
    <Link to={`/u/${p.id}`} className="provider-row">
      {photo ? <img className="provider-row-img" src={photo} alt="" loading="lazy" /> : <div className="provider-row-img img-ph" />}
      <div className="grow">
        <div className="person-name small">
          {p.name} {p.idVerified && <IdVerified />} {p.pro && <ProBadge />}
        </div>
        <div className="muted tiny">{p.specialties.join(' · ')}</div>
        <div className="tiny row gap-xs mt-xs">
          <RatingInline p={p} count />
          {startingPrice(p) != null && <span className="muted">· from {money(startingPrice(p))}</span>}
        </div>
      </div>
      {p.tasteMatch != null && (
        <div className="match"><b>{p.tasteMatch}%</b><span>match</span></div>
      )}
    </Link>
  )
}
