import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CalendarHeart, Plus, Sparkles, UserPlus, X } from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import Sheet from '../components/Sheet.jsx'
import PeoplePicker from '../components/PeoplePicker.jsx'
import { EmptyState, ErrorState, Loading, SignInPrompt } from '../components/States.jsx'
import { EventRow } from '../components/events/EventParts.jsx'
import '../components/events/events.css'
import { useAuth } from '../auth.jsx'
import { useStore } from '../store.jsx'
import useQuery from '../lib/useQuery.js'
import { toKey, today } from '../lib/dates.js'
import { getProvider } from '../api/catalog.js'
import { EVENT_KINDS, addCandidate, countdownLabel, createEventFromForm, eventError, eventTypeName, listEvents } from '../api/events.js'
import { getOccasion } from '../verticals/catalog.js'

// /events: my events (upcoming first), plus anything friends invited me to.
export default function Events() {
  const { user, loading: authLoading } = useAuth()
  const events = useQuery(user ? () => listEvents() : null, [user?.id])
  const newBtn = user && (
    <Link to="/events/new" className="icon-btn" aria-label="New event">
      <Plus size={22} />
    </Link>
  )
  if (authLoading) return <><TopBar title="Events" /><Loading /></>
  if (!user) {
    return (
      <>
        <TopBar title="Events" />
        <SignInPrompt title="Plan events with friends" text="Make an event, invite friends, and pick vendors together in one group chat." />
      </>
    )
  }
  const list = events.data || []
  const isPast = (e) => /ago|Yesterday/.test(countdownLabel(e.endDate || e.startDate) || '') || e.status === 'cancelled'
  const upcoming = list.filter((e) => !isPast(e))
  const past = list.filter(isPast)

  return (
    <div>
      <TopBar title="Events" right={newBtn} />
      <div className="pad-x">
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
              <div className="row gap-xs wrap" style={{ justifyContent: 'center' }}>
                <Link to="/events/new" className="btn sm"><Plus size={15} /> New event</Link>
                <Link to="/plan" className="btn sm ghost"><Sparkles size={15} /> Plan with AI</Link>
              </div>
            }
          />
        ) : (
          <>
            <Link to="/events/new" className="btn block mt-sm"><Plus size={16} /> New event</Link>
            {upcoming.length > 0 && <div className="ev-section-label">Coming up</div>}
            <div className="ev-list">{upcoming.map((ev) => <EventRow key={ev.id} ev={ev} />)}</div>
            {past.length > 0 && <div className="ev-section-label">Past</div>}
            <div className="ev-list">{past.map((ev) => <EventRow key={ev.id} ev={ev} />)}</div>
            <div className="mt-lg" />
          </>
        )}
      </div>
    </div>
  )
}

// /events/new?type=wedding&title=...&date=YYYY-MM-DD&add=<providerId>
// Name, occasion, date, place, guests, budget, and friends to plan with.
export function NewEvent() {
  const { user, loading: authLoading } = useAuth()
  if (authLoading) return <><TopBar title="New event" /><Loading /></>
  if (!user) return <><TopBar title="New event" /><SignInPrompt title="Sign in to make an event" text="Events are shared with the friends you invite." /></>
  return <EventForm />
}

function EventForm() {
  const navigate = useNavigate()
  const { toast } = useStore()
  const [params] = useSearchParams()
  const addId = params.get('add')
  const adding = useQuery(addId ? () => getProvider(addId) : null, [addId])
  const initialType = getOccasion(params.get('type')) ? params.get('type') : null
  const [type, setType] = useState(initialType)
  const [title, setTitle] = useState(params.get('title') || '')
  const [date, setDate] = useState(params.get('date') || '')
  const [place, setPlace] = useState('')
  const [guests, setGuests] = useState('')
  const [budget, setBudget] = useState('')
  const [friends, setFriends] = useState([])
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)

  const placeholder = type ? `${eventTypeName(type)}${place ? ` in ${place.split(',')[0]}` : ''}` : 'Sam’s 30th, Our wedding…'
  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const res = await createEventFromForm({
        title: title.trim() || (type ? placeholder : ''),
        type: type || 'event',
        date: date || null,
        locationText: place,
        guestCount: guests ? Number(guests) : null,
        budget: budget ? Number(budget) : null,
        inviteIds: friends.map((f) => f.profileId),
      })
      if (addId && res.setup) await addCandidate(res.id, addId, { vertical: adding.data?.vertical }).catch((err) => console.warn(err))
      toast(friends.length && res.setup ? `Event created. ${friends.length === 1 ? friends[0].name.split(' ')[0] : `${friends.length} friends`} can plan with you.` : 'Event created')
      navigate(`/events/${res.id}`, { replace: true })
    } catch (err) {
      console.warn(err)
      toast(eventError(err))
      setBusy(false)
    }
  }

  return (
    <div>
      <TopBar title="New event" />
      <form className="ev-form" onSubmit={submit}>
        {adding.data && (
          <div className="note">
            <CalendarHeart size={15} />
            <span>{adding.data.name} will be added to this event’s board.</span>
          </div>
        )}
        <label className="field">
          What’s the occasion?
          <div className="ev-kinds mt-xs">
            {EVENT_KINDS.map(([slug, name]) => (
              <button key={slug} type="button" className={`chip toggle ${type === slug ? 'on' : ''}`} onClick={() => setType(type === slug ? null : slug)}>
                {name}
              </button>
            ))}
          </div>
        </label>
        <label className="field">
          Name
          <input className="input" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={placeholder} />
        </label>
        <div className="row two">
          <label className="field">
            Date
            <input className="input" type="date" min={toKey(today())} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            Guests
            <input className="input" type="number" inputMode="numeric" min={0} max={100000} value={guests} onChange={(e) => setGuests(e.target.value)} placeholder="40" />
          </label>
        </div>
        <label className="field">
          Where
          <input className="input" maxLength={200} value={place} onChange={(e) => setPlace(e.target.value)} placeholder="City or venue" />
        </label>
        <label className="field">
          Total budget (optional)
          <input className="input" type="number" inputMode="decimal" min={0} value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="$5,000" />
        </label>

        <div className="field">
          Plan it with
          <div className="ev-invitees mt-xs">
            {friends.map((f) => (
              <button key={f.profileId} type="button" className="chip" onClick={() => setFriends(friends.filter((x) => x.profileId !== f.profileId))} aria-label={`Remove ${f.name}`}>
                <img className="avatar" src={f.avatar} alt="" style={{ width: 18, height: 18 }} /> {f.name.split(' ')[0]} <X size={12} />
              </button>
            ))}
            <button type="button" className="chip toggle" onClick={() => setPicking(true)}>
              <UserPlus size={14} /> {friends.length ? 'Add more' : 'Invite friends'}
            </button>
          </div>
          <span className="tiny">They’ll join the event’s group chat and can add vendors and vote.</span>
        </div>

        <button className="btn accent block mt-sm" disabled={busy}>{busy ? 'Creating…' : 'Create event'}</button>
      </form>

      <Sheet open={picking} onClose={() => setPicking(false)} title="Invite friends">
        <PeoplePicker selected={friends} onChange={setFriends} />
        <button className="btn block mt-sm" onClick={() => setPicking(false)}>Done{friends.length ? ` (${friends.length})` : ''}</button>
      </Sheet>
    </div>
  )
}
