import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { IdVerified, ProBadge } from './Badges.jsx'
import { PersonAvatar } from './ProfileLink.jsx'

// A person (photographer or client) that opens their profile. Hold the avatar to preview the photo.
export default function PersonRow({ person, sub, right, size = 36 }) {
  return (
    <div className="person-row">
      <Link to={`/u/${person.id}`} className="person-link">
        <PersonAvatar id={person.id} src={person.avatar} name={person.name} username={person.username} style={{ width: size, height: size }} />
        <div className="person-text">
          <div className="person-name">
            {person.name}
            {person.idVerified && <IdVerified />}
            {person.pro && <ProBadge />}
          </div>
          {sub && <div className="muted small">{sub}</div>}
        </div>
        <ChevronRight size={16} className="muted person-go" />
      </Link>
      {right}
    </div>
  )
}
