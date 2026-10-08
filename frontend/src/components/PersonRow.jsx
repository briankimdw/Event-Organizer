import { Link } from 'react-router-dom'
import { IdVerified, ProBadge } from './Badges.jsx'

export default function PersonRow({ person, sub, right, size = 36 }) {
  return (
    <div className="person-row">
      <Link to={`/u/${person.id}`} className="person-link">
        <img className="avatar" src={person.avatar} alt="" style={{ width: size, height: size }} />
        <div className="person-text">
          <div className="person-name">
            {person.name}
            {person.idVerified && <IdVerified />}
            {person.pro && <ProBadge />}
          </div>
          {sub && <div className="muted small">{sub}</div>}
        </div>
      </Link>
      {right}
    </div>
  )
}
