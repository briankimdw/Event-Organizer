import {
  Armchair, Baby, BookHeart, Briefcase, Brush, Building, CakeSlice, Camera, Car, ChefHat, ClipboardList, Crown, Flower2, Gem, Gift,
  GraduationCap, Heart, LayoutGrid, Leaf, Martini, Music, Palette, PartyPopper, Sparkles, Store, Users, Utensils, UtensilsCrossed, Video, Wine,
} from 'lucide-react'
import { verticalMeta } from '../../verticals/index.js'

// Lucide icon names used by verticals/catalog.js (verticals + occasions) -> components.
// Listed explicitly so the bundle only carries these icons.
const ICONS = {
  Armchair, Baby, BookHeart, Briefcase, Brush, Building, CakeSlice, Camera, Car, ChefHat, ClipboardList, Crown, Flower2, Gem, Gift,
  GraduationCap, Heart, LayoutGrid, Leaf, Martini, Music, Palette, PartyPopper, Sparkles, Store, Users, Utensils, UtensilsCrossed, Video, Wine,
}

/** The lucide component for an icon name (Store when unknown). */
export const iconFor = (name) => ICONS[name] || Store

// <VerticalIcon name="Camera" /> or <VerticalIcon vertical="catering" />.
export default function VerticalIcon({ name, vertical, size = 18, ...rest }) {
  const Icon = iconFor(name || verticalMeta(vertical).icon)
  return <Icon size={size} aria-hidden="true" {...rest} />
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
