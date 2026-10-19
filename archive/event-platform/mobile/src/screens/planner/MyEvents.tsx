// Saved plans (the web's components/planner/MyEvents.jsx). Tapping one restores its
// brief and re-runs the planner.
import type { listMyEvents } from '@shared/api/events.js'
import { ChevronRight } from 'lucide-react-native'
import { Pressable, View } from 'react-native'

import { ErrorState, Loading, Text } from '@/components'
import type { QueryState } from '@/hooks/useQuery'
import { makeStyles, useTheme } from '@/theme'
import { centsShort, datesLabel, typeIcon } from './brief'

export type SavedEvent = Awaited<ReturnType<typeof listMyEvents>>[number]

export default function MyEvents({ query, onOpen, activeId }: { query: QueryState<SavedEvent[]>; onOpen: (ev: SavedEvent) => void; activeId?: string | null }) {
  const s = useStyles()
  const { c } = useTheme()
  const { data, loading, error, reload } = query
  if (loading && !data) return <Loading inline label="Loading your events…" />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!data?.length) return <Text variant="small" muted style={s.empty}>Plans you save show up here.</Text>
  return (
    <View>
      {data.map((ev, i) => {
        const Icon = typeIcon(ev.type)
        const active = ev.id === activeId
        const bits = [datesLabel(ev.brief as any), ev.locationText?.split(',')[0], ev.budgetCents != null && centsShort(ev.budgetCents)].filter(Boolean)
        return (
          <Pressable
            key={ev.id}
            onPress={() => onOpen(ev)}
            style={({ pressed }) => [s.row, i < data.length - 1 && s.border, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={`Open ${ev.title}`}
          >
            <View style={[s.icon, active && { backgroundColor: c.accentSoft }]}>
              <Icon size={17} color={active ? c.accent : c.ink} />
            </View>
            <View style={s.grow}>
              <Text variant="small" weight="700" numberOfLines={1}>{ev.title}</Text>
              <Text variant="tiny" muted numberOfLines={1}>{bits.join(' · ') || 'No details yet'}</Text>
            </View>
            <ChevronRight size={16} color={c.muted} />
          </Pressable>
        )
      })}
    </View>
  )
}

const useStyles = makeStyles((t) => ({
  empty: { paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  border: { borderBottomWidth: 1, borderBottomColor: t.c.line },
  icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: t.c.soft, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1, minWidth: 0 },
}))
