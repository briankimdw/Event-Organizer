import {
  Briefcase, Camera, Clapperboard, Film, GraduationCap, Heart, House, Music, Package, PartyPopper, Plane, Presentation, Smartphone,
  Sparkles, Store, UserRound, Users, Video,
} from 'lucide-react'
import { verticalMeta } from '../../verticals/index.js'

// Lucide icon names used by verticals/catalog.js (the vertical and its services) -> components.
// Listed explicitly so the bundle only carries these icons.
const ICONS = {
  Briefcase, Camera, Clapperboard, Film, GraduationCap, Heart, House, Music, Package, PartyPopper, Plane, Presentation, Smartphone,
  Sparkles, Store, UserRound, Users, Video,
}

/** The lucide component for an icon name (Store when unknown). */
export const iconFor = (name) => ICONS[name] || Store

// <VerticalIcon name="Camera" /> or <VerticalIcon vertical="photography" />.
export default function VerticalIcon({ name, vertical, size = 18, ...rest }) {
  const Icon = iconFor(name || verticalMeta(vertical).icon)
  return <Icon size={size} aria-hidden="true" {...rest} />
}

// Stands in for a cover photo when a listing has none (a photographer who hasn't posted yet):
// the vertical's tint with its icon, so cards never show an empty grey box.
export function CoverFallback({ vertical, className = '' }) {
  const m = verticalMeta(vertical)
  return (
    <div className={`cover-fallback ${className}`} style={{ '--tint': m.tint }} aria-hidden="true">
      <VerticalIcon name={m.icon} size={34} strokeWidth={1.5} />
    </div>
  )
}

// The icon in a soft circle of the vertical's tint.
export function VerticalBadge({ vertical, size = 36, className = '' }) {
  const m = verticalMeta(vertical)
  return (
    <span className={`v-badge ${className}`} style={{ '--tint': m.tint, width: size, height: size }}>
      <VerticalIcon name={m.icon} size={Math.round(size * 0.5)} />
    </span>
  )
}

// "📷 Photographer" style pill: the vertical's icon and noun (or name), tinted.
export function VerticalTag({ vertical, label, className = '' }) {
  const m = verticalMeta(vertical)
  const text = label ?? (m.noun ? m.noun[0].toUpperCase() + m.noun.slice(1) : m.name)
  return (
    <span className={`v-tag ${className}`} style={{ '--tint': m.tint }}>
      <VerticalIcon name={m.icon} size={12} /> {text}
    </span>
  )
}
