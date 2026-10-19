// Shared pieces of the events screens (the web's components/events/*): member avatars,
// an event row, the invite sheet and the "Your events" shelf for Home / Me.
import { useRouter } from 'expo-router'
import { CalendarHeart, ChevronRight } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, View } from 'react-native'

import { countdownLabel, eventError, inviteToEvent, listUpcomingEvents } from '@shared/api/events.js'
import { Avatar, Button, SectionHeader, Sheet, Text } from '@/components'
import useQuery from '@/hooks/useQuery'
import PeoplePicker, { type Person } from '@/screens/inbox/PeoplePicker'
import { useAuth } from '@/state/auth'
import { useStore } from '@/state/store'
import { makeStyles, useTheme } from '@/theme'
import { EventDate, type EventItem } from './AddToEvent'

type Member = EventItem['members'][number]

export function MemberStack({ members, max = 4, size = 28 }: { members: Member[]; max?: number; size?: number }) {
  const s = useStyles()
  const shown = members.slice(0, max)
  const more = members.length - shown.length
  return (
    <View style={s.stack} accessibilityLabel={`${members.length} planning`}>
      {shown.map((m, i) => (
        <View key={m.profileId} style={[s.stackItem, { marginLeft: i ? -9 : 0, borderRadius: size }]}>
          <Avatar uri={m.avatar} name={m.name} size={size} />
        </View>
      ))}
      {more > 0 && (
        <View style={[s.stackItem, s.more, { width: size + 4, height: size + 4, borderRadius: size }]}>
          <Text variant="caption" muted>+{more}</Text>
        </View>
      )}
    </View>
  )
}

export function EventRow({ ev }: { ev: EventItem }) {
  const s = useStyles()
  const { c } = useTheme()
  const router = useRouter()
  const countdown = countdownLabel(ev.startDate)
  const past = !!countdown && /ago|Yesterday/.test(countdown)
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/events/[id]', params: { id: ev.id } })}
      style={({ pressed }) => [s.row, pressed && { backgroundColor: c.soft }]}
      accessibilityRole="button"
      accessibilityLabel={ev.title}
    >
      <EventDate ev={ev} />
      <View style={s.grow}>
        <Text variant="body" weight="700" numberOfLines={1}>{ev.title}</Text>
        <Text variant="tiny" muted numberOfLines={1}>{[ev.typeName, ev.locationText?.split(',')[0]].filter(Boolean).join(' · ')}</Text>
        <View style={s.meta}>
          {ev.members.length > 1 && <MemberStack members={ev.members} max={3} size={22} />}
          <View style={[s.pill, !past && countdown ? { backgroundColor: c.accentSoft } : null]}>
            <Text variant="caption" style={{ color: !past && countdown ? c.accent : c.muted }}>{countdown || 'No date yet'}</Text>
          </View>
        </View>
      </View>
      <ChevronRight size={16} color={c.muted} />
    </Pressable>
  )
}

export function InviteSheet({ open, onClose, event, onInvited }: { open: boolean; onClose: () => void; event: { id: string; title: string; members: Member[] } | null; onInvited?: () => void }) {
  const { toast } = useStore()
  const [picked, setPicked] = useState<Person[]>([])
  const [busy, setBusy] = useState(false)
  const close = () => {
    setPicked([])
    onClose()
  }
  const invite = async () => {
    if (!event) return
    setBusy(true)
    try {
      const n = await inviteToEvent(event.id, picked.map((p) => p.profileId))
      toast(n ? `Invited ${picked.length === 1 ? picked[0].name.split(' ')[0] : `${n} people`} to plan` : 'They’re already planning with you')
      onInvited?.()
      close()
    } catch (e) {
      console.warn(e)
      toast(eventError(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet open={open} onClose={close} title="Invite friends to plan">
      <Text variant="small" muted style={{ marginBottom: 10 }}>They can add vendors, vote and chat with everyone planning “{event?.title}”.</Text>
      <PeoplePicker selected={picked} onChange={setPicked} exclude={(event?.members || []).map((m) => m.profileId)} />
      <Button title={busy ? 'Inviting…' : `Invite${picked.length ? ` ${picked.length}` : ''}`} block disabled={!picked.length || busy} onPress={invite} style={{ marginTop: 8 }} />
    </Sheet>
  )
}

// "Your events" on Home (hidden until you have one) and Me (with a "plan one" card).
export function EventsShelf({ showEmpty = false, title = 'Your events' }: { showEmpty?: boolean; title?: string }) {
  const s = useStyles()
  const { c } = useTheme()
  const router = useRouter()
  const { user } = useAuth()
  const events = useQuery<EventItem[]>(user ? () => listUpcomingEvents(3) : null, [user?.id])
  if (!user) return null
  const list = events.data || []
  if (!list.length && (!showEmpty || events.loading || events.error)) return null
  return (
    <View>
      <SectionHeader title={title} sub={list.length ? 'Planning with friends' : undefined} onSeeAll={() => router.push('/events')} seeAllLabel={list.length ? 'See all' : 'Open'} />
      <View style={s.padX}>
        {list.length ? (
          <View style={s.list}>{list.map((ev) => <EventRow key={ev.id} ev={ev} />)}</View>
        ) : (
          <Pressable onPress={() => router.push('/events/new')} style={s.empty} accessibilityRole="button">
            <CalendarHeart size={20} color={c.muted} />
            <View style={s.grow}>
              <Text variant="small" weight="700">Plan an event with friends</Text>
              <Text variant="tiny" muted>Invite people, pick vendors together, one group chat.</Text>
            </View>
            <ChevronRight size={16} color={c.muted} />
          </Pressable>
        )}
      </View>
    </View>
  )
}

const useStyles = makeStyles((t) => ({
  stack: { flexDirection: 'row', alignItems: 'center' },
  stackItem: { borderWidth: 2, borderColor: t.c.bg, overflow: 'hidden' },
  more: { backgroundColor: t.c.soft, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1, borderColor: t.c.line, borderRadius: 16, backgroundColor: t.c.card },
  grow: { flex: 1, minWidth: 0 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: t.c.soft },
  padX: { paddingHorizontal: t.space.lg },
  list: { gap: 10 },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.c.line, borderRadius: 14 },
}))
