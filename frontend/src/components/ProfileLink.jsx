import { useNavigate } from 'react-router-dom'

// Opens a person's profile. Safe to use inside other links and draggable cards:
// it stops the outer link/drag from also handling the tap.
export default function ProfileLink({ id, children, className = '' }) {
  const navigate = useNavigate()
  const go = (e) => {
    e.preventDefault()
    e.stopPropagation()
    navigate(`/u/${id}`)
  }
  return (
    <span
      role="link"
      tabIndex={0}
      className={`profile-link ${className}`}
      onClick={go}
      onKeyDown={(e) => e.key === 'Enter' && go(e)}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </span>
  )
}
