import { NavLink } from 'react-router-dom'
import { Home, Layers, CalendarCheck, MessageCircle, User } from 'lucide-react'

const tabs = [
  { to: '/', label: 'Home', Icon: Home },
  { to: '/discover', label: 'Discover', Icon: Layers },
  { to: '/bookings', label: 'Bookings', Icon: CalendarCheck },
  { to: '/inbox', label: 'Inbox', Icon: MessageCircle },
  { to: '/me', label: 'Me', Icon: User },
]

export default function TabBar() {
  return (
    <nav className="tabbar">
      {tabs.map(({ to, label, Icon }) => (
        <NavLink key={to} to={to} end className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
          <Icon size={22} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
