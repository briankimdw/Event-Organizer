import { useNavigate } from 'react-router-dom'
import { MapPin, Search } from 'lucide-react'

// Looks like a search field; opens the full photographer search.
export default function SearchLauncher({ placeholder = 'Search photographers, styles, occasions', className = '' }) {
  const navigate = useNavigate()
  return (
    <button className={`search ${className}`} onClick={() => navigate('/search')}>
      <Search size={16} />
      <span className="grow left-text ellipsis">{placeholder}</span>
      <span className="loc-chip"><MapPin size={12} /> LA</span>
    </button>
  )
}
