// A small, non-interactive map of where a provider is based and how far they travel
// (the web's components/map/MapPreview.jsx). Tap it to open the full map.
// Web target: MapPreview.web.tsx (react-native-maps has no web support).
import { MapPin } from 'lucide-react-native'
import { Pressable, StyleSheet, View } from 'react-native'
import MapView, { Circle, Marker } from 'react-native-maps'

import { makeStyles, useTheme } from '@/theme'
import { Avatar } from '../Avatar'
import { Text } from '../Text'
import { circleRegion, type LatLng } from './geo'

export type MapPreviewProps = { location: LatLng; radiusKm?: number | null; avatar?: string | null; name?: string; tint?: string; onPress?: () => void }

export default function MapPreview({ location, radiusKm, avatar, name, tint, onPress }: MapPreviewProps) {
  const s = useStyles()
  const { c, scheme } = useTheme()
  const color = tint || c.accent
  return (
    <Pressable onPress={onPress} style={s.wrap} accessibilityRole="button" accessibilityLabel="Open the map">
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <MapView
          style={StyleSheet.absoluteFill}
          userInterfaceStyle={scheme}
          initialRegion={circleRegion(location, radiusKm ?? 0, 1.2)}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          toolbarEnabled={false}
          liteMode
        >
          <Circle center={{ latitude: location.lat, longitude: location.lng }} radius={Math.max(radiusKm ?? 0, 0.5) * 1000} strokeColor={color} fillColor={`${color}1f`} strokeWidth={1.5} />
          <Marker coordinate={{ latitude: location.lat, longitude: location.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View style={[s.pin, { borderColor: color }]}><Avatar uri={avatar} name={name} size={30} /></View>
          </Marker>
        </MapView>
      </View>
      <View style={s.open}>
        <MapPin size={13} color={c.ink} />
        <Text variant="tiny" weight="700">Open map</Text>
      </View>
    </Pressable>
  )
}

const useStyles = makeStyles((t) => ({
  wrap: { height: 150, borderRadius: t.radius.lg, overflow: 'hidden', backgroundColor: t.c.soft, marginTop: 10 },
  pin: { borderWidth: 3, borderRadius: 999, backgroundColor: '#fff' },
  open: {
    position: 'absolute', right: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: t.c.bg, paddingVertical: 5, paddingHorizontal: 9, borderRadius: 999,
  },
}))
