// Trust badges and stars (the web's components/Badges.jsx and Stars.jsx).
import { BadgeCheck, ShieldCheck, Star } from 'lucide-react-native'
import { View } from 'react-native'

import { useTheme } from '@/theme'
import { Text } from './Text'

export function IdVerified({ label = false }: { label?: boolean }) {
  const { c } = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }} accessibilityLabel="Identity verified">
      <ShieldCheck size={13} color={c.id} />
      {label && <Text variant="caption" style={{ color: c.id, fontSize: 11, fontWeight: '700' }}>ID verified</Text>}
    </View>
  )
}

export function ProBadge() {
  const { c } = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: c.pro, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }} accessibilityLabel="Verified Pro">
      <BadgeCheck size={11} color="#fff" />
      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.3 }}>PRO</Text>
    </View>
  )
}

export function NewTag() {
  const { c } = useTheme()
  return (
    <View style={{ backgroundColor: c.soft, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 }}>
      <Text style={{ fontSize: 10.5, fontWeight: '700' }}>New</Text>
    </View>
  )
}

export function Stars({ value, size = 14, onChange }: { value: number; size?: number; onChange?: (n: number) => void }) {
  const { c } = useTheme()
  return (
    <View style={{ flexDirection: 'row', gap: 1 }} accessibilityLabel={`${value.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= Math.round(value)
        return (
          <Star
            key={n}
            size={size}
            color={on ? c.star : c.line}
            fill={on ? c.star : 'none'}
            onPress={onChange ? () => onChange(n) : undefined}
          />
        )
      })}
    </View>
  )
}

// "★ 4.9 (12)" or a New tag before the first review.
export function RatingInline({ rating, count, size = 12 }: { rating: number | null; count?: number; size?: number }) {
  const { c } = useTheme()
  if (rating == null) return <NewTag />
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <Star size={size} color={c.star} fill={c.star} />
      <Text variant="tiny" weight="600">{rating.toFixed(1)}</Text>
      {count != null && <Text variant="tiny" muted>({count})</Text>}
    </View>
  )
}
