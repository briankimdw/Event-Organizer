// /events/new?type=wedding&title=...&date=YYYY-MM-DD&add=<providerId>
// Native port of the web's NewEvent (frontend/src/screens/Events.jsx): occasion, name,
// date, place, guests, budget, and friends to plan with (they join the event's chat).
import { useLocalSearchParams, useRouter } from 'expo-router'
import { CalendarHeart, UserPlus, X } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'

import { getProvider } from '@shared/api/catalog.js'
import { EVENT_KINDS, addCandidate, createEventFromForm, eventError, eventTypeName } from '@shared/api/events.js'
import { fromKey, isPast } from '@shared/lib/dates.js'
import { getOccasion } from '@shared/verticals/catalog.js'
import { Button, Chip, DatePicker, Loading, Screen, Sheet, SignInPrompt, Text, TextField } from '@/components'
import useQuery from '@/hooks/useQuery'
import PeoplePicker, { type Person } from '@/screens/inbox/PeoplePicker'
import { useAuth } from '@/state/auth'
import { useStore } from '@/state/store'
import { makeStyles, useTheme } from '@/theme'
import type { Provider } from '@/types'

type Params = { type?: string; title?: string; date?: string; add?: string }

export default function NewEvent() {
  const { user, loading } = useAuth()
  if (loading) return <Screen title="New event" back><Loading /></Screen>
  if (!user) return <Screen title="New event" back><SignInPrompt title="Sign in to make an event" text="Events are shared with the friends you invite." /></Screen>
  return <EventForm />
}

function EventForm() {
  const s = useStyles()
  const { c } = useTheme()
  const router = useRouter()
  const { toast } = useStore()
  const params = useLocalSearchParams<Params>()
  const addId = params.add || null
  const adding = useQuery<Provider | null>(addId ? () => getProvider(addId) as Promise<Provider | null> : null, [addId])
  const [type, setType] = useState<string | null>(getOccasion(params.type || '') ? String(params.type) : null)
  const [title, setTitle] = useState(params.title || '')
  const [date, setDate] = useState<string | null>(params.date || null)
  const [place, setPlace] = useState('')
  const [guests, setGuests] = useState('')
  const [budget, setBudget] = useState('')
  const [friends, setFriends] = useState<Person[]>([])
  const [picking, setPicking] = useState(false)
  const [calendar, setCalendar] = useState(false)
  const [busy, setBusy] = useState(false)

  const placeholder = type ? `${eventTypeName(type)}${place ? ` in ${place.split(',')[0]}` : ''}` : 'Sam’s 30th, Our wedding…'
  const submit = async () => {
    if (busy) return
    setBusy(true)
    try {
      const res: any = await createEventFromForm({
        title: title.trim() || (type ? placeholder : ''),
        type: type || 'event',
        date,
        locationText: place,
        guestCount: guests ? Number(guests) : null,
        budget: budget ? Number(budget) : null,
        inviteIds: friends.map((f) => f.profileId),
      } as any)
      if (addId && res.setup) await addCandidate(res.id, addId, { vertical: adding.data?.vertical } as any).catch((e: unknown) => console.warn(e))
      toast(friends.length && res.setup ? `Event created. ${friends.length === 1 ? friends[0].name.split(' ')[0] : `${friends.length} friends`} can plan with you.` : 'Event created')
      router.replace({ pathname: '/events/[id]', params: { id: res.id } })
    } catch (e) {
      console.warn(e)
      toast(eventError(e))
      setBusy(false)
    }
  }

  return (
    <Screen title="New event" back contentStyle={s.form}>
          {!!adding.data && (
            <View style={s.note}>
              <CalendarHeart size={15} color={c.muted} />
              <Text variant="small" style={s.grow}>{adding.data.name} will be added to this event’s board.</Text>
            </View>
          )}
          <Text variant="small" muted>What’s the occasion?</Text>
          <View style={s.kinds}>
            {EVENT_KINDS.map(([slug, name]) => (
              <Chip key={slug} label={name} toggle on={type === slug} onPress={() => setType(type === slug ? null : slug)} />
            ))}
          </View>
          <TextField label="Name" value={title} onChangeText={setTitle} placeholder={placeholder} maxLength={120} />
          <View>
            <Text variant="small" muted style={{ marginBottom: 4 }}>Date</Text>
            <Chip
              label={date ? fromKey(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Pick a date'}
              toggle
              on={!!date}
              onPress={() => setCalendar(true)}
            />
          </View>
          <View style={s.two}>
            <View style={s.grow}><TextField label="Guests" value={guests} onChangeText={setGuests} keyboardType="number-pad" placeholder="40" /></View>
            <View style={s.grow}><TextField label="Budget ($)" value={budget} onChangeText={setBudget} keyboardType="decimal-pad" placeholder="5000" /></View>
          </View>
          <TextField label="Where" value={place} onChangeText={setPlace} placeholder="City or venue" maxLength={200} />

          <Text variant="small" muted>Plan it with</Text>
          <View style={s.kinds}>
            {friends.map((f) => (
              <Chip key={f.profileId} label={f.name.split(' ')[0]} iconRight={X} onPress={() => setFriends(friends.filter((x) => x.profileId !== f.profileId))} />
            ))}
            <Chip label={friends.length ? 'Add more' : 'Invite friends'} icon={UserPlus} toggle onPress={() => setPicking(true)} />
          </View>
          <Text variant="tiny" muted>They’ll join the event’s group chat and can add vendors and vote.</Text>
          <Button title={busy ? 'Creating…' : 'Create event'} variant="accent" block loading={busy} onPress={submit} style={{ marginTop: 8 }} />

      <Sheet open={picking} onClose={() => setPicking(false)} title="Invite friends">
        <PeoplePicker selected={friends} onChange={setFriends} />
        <Button title={`Done${friends.length ? ` (${friends.length})` : ''}`} block onPress={() => setPicking(false)} style={{ marginTop: 8 }} />
      </Sheet>
      <Sheet open={calendar} onClose={() => setCalendar(false)} title="When is it?">
        <DatePicker
          selected={date ? [date] : []}
          onToggle={(key: string) => {
            setDate(key === date ? null : key)
            setCalendar(false)
          }}
          isDisabled={(d: Date) => isPast(d)}
        />
      </Sheet>
    </Screen>
  )
}

const useStyles = makeStyles((t) => ({
  form: { padding: t.space.lg, gap: 12, paddingBottom: t.space.xxl },
  note: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: t.radius.md, backgroundColor: t.c.soft, alignItems: 'center' },
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  two: { flexDirection: 'row', gap: 10 },
  grow: { flex: 1, minWidth: 0 },
}))
