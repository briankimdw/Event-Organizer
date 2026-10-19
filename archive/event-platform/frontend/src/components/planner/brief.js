// Planner brief helpers for the web: the shared plain-JS helpers (lib/planBrief.js,
// also used by the Expo app) plus icon components for event types.
import { Camera, UserSquare } from 'lucide-react'
import { iconFor } from '../verticals/VerticalIcon.jsx'
import { typeIconName } from '../../lib/planBrief.js'

export * from '../../lib/planBrief.js'

const EXTRA_ICONS = { Camera, UserSquare }
export const typeIcon = (type) => {
  const name = typeIconName(type)
  return EXTRA_ICONS[name] || iconFor(name)
}
