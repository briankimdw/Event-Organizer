// Discover tab: native port of frontend/src/screens/Discover.jsx. Two modes, switched
// with big text tabs in the header (kept in the route params, like the web's ?mode=):
//   For you  - the swipe deck of photo & video work                     SwipeDeck.tsx
//              (photo cards where photographers posted, vendor cards where they haven't)
//   Explore  - a masonry grid of real work                               Explore.tsx
// ?s= (a service) is shared by both modes. (?v= / ?o= from old links are ignored.)
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Pressable, View } from 'react-native'

import { Text } from '@/components'
import { makeStyles } from '@/theme'
import { Explore } from './Explore'
import { SwipeDeck } from './SwipeDeck'

type Mode = 'foryou' | 'explore'
const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v)

export default function Discover() {
  const router = useRouter()
  const params = useLocalSearchParams<{ mode?: string; s?: string }>()
  const mode: Mode = one(params.mode) === 'explore' ? 'explore' : 'foryou'
  const setMode = (next: Mode) => {
    if (next === mode) return
    // Keep the service being browsed across the switch, like the web.
    router.setParams({ mode: next === 'explore' ? 'explore' : undefined } as any)
  }
  const tabs = <DiscoverTabs value={mode} onChange={setMode} />
  return mode === 'explore' ? (
    <Explore tabs={tabs} service={one(params.s) || null} />
  ) : (
    <SwipeDeck tabs={tabs} initialService={one(params.s)} />
  )
}

function DiscoverTabs({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }) {
  const s = useStyles()
  return (
    <View style={s.tabs} accessibilityRole="tablist" accessibilityLabel="Discover">
      {([
        { value: 'foryou', label: 'For you' },
        { value: 'explore', label: 'Explore' },
      ] as const).map((t) => {
        const on = t.value === value
        return (
          <Pressable key={t.value} onPress={() => onChange(t.value)} style={s.tab} accessibilityRole="tab" accessibilityState={{ selected: on }}>
            <Text style={[s.label, on ? s.on : s.off]}>{t.label}</Text>
            <View style={[s.bar, on && s.barOn]} />
          </Pressable>
        )
      })}
    </View>
  )
}

const useStyles = makeStyles((t) => ({
  tabs: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  tab: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 2 },
  label: { fontSize: 18, fontWeight: '600', letterSpacing: -0.2 },
  on: { color: t.c.ink },
  off: { color: t.c.faint },
  bar: { position: 'absolute', left: 2, right: 2, bottom: 5, height: 3, borderRadius: 999, backgroundColor: 'transparent' },
  barOn: { backgroundColor: t.c.ink },
}))
