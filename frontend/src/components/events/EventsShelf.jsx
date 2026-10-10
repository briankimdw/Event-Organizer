import { Link } from 'react-router-dom'
import { CalendarHeart, ChevronRight } from 'lucide-react'
import { SectionHead } from '../home/Cards.jsx'
import { EventRow } from './EventParts.jsx'
import { useAuth } from '../../auth.jsx'
import useQuery from '../../lib/useQuery.js'
import { listUpcomingEvents } from '../../api/events.js'
import './events.css'

// "Your events" on Home (hidden until you have one) and Me (with a "plan one" card).
export default function EventsShelf({ showEmpty = false, title = 'Your events' }) {
  const { user } = useAuth()
  const events = useQuery(user ? () => listUpcomingEvents(3) : null, [user?.id])
  if (!user) return null
  const list = events.data || []
  if (!list.length && (!showEmpty || events.loading || events.error)) return null
  return (
    <section>
      <SectionHead title={title} sub={list.length ? 'Planning with friends' : null} to="/events" cta={list.length ? 'See all' : 'Open'} />
      <div className="pad-x">
        {list.length ? (
          <div className="ev-list">{list.map((ev) => <EventRow key={ev.id} ev={ev} />)}</div>
        ) : (
          <Link to="/events/new" className="empty-card">
            <CalendarHeart size={20} />
            <div className="grow">
              <b className="small">Plan an event with friends</b>
              <div className="muted tiny">Invite people, pick vendors together, one group chat.</div>
            </div>
            <ChevronRight size={16} />
          </Link>
        )}
      </div>
    </section>
  )
}
