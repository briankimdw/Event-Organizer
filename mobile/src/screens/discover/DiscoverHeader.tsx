// The Discover header row: the For you | Explore tabs on the left, actions on the right
// (the web's .home-header in Discover), and its round pill buttons.
import type { LucideIcon } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { Pressable, View } from 'react-native'

import { Text } from '@/components'
import { makeStyles, useTheme } from '@/theme'

export function DiscoverHeader({ tabs, right }: { tabs: ReactNode; right?: ReactNode }) {
  const s = useStyles()
  return (
    <View style={s.header}>
      {tabs}
      <View style={s.right}>{right}</View>
    </View>
  )
}

export function PillButton({ icon: Icon, label, text, onPress, filled }: { icon: LucideIcon; label: string; text?: string; onPress: () => void; filled?: boolean }) {
  const s = useStyles()
  const { c } = useTheme()
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.pill, !text && s.round, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}>
      <Icon size={text ? 14 : 16} color={c.ink} fill={filled ? c.ink : 'none'} />
      {text != null && <Text variant="small" weight="600">{text}</Text>}
    </Pressable>
  )
}

const useStyles = makeStyles((t) => ({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: t.space.lg, paddingTop: 4, paddingBottom: 2 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: t.c.line, backgroundColor: t.c.bg },
  round: { width: 40, paddingHorizontal: 0, justifyContent: 'center' },
}))
