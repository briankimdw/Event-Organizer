import { useNavigate } from 'react-router-dom'
import { useAvatarViewer, useLongPress } from './AvatarViewer.jsx'

// Opens a person's profile. Safe to use inside other links and draggable cards:
// it stops the outer link/drag from also handling the tap.
//   to:      somewhere other than /u/:id (e.g. `/u/${id}?tab=reviews`)
//   preview: { src, name, username } makes a long press open the profile photo viewer
//   label:   accessible name when the children are just an image
export default function ProfileLink({ id, to, preview, label, children, className = '' }) {
  const navigate = useNavigate()
  const viewAvatar = useAvatarViewer()
  const { handlers, consumed } = useLongPress(
    preview?.src ? (el) => viewAvatar({ ...preview, to: `/u/${id}`, from: el.querySelector('img') || el }) : null,
  )
  const go = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (consumed()) return
    navigate(to || `/u/${id}`)
  }
  return (
    <span
      role="link"
      tabIndex={0}
      aria-label={label}
      className={`profile-link ${className}`}
      onClick={go}
      onKeyDown={(e) => e.key === 'Enter' && go(e)}
      {...handlers}
      onPointerDown={(e) => {
        e.stopPropagation()
        handlers.onPointerDown(e)
      }}
    >
      {children}
    </span>
  )
}

// A small avatar: tap opens the profile, press and hold previews the photo.
export function PersonAvatar({ id, src, name, username, className = 'avatar', style, to, linkClass = '' }) {
  if (!id) return <img className={className} src={src} alt="" style={style} />
  return (
    <ProfileLink id={id} to={to} preview={{ src, name, username }} label={name ? `${name}’s profile` : 'Profile'} className={`avatar-link ${linkClass}`}>
      <img className={className} src={src} alt="" style={style} draggable={false} />
    </ProfileLink>
  )
}
