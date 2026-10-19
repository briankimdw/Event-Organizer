import { iconFor } from '../verticals/VerticalIcon.jsx'
import './home.css'

// A catalog icon by lucide name (the vertical and its services in verticals/catalog.js).
export default function CatalogIcon({ name, size = 20, ...rest }) {
  const Icon = iconFor(name)
  return <Icon size={size} aria-hidden="true" {...rest} />
}

// An icon in a soft tinted circle (a vertical or service "badge").
//   item: { icon, tint }
export function TintIcon({ item, size = 44, iconSize, className = '' }) {
  return (
    <span className={`tint-icon ${className}`} style={{ '--tint': item.tint, width: size, height: size }}>
      <CatalogIcon name={item.icon} size={iconSize || Math.round(size * 0.48)} />
    </span>
  )
}
