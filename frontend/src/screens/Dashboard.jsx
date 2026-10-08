import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock, Copy, Images, Plus, Star } from 'lucide-react'
import Segmented from '../components/Segmented.jsx'
import Sheet from '../components/Sheet.jsx'
import { VerifiedClient } from '../components/Badges.jsx'
import { money, priceLabel } from '../components/Booking.jsx'
import { useStore } from '../store.jsx'
import { useAuth } from '../auth.jsx'
import { getMyProvider, listMyAlbums, publicUrl } from '../api/portfolio.js'
import { myCalendar, myPackages } from '../data/mock.js'

// Provider work tabs, shown inside the profile page in Photographer mode.
export default function Dashboard({ tab, onTabChange }) {
  const { requests } = useStore()
  const pending = requests.filter((r) => r.status === 'requested').length

  return (
    <div className="pad-x">
      <Segmented
        options={[
          { value: 'requests', label: pending ? `Requests · ${pending}` : 'Requests' },
          { value: 'calendar', label: 'Calendar' },
          { value: 'packages', label: 'Packages' },
          { value: 'portfolio', label: 'Portfolio' },
        ]}
        value={tab}
        onChange={onTabChange}
      />
      {tab === 'requests' && <Requests />}
      {tab === 'calendar' && <ProviderCalendar />}
      {tab === 'packages' && <Packages />}
      {tab === 'portfolio' && <Portfolio />}
    </div>
  )
}

function Requests() {
  const { requests, updateRequest, identityStatus, toast } = useStore()
  const [counterFor, setCounterFor] = useState(null)
  const [counterPrice, setCounterPrice] = useState('')
  const [counterNote, setCounterNote] = useState('')

  const accept = (r) => {
    if (identityStatus !== 'verified') return toast('Verify your identity first to accept paid bookings')
    updateRequest(r.id, { status: 'accepted' })
    toast(`Accepted. ${r.client.name.split(' ')[0]} will be asked to pay the deposit.`)
  }

  const sendCounter = () => {
    updateRequest(counterFor.id, { status: 'countered', counterTotal: Number(counterPrice) })
    toast('Counter offer sent')
    setCounterFor(null)
  }

  return (
    <div className="mt-sm">
      {requests.map((r) => (
        <div key={r.id} className="request-card">
          <div className="row gap-xs">
            <img className="avatar" src={r.client.avatar} alt="" />
            <div className="grow">
              <b>{r.client.name}</b>
              <div className="row gap-xs tiny">
                {r.client.rating ? (
                  <>
                    <Star size={11} className="star-on" fill="currentColor" /> {r.client.rating} as a client ({r.client.reviews})
                  </>
                ) : (
                  <span className="muted">New client, no ratings yet</span>
                )}
              </div>
              {r.client.verified && <VerifiedClient />}
            </div>
            <b>{money(r.total)}</b>
          </div>
          <div className="small mt-sm">
            <b>{r.packageName}</b> · {r.date} · {r.time}
          </div>
          <div className="muted small">{r.location}</div>
          {r.note && <div className="quote small">“{r.note}”</div>}

          {r.status === 'requested' ? (
            <>
              <div className="tiny warn inline-icon"><Clock size={12} /> Expires in {r.expiresIn}</div>
              <div className="row gap-xs mt-sm">
                <button className="btn sm grow" onClick={() => accept(r)}>Accept</button>
                <button className="btn ghost sm grow" onClick={() => { setCounterFor(r); setCounterPrice(String(r.total)); setCounterNote('') }}>Counter</button>
                <button className="btn ghost sm grow danger" onClick={() => updateRequest(r.id, { status: 'declined' })}>Decline</button>
              </div>
            </>
          ) : (
            <div className="small mt-sm">
              {r.status === 'accepted' && '✓ Accepted · waiting for deposit'}
              {r.status === 'countered' && `Counter sent: ${money(r.counterTotal)}`}
              {r.status === 'declined' && 'Declined'}
            </div>
          )}
        </div>
      ))}

      <Sheet open={!!counterFor} onClose={() => setCounterFor(null)} title="Send a counter offer">
        {counterFor && (
          <>
            <div className="muted small">{counterFor.client.name} · {counterFor.packageName} · {counterFor.date}</div>
            <label className="field mt">
              <span>Your price</span>
              <div className="money-input">
                $<input type="number" value={counterPrice} onChange={(e) => setCounterPrice(e.target.value)} />
              </div>
            </label>
            <label className="field mt-sm">
              <span>Message</span>
              <textarea className="input" rows={3} placeholder="Explain the change" value={counterNote} onChange={(e) => setCounterNote(e.target.value)} />
            </label>
            <button className="btn block mt" disabled={!counterPrice} onClick={sendCounter}>Send counter</button>
          </>
        )}
      </Sheet>
    </div>
  )
}

const LEGEND = [
  ['booked', 'Booked'],
  ['held', 'Pending request'],
  ['blackout', 'Blocked off'],
]

function ProviderCalendar() {
  const [days, setDays] = useState(myCalendar)
  const firstWeekday = new Date(2026, 9, 1).getDay()
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: 31 }, (_, i) => i + 1)]

  const toggleBlackout = (d) => {
    if (days[d] === 'booked' || days[d] === 'held') return
    const next = { ...days }
    next[d] === 'blackout' ? delete next[d] : (next[d] = 'blackout')
    setDays(next)
  }

  return (
    <div className="mt-sm">
      <div className="row between">
        <b>October 2026</b>
        <span className="muted tiny">Tap a free day to block it off</span>
      </div>
      <div className="cal">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="cal-head">{d}</div>
        ))}
        {cells.map((d, i) =>
          d ? (
            <button key={i} className={`cal-day ${days[d] || ''} ${d === 7 ? 'today' : ''}`} onClick={() => toggleBlackout(d)}>
              {d}
            </button>
          ) : (
            <div key={i} />
          ),
        )}
      </div>
      <div className="legend">
        {LEGEND.map(([k, label]) => (
          <span key={k}><i className={`cal-swatch ${k}`} /> {label}</span>
        ))}
      </div>
      <div className="info-card mt">
        <div className="row between small"><span>Working hours</span><b>Tue–Sun, 8 AM – 8 PM</b></div>
        <div className="row between small mt-xs"><span>Buffer between bookings</span><b>1 hour</b></div>
        <div className="row between small mt-xs"><span>Service area</span><b>LA + 40 km</b></div>
      </div>
    </div>
  )
}

function Packages() {
  const { toast } = useStore()
  const [list, setList] = useState(myPackages)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', priceType: 'fixed', price: '', hours: '', editedPhotos: '', editingLevel: 'Natural', turnaroundDays: '', depositPct: 50 })
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const save = () => {
    setList([...list, { ...form, id: `mp${Date.now()}`, price: form.priceType === 'quote' ? null : Number(form.price) }])
    setOpen(false)
    toast('Package published')
  }

  return (
    <div className="mt-sm">
      {list.map((p) => (
        <div key={p.id} className="package-card">
          <div className="row between">
            <h4>{p.name}</h4>
            <b>{priceLabel(p)}</b>
          </div>
          <div className="pkg-facts">
            {p.hours && <span><Clock size={13} /> {p.hours}h</span>}
            {p.editedPhotos && <span><Images size={13} /> {p.editedPhotos} edited</span>}
            <span>{p.depositPct}% deposit</span>
          </div>
        </div>
      ))}
      <button className="btn ghost block" onClick={() => setOpen(true)}><Plus size={16} /> New package</button>

      <Sheet open={open} onClose={() => setOpen(false)} title="New package">
        <label className="field"><span>Name</span><input className="input" value={form.name} onChange={set('name')} placeholder="e.g. Engagement Session" /></label>
        <label className="field mt-sm">
          <span>Pricing</span>
          <select className="input" value={form.priceType} onChange={set('priceType')}>
            <option value="fixed">Fixed price</option>
            <option value="hourly">Hourly</option>
            <option value="quote">Quote-based</option>
          </select>
        </label>
        {form.priceType !== 'quote' && (
          <label className="field mt-sm"><span>Price {form.priceType === 'hourly' && '(per hour)'}</span><input className="input" type="number" value={form.price} onChange={set('price')} /></label>
        )}
        <div className="row gap-xs mt-sm">
          <label className="field grow"><span>Hours included</span><input className="input" type="number" value={form.hours} onChange={set('hours')} /></label>
          <label className="field grow"><span>Edited photos</span><input className="input" type="number" value={form.editedPhotos} onChange={set('editedPhotos')} /></label>
        </div>
        <div className="row gap-xs mt-sm">
          <label className="field grow">
            <span>Editing level</span>
            <select className="input" value={form.editingLevel} onChange={set('editingLevel')}>
              <option>Natural</option>
              <option>Film-style</option>
              <option>Full retouch</option>
            </select>
          </label>
          <label className="field grow"><span>Turnaround (days)</span><input className="input" type="number" value={form.turnaroundDays} onChange={set('turnaroundDays')} /></label>
        </div>
        <label className="field mt-sm"><span>Deposit: {form.depositPct}%</span><input type="range" min="0" max="100" step="5" value={form.depositPct} onChange={set('depositPct')} /></label>
        <button className="btn block mt" disabled={!form.name} onClick={save}>Publish package</button>
      </Sheet>
    </div>
  )
}

// Your real albums from Supabase. Tap one to open it in the viewer.
function Portfolio() {
  const { user } = useAuth()
  const [albums, setAlbums] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    getMyProvider(user.id)
      .then((p) => (p ? listMyAlbums(p.id) : []))
      .then(setAlbums)
      .catch((e) => setError(e.message))
  }, [user])

  const cover = (a) => {
    const photos = [...(a.photos || [])].sort((x, y) => x.position - y.position)
    const pick = a.kind === 'before_after' ? photos.find((p) => p.pair_role === 'after') || photos[0] : photos[0]
    return pick ? publicUrl('portfolio', pick.display_path) : null
  }

  return (
    <div className="mt-sm">
      <div className="muted small">This is what clients see on your profile.</div>
      {error && <div className="form-error mt-sm">{error}</div>}
      <div className="grid3 mt-sm rounded-grid">
        <Link to="/upload" className="add-tile">
          <Plus size={22} />
          <span className="tiny">Post photos</span>
        </Link>
        {albums === null && !error && <div className="add-tile muted"><div className="spinner" /></div>}
        {albums?.filter((a) => a.photos?.length).map((a) => (
          <Link key={a.id} to={`/my-work?post=${a.id}`} className="album-tile" title={a.title}>
            <img src={cover(a)} alt="" loading="lazy" />
            {a.photos.length > 1 && a.kind !== 'before_after' && (
              <span className="album-count"><Copy size={12} /> {a.photos.length}</span>
            )}
            {a.kind === 'before_after' && <span className="album-count">B/A</span>}
          </Link>
        ))}
      </div>
      {albums?.length === 0 && <p className="muted small mt-sm">Nothing posted yet. Your albums will appear here.</p>}
    </div>
  )
}
