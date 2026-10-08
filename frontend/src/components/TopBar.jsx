import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

export default function TopBar({ title, subtitle, right, back = true }) {
  const navigate = useNavigate()
  return (
    <header className="topbar">
      <div className="topbar-side">
        {back && (
          <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Back">
            <ChevronLeft size={24} />
          </button>
        )}
      </div>
      <div className="topbar-title">
        <div>{title}</div>
        {subtitle && <small>{subtitle}</small>}
      </div>
      <div className="topbar-side right">{right}</div>
    </header>
  )
}
