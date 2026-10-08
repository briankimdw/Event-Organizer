import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarX, ChevronRight } from 'lucide-react'
import Segmented from '../components/Segmented.jsx'
import { StatusPill, money } from '../components/Booking.jsx'
import { useStore } from '../store.jsx'
import { findPackage } from '../data/mock.js'

const PAST = ['completed', 'declined', 'cancelled_by_client', 'cancelled_by_provider', 'refunded']
const NEEDS_ACTION = ['accepted', 'countered', 'delivered']

export default function Bookings() {
  const { bookings } = useStore()
  const [tab, setTab] = useState('active')
  const active = bookings.filter((b) => !PAST.includes(b.status))
  const list = tab === 'active' ? active : bookings.filter((b) => PAST.includes(b.status))
  const sorted = [...list].sort((a, b) => NEEDS_ACTION.includes(b.status) - NEEDS_ACTION.includes(a.status))

  return (
    <div>
      <header className="home-header">
        <div className="title-lg">Bookings</div>
      </header>
      <div className="pad-x">
        <Segmented
          options={[
            { value: 'active', label: `Active (${active.length})` },
            { value: 'past', label: 'Past' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>
      <div className="pad">
        {sorted.length === 0 && (
          <div className="empty">
            <CalendarX size={36} />
            <div>No bookings here yet.</div>
            <Link to="/" className="btn">Find a photographer</Link>
          </div>
        )}
        {sorted.map((b) => {
          const { provider, pkg } = findPackage(b.packageId)
          const needsAction = NEEDS_ACTION.includes(b.status)
          return (
            <Link key={b.id} to={`/bookings/${b.id}`} className={`booking-card ${needsAction ? 'action' : ''}`}>
              <img className="avatar" src={provider.avatar} alt="" />
              <div className="grow">
                <b className="small">{pkg.name}</b>
                <div className="muted tiny">{provider.name} · {b.date} · {b.time}</div>
                <div className="row gap-xs mt-xs">
                  <StatusPill status={b.status} />
                  {needsAction && <span className="tiny action-text">Action needed</span>}
                </div>
              </div>
              <div className="small">{money(b.counterTotal ?? b.total)}</div>
              <ChevronRight size={16} className="muted" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
