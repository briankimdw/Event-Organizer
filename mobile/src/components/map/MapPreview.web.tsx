// Web-target fallback for MapPreview (react-native-maps has no web support):
// a soft card with the service area as text and an "Open map" link.
import { MapPin } from 'lucide-react-native'
import { Pressable, View } from 'react-native'

import { makeStyles, useTheme } from '@/theme'
import { Avatar } from '../Avatar'
import { Text } from '../Text'
import type { MapPreviewProps } from './MapPreview'

export default function MapPreview({ radiusKm, avatar, name, tint, onPress }: MapPreviewProps) {
  const s = useStyles()
  const { c } = useTheme()
  const color = tint || c.accent
  return (
    <Pressable onPress={onPress} style={s.wrap} accessibilityRole="button" accessibilityLabel="Open the map">
      <View style={[s.ring, { borderColor: color, backgroundColor: `${color}14` }]}>
        <View style={[s.pin, { borderColor: color }]}><Avatar uri={avatar} name={name} size={30} /></View>
      </View>
      <Text variant="small" muted>Travels up to {radiusKm ?? 0} km</Text>
      <View style={s.open}>
        <MapPin size={13} color={c.ink} />
        <Text variant="tiny" weight="700">Open map</Text>
      </View>
    </Pressable>
  )
}

const useStyles = makeStyles((t) => ({
  wrap: { height: 150, borderRadius: t.radius.lg, backgroundColor: t.c.soft, marginTop: 10, alignItems: 'center', justifyContent: 'center', gap: 8 },
  ring: { width: 86, height: 86, borderRadius: 43, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  pin: { borderWidth: 3, borderRadius: 999, backgroundColor: '#fff' },
  open: {
    position: 'absolute', right: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: t.c.bg, paddingVertical: 5, paddingHorizontal: 9, borderRadius: 999,
  },
}))
