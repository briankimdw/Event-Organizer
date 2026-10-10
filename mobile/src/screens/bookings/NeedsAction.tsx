// Home's "Needs your attention" / "Your bookings" tiles (the web Home.jsx section).
// Props-free: loads the signed-in client's bookings itself and renders nothing when
// signed out or when there is nothing to act on and nothing coming up.
//   import NeedsAction from '@/screens/bookings/NeedsAction'
//   <NeedsAction />
import { listMyBookings } from '@shared/api/bookings.js'
import { today } from '@shared/lib/dates.js'
import { deliversMedia } from '@shared/verticals/index.js'
import { useRouter } from 'expo-router'
import { Pressable, ScrollView, View } from 'react-native'

import { Avatar, ErrorState, SectionHeader, Text } from '@/components'
import useQuery from '@/hooks/useQuery'
import { useAuth } from '@/state/auth'
import { makeStyles } from '@/theme'
import { StatusPill, useRefocus } from './parts'

export type Booking = Awaited<ReturnType<typeof listMyBookings>>[number]

// Booking states where the client has something to do (web Home NEEDS_ACTION;
// "delivered" is worded per vertical like the web Bookings screen).
export function needsActionText(b: Booking): string | null {
  if (b.status === 'accepted') return 'Pay the deposit to lock in your date'
  if (b.status === 'countered') return 'Review the counter offer'
  if (b.status === 'delivered') {
    if (!deliversMedia(b.vertical)) return 'Confirm it’s done'
    return b.vertical === 'videography' ? 'Your video is ready' : 'Your photos are ready'
  }
  return null
}

export default function NeedsAction() {
  const { user } = useAuth()
  const uid = user?.id ?? null
  const q = useQuery<Booking[]>(uid ? () => listMyBookings() : null, [uid])
  useRefocus(q.reload)
  const s = useStyles()
  const router = useRouter()

  if (!uid) return null
  if (q.error) {
    return (
      <View>
        <SectionHeader title="Your bookings" onSeeAll={() => router.push('/bookings')} />
        <ErrorState error={q.error} onRetry={q.reload} />
      </View>
    )
  }

  const mine = q.data || []
  const actionItems = mine.filter((b) => b.role === 'client' && needsActionText(b))
  const upcoming = mine
    .filter((b) => ['requested', 'confirmed'].includes(b.status) && b.day >= today())
    .sort((a, b) => +a.start - +b.start)
  const tiles = [...actionItems, ...upcoming]
  if (!tiles.length) return null

  return (
    <View>
      <SectionHeader title={actionItems.length ? 'Needs your attention' : 'Your bookings'} onSeeAll={() => router.push('/bookings')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
        {tiles.map((b) => {
          const action = needsActionText(b)
          return (
            <Pressable
              key={b.id}
              onPress={() => router.push({ pathname: '/bookings/[id]', params: { id: b.id } })}
              style={({ pressed }) => [s.tile, !!action && s.action, pressed && s.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`${b.packageName} with ${b.provider.name}${action ? `: ${action}` : ''}`}
            >
              <View style={s.who}>
                <Avatar uri={b.provider.avatar} name={b.provider.name} size="sm" />
                <Text variant="small" weight="700" numberOfLines={1} style={s.grow}>{b.provider.name}</Text>
              </View>
              <Text variant="small" numberOfLines={1} style={s.mtXs}>{b.packageName}</Text>
              <Text variant="tiny" muted>{b.date}</Text>
              <View style={s.mtSm}>
                {action ? <Text style={s.actionText} numberOfLines={2}>{action} →</Text> : <StatusPill status={b.status} />}
              </View>
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}

const useStyles = makeStyles((t) => ({
  row: { paddingHorizontal: t.space.lg, gap: 10 },
  tile: { width: 200, borderWidth: 1, borderColor: t.c.line, borderRadius: t.radius.lg, padding: 12, backgroundColor: t.c.card },
  action: { backgroundColor: t.c.accentSoft, borderColor: t.scheme === 'dark' ? '#5a2a1c' : '#ffd2c4' },
  pressed: { opacity: 0.8 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grow: { flex: 1 },
  mtXs: { marginTop: 4 },
  mtSm: { marginTop: 8 },
  actionText: { color: t.c.accent, fontWeight: '700', fontSize: 12 },
}))
