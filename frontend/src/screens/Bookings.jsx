import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarX, ChevronDown, ChevronRight, Clock, MapPin, Search, Star, X } from 'lucide-react'
import DatePicker from '../components/DatePicker.jsx'
import ProfileLink from '../components/ProfileLink.jsx'
import SearchLauncher from '../components/SearchLauncher.jsx'
import { StatusPill, money } from '../components/Booking.jsx'
import { useStore } from '../store.jsx'
import { findPackage } from '../data/mock.js'
import { TODAY, fmtChip, fromKey, isPast, toKey } from '../data/dates.js'

const PAST = ['completed', 'declined', 'cancelled_by_client', 'cancelled_by_provider', 'refunded']
const NEEDS_ACTION = {
  accepted: { title: 'Pay deposit to confirm', cta: 'Pay deposit' },
  countered: { title: 'New price offered', cta: 'Review offer' },
  delivered: { title: 'Your photos are ready', cta: 'View gallery' },
}

const monthLabel = (d) => d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

const countdown = (date) => {
  const days = Math.round((date - TODAY) / 86400000)
  if (days < 0) return null
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days < 60) return `In ${days} days`
  return `In ${Math.round(days / 30)} months`
}

export default function Bookings() {
  const navigate = useNavigate()
  const { bookings } = useStore()
  const [month, setMonth] = useState(new Date(TODAY.getFullYear(), TODAY.getMonth(), 1))
  const [selected, setSelected] = useState([]) // date keys
  const [showPast, setShowPast] = useState(false)

  const withDates = bookings.map((b) => ({ ...b, when: new Date(b.date) }))
  const byDay = withDates.reduce((acc, b) => {
    ;(acc[toKey(b.when)] ??= []).push(b)
    return acc
  }, {})
  const dots = Object.fromEntries(Object.entries(byDay).map(([k, list]) => [k, list.map((b) => b.status)]))

  const attention = withDates.filter((b) => NEEDS_ACTION[b.status])
  const upcoming = withDates
    .filter((b) => !PAST.includes(b.status) && !NEEDS_ACTION[b.status])
    .sort((a, b) => a.when - b.when)
  const past = withDates.filter((b) => PAST.includes(b.status)).sort((a, b) => b.when - a.when)

  // When the visible month has nothing active, offer a jump to the next booking.
  const inMonth = (b) => b.when.getFullYear() === month.getFullYear() && b.when.getMonth() === month.getMonth()
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 1)
  const activeThisMonth = [...attention, ...upcoming].some(inMonth)
  const nextBooked = upcoming.find((b) => b.when >= monthEnd)

  const toggle = (key) => setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key].sort()))
  // Past days can only be opened to look at what was booked on them.
  const disabled = (d) => isPast(d) && !byDay[toKey(d)]
  const futureSelected = selected.filter((k) => !isPast(fromKey(k)))
  const selectedBookings = selected.flatMap((k) => byDay[k] || [])

  const findPhotographers = () => navigate(`/search?dates=${futureSelected.join(',')}`)

  return (
    <div className="bookings">
      <header className="home-header">
        <div className="title-lg">Bookings</div>
        <span className="muted small">{upcoming.length + attention.length} active</span>
      </header>

      <div className="pad-x mb-sm">
        <SearchLauncher placeholder="Find a photographer to book" />
      </div>

      <div className="pad-x">
        <div className="bk-cal">
          <DatePicker selected={selected} onToggle={toggle} dots={dots} isDisabled={disabled} month={month} onMonthChange={setMonth} />

          {selected.length > 0 ? (
            <div className="bk-cal-selected">
              <div className="row between">
                <div className="chips">
                  {selected.map((k) => (
                    <button key={k} className="chip date-chip" onClick={() => toggle(k)}>
                      {fmtChip(fromKey(k))} <X size={12} />
                    </button>
                  ))}
                </div>
                <button className="link-btn small muted" onClick={() => setSelected([])}>Clear</button>
              </div>
              {selectedBookings.map((b) => <MiniBooking key={b.id} b={b} />)}
              {futureSelected.length > 0 && (
                <button className="btn accent block" onClick={findPhotographers}>
                  <Search size={16} /> Find photographers for {futureSelected.length === 1 ? fmtChip(fromKey(futureSelected[0])) : `${futureSelected.length} dates`}
                </button>
              )}
            </div>
          ) : (
            <div className="bk-cal-hint">
              <span className="muted tiny">Tap the dates you need a photographer for</span>
              {!activeThisMonth && nextBooked && (
                <button
                  className="link-btn tiny"
                  onClick={() => setMonth(new Date(nextBooked.when.getFullYear(), nextBooked.when.getMonth(), 1))}
                >
                  Next booking: {nextBooked.when.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} <ChevronRight size={12} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {attention.length > 0 && (
        <section className="pad-x">
          <h4 className="section-title">Needs your attention</h4>
          {attention.map((b) => {
            const { provider, pkg } = findPackage(b.packageId)
            const a = NEEDS_ACTION[b.status]
            return (
              <Link key={b.id} to={b.status === 'delivered' ? `/bookings/${b.id}/delivery` : `/bookings/${b.id}`} className="attention-card">
                <ProfileLink id={provider.id}><img className="attention-img" src={provider.avatar} alt="" /></ProfileLink>
                <div className="grow">
                  <b className="small">{a.title}</b>
                  <div className="muted tiny">{pkg.name} with <ProfileLink id={provider.id}>{provider.name.split(' ')[0]}</ProfileLink> · {b.date}</div>
                </div>
                <span className="att-cta">{a.cta}</span>
              </Link>
            )
          })}
        </section>
      )}

      <section className="pad-x">
        <h4 className="section-title">Upcoming</h4>
        {upcoming.length === 0 && (
          <div className="empty compact">
            <CalendarX size={32} />
            <div className="small">Nothing coming up.</div>
            <Link to="/" className="btn sm">Find a photographer</Link>
          </div>
        )}
        {upcoming.map((b, i) => {
          const showMonth = i === 0 || monthLabel(b.when) !== monthLabel(upcoming[i - 1].when)
          return (
            <div key={b.id}>
              {showMonth && <div className="month-label">{monthLabel(b.when)}</div>}
              <TimelineItem b={b} />
            </div>
          )
        })}
      </section>

      {past.length > 0 && (
        <section className="pad-x">
          <button className="past-toggle" onClick={() => setShowPast(!showPast)}>
            <span>Past bookings · {past.length}</span>
            <ChevronDown size={18} style={{ transform: showPast ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
          </button>
          {showPast && past.map((b) => <TimelineItem key={b.id} b={b} past />)}
        </section>
      )}
    </div>
  )
}

function TimelineItem({ b, past }) {
  const { provider, pkg } = findPackage(b.packageId)
  const soon = countdown(b.when)
  const needsReview = b.status === 'completed' && !b.myReview
  return (
    <Link to={`/bookings/${b.id}`} className={`bk-item ${past ? 'past' : ''}`}>
      <div className="date-block">
        <span>{b.when.toLocaleDateString('en-US', { month: 'short' })}</span>
        <b>{b.when.getDate()}</b>
        <span>{b.when.toLocaleDateString('en-US', { weekday: 'short' })}</span>
      </div>
      <div className="bk-body">
        <div className="row between">
          <b className="small">{pkg.name}</b>
          <StatusPill status={b.status} />
        </div>
        <ProfileLink id={provider.id} className="row gap-xs mt-xs">
          <img className="avatar sm" src={provider.avatar} alt="" />
          <span className="small">{provider.name}</span>
        </ProfileLink>
        <div className="bk-meta">
          <span><Clock size={12} /> {b.time}</span>
          <span><MapPin size={12} /> {b.location}</span>
        </div>
        <div className="row between mt-xs">
          {!past && soon ? <span className="countdown">{soon}</span> : <span />}
          {needsReview ? (
            <span className="review-nudge"><Star size={12} /> Leave a review</span>
          ) : (
            <span className="muted tiny">{money(b.counterTotal ?? b.total)}</span>
          )}
        </div>
      </div>
    </Link>
  )
}

function MiniBooking({ b }) {
  const { provider, pkg } = findPackage(b.packageId)
  return (
    <Link to={`/bookings/${b.id}`} className="mini-booking">
      <ProfileLink id={provider.id}><img className="avatar sm" src={provider.avatar} alt="" /></ProfileLink>
      <div className="grow">
        <b className="small">{pkg.name}</b>
        <div className="muted tiny">{fmtChip(b.when)} · {b.time} · <ProfileLink id={provider.id}>{provider.name}</ProfileLink></div>
      </div>
      <StatusPill status={b.status} />
    </Link>
  )
}
