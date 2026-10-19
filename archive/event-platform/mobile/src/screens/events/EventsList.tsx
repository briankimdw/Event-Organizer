// /events: native port of frontend/src/screens/Events.jsx. My events (upcoming first,
// then past), plus anything friends invited me to.
import { useRouter } from 'expo-router'
import { CalendarHeart, Plus, Sparkles } from 'lucide-react-native'
import { View } from 'react-native'

import { countdownLabel, listEvents } from '@shared/api/events.js'
import { Button, EmptyState, ErrorState, IconButton, Loading, Screen, SignInPrompt, Text } from '@/components'
import useQuery from '@/hooks/useQuery'
import { useAuth } from '@/state/auth'
import { makeStyles } from '@/theme'
import type { EventItem } from './AddToEvent'
import { EventRow } from './parts'

export default function EventsList() {
  const s = useStyles()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const events = useQuery<EventItem[]>(user ? () => listEvents() : null, [user?.id])
  const newBtn = user ? <IconButton icon={Plus} label="New event" onPress={() => router.push('/events/new')} /> : null

  if (authLoading) return <Screen title="Events" back><Loading /></Screen>
  if (!user) return <Screen title="Events" back><SignInPrompt title="Plan events with friends" text="Make an event, invite friends, and pick vendors together in one group chat." /></Screen>

  const list = events.data || []
  const isPast = (e: EventItem) => /ago|Yesterday/.test(countdownLabel(e.endDate || e.startDate) || '') || e.status === 'cancelled'
  const upcoming = list.filter((e) => !isPast(e))
  const past = list.filter(isPast)

  return (
    <Screen title="Events" back right={newBtn} refreshing={events.loading && !!events.data} onRefresh={events.reload}>
      <View style={s.pad}>
        {events.loading && !events.data ? (
          <Loading />
        ) : events.error ? (
          <ErrorState error={events.error} onRetry={events.reload} />
        ) : !list.length ? (
          <EmptyState
            icon={CalendarHeart}
            title="Plan something together"
            text="Make an event, invite friends, and pick the venue, food and music together, with a group chat for it."
            action={
              <View style={s.actions}>
                <Button title="New event" icon={Plus} size="sm" onPress={() => router.push('/events/new')} />
                <Button title="Plan with AI" icon={Sparkles} size="sm" variant="ghost" onPress={() => router.push('/plan')} />
              </View>
            }
          />
        ) : (
          <>
            <Button title="New event" icon={Plus} block onPress={() => router.push('/events/new')} />
            {upcoming.length > 0 && <Text variant="label" style={s.label}>Coming up</Text>}
            <View style={s.list}>{upcoming.map((ev) => <EventRow key={ev.id} ev={ev} />)}</View>
            {past.length > 0 && <Text variant="label" style={s.label}>Past</Text>}
            <View style={s.list}>{past.map((ev) => <EventRow key={ev.id} ev={ev} />)}</View>
          </>
        )}
      </View>
    </Screen>
  )
}

const useStyles = makeStyles((t) => ({
  pad: { padding: t.space.lg, paddingBottom: t.space.xxl },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  label: { marginTop: 18, marginBottom: 8 },
  list: { gap: 10 },
}))
