// Pills, mirroring the web's .chip / .chip.toggle / .chip.solid.
//   <Chip label="Wedding" />                         static
//   <Chip label="All" toggle on={!cat} onPress={...} /> filter toggle
//   <ChipRow scroll>{...}</ChipRow>                  a horizontal row of chips
import type { LucideIcon } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { Pressable, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native'

import { makeStyles, useTheme } from '@/theme'
import { Text } from './Text'

type ChipProps = {
  label: string
  onPress?: () => void
  toggle?: boolean
  on?: boolean
  solid?: boolean
  icon?: LucideIcon
  iconRight?: LucideIcon
  tint?: string
  iconTint?: string // color for the leading icon only (when not filled)
  style?: StyleProp<ViewStyle>
}

export function Chip({ label, onPress, toggle, on, solid, icon: Icon, iconRight: IconRight, tint, iconTint, style }: ChipProps) {
  const s = useStyles()
  const { c } = useTheme()
  const filled = solid || (toggle && on)
  const fg = filled ? c.onInk : tint ?? c.ink
  const content = (
    <>
      {Icon && <Icon size={13} color={filled ? fg : iconTint ?? fg} />}
      <Text variant="small" style={{ color: fg, fontSize: 12.5 }} weight={filled ? '600' : '500'} numberOfLines={1}>
        {label}
      </Text>
      {IconRight && <IconRight size={12} color={fg} />}
    </>
  )
  const boxStyle = [s.chip, toggle && s.toggle, filled && s.filled, style]
  if (!onPress) return <View style={boxStyle}>{content}</View>
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={toggle ? 'togglebutton' : 'button'}
      accessibilityState={toggle ? { checked: !!on } : undefined}
      style={({ pressed }) => [...boxStyle, pressed && { opacity: 0.7 }]}
    >
      {content}
    </Pressable>
  )
}

export function ChipRow({ children, scroll, style }: { children: ReactNode; scroll?: boolean; style?: StyleProp<ViewStyle> }) {
  const s = useStyles()
  if (scroll) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[s.row, s.scrollRow, style]}>
        {children}
      </ScrollView>
    )
  }
  return <View style={[s.row, s.wrap, style]}>{children}</View>
}

const useStyles = makeStyles((t) => ({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 11,
    borderRadius: t.radius.pill, backgroundColor: t.c.soft, alignSelf: 'flex-start',
  },
  toggle: { backgroundColor: t.c.bg, borderWidth: 1, borderColor: t.c.line },
  filled: { backgroundColor: t.c.ink, borderColor: t.c.ink },
  row: { flexDirection: 'row', gap: 6 },
  wrap: { flexWrap: 'wrap' },
  scrollRow: { paddingHorizontal: t.space.lg },
}))
