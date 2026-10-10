import { Link } from 'react-router-dom'
import { CalendarHeart, UserPlus } from 'lucide-react'
import './events.css'

// Under the AI planner's "Saved to My events": plan it with friends next.
export default function PlanSavedActions({ eventId }) {
  if (!eventId) return null
  return (
    <div className="row gap-xs mt-sm">
      <Link to={`/events/${eventId}?invite=1`} className="btn grow">
        <UserPlus size={16} /> Invite friends
      </Link>
      <Link to={`/events/${eventId}`} className="btn ghost grow">
        <CalendarHeart size={16} /> Open event
      </Link>
    </div>
  )
}
