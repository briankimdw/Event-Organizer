// Icons named by string in the shared catalog (verticals/catalog.js uses lucide
// icon names like 'Camera', 'UtensilsCrossed') -> lucide-react-native components.
//   <VerticalIcon name={vertical.icon} size={22} />
//   <VerticalIcon name={vertical.icon} tint={vertical.tint} bubble />   tinted circle
// Unknown names fall back to a circle (and warn in dev), so a new catalog icon never crashes.
import * as Lucide from 'lucide-react-native'
import { View } from 'react-native'

import { useTheme } from '@/theme'

type IconComponent = Lucide.LucideIcon
const registry = Lucide as unknown as Record<string, IconComponent | undefined>
const warned = new Set<string>()

export function iconByName(name?: string | null): IconComponent {
  const Icon = name ? registry[name] : undefined
  if (!Icon && name && __DEV__ && !warned.has(name)) {
    warned.add(name)
    console.warn(`VerticalIcon: no lucide icon named "${name}"`)
  }
  return Icon ?? Lucide.Circle
}

type Props = { name?: string | null; size?: number; color?: string; tint?: string; bubble?: boolean; bubbleSize?: number }

export function VerticalIcon({ name, size = 22, color, tint, bubble, bubbleSize }: Props) {
  const { c } = useTheme()
  const Icon = iconByName(name)
  if (!bubble) return <Icon size={size} color={color ?? tint ?? c.ink} />
  const box = bubbleSize ?? size * 2.2
  return (
    <View style={{ width: box, height: box, borderRadius: box / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: `${tint ?? c.ink}1f` }}>
      <Icon size={size} color={color ?? tint ?? c.ink} />
    </View>
  )
}
