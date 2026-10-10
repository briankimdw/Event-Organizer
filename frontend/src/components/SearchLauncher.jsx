import { useNavigate } from 'react-router-dom'
import { MapPin, Search } from 'lucide-react'
import { useAuth } from '../auth.jsx'

// Looks like a search field; opens the full photographer search.
// Shows the signed-in user's city (from their profile) when they've set one.
export default function SearchLauncher({ placeholder = 'Search vendors, styles, occasions', className = '' }) {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const city = profile?.city?.split(',')[0]?.trim()
  return (
    <button className={`search ${className}`} onClick={() => navigate('/search')}>
      <Search size={16} />
      <span className="grow left-text ellipsis">{placeholder}</span>
      {city && <span className="loc-chip"><MapPin size={12} /> {city}</span>}
    </button>
  )
}
