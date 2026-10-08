import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Info } from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import PersonRow from '../components/PersonRow.jsx'
import { PolicyTable, money, priceLabel } from '../components/Booking.jsx'
import { AvailabilityStrip } from './Profile.jsx'
import { useStore } from '../store.jsx'
import { useAuth } from '../auth.jsx'
import { getProvider } from '../data/mock.js'
import { fmtBooking, fromKey, parseDates } from '../data/dates.js'

const LOCATIONS = [
  { label: 'Downtown Los Angeles', extraKm: 0 },
  { label: 'Malibu', extraKm: 0 },
  { label: 'Pasadena', extraKm: 0 },
  { label: 'Santa Barbara', extraKm: 95 },
  { label: 'Palm Springs', extraKm: 120 },
]
const TIMES = ['9:00 AM', '11:00 AM', '2:00 PM', '4:00 PM', '6:00 PM']

export default function BookingRequest() {
  const { providerId } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { addBooking, toast } = useStore()
  const { user } = useAuth()
  const p = getProvider(providerId)

  const [pkgId, setPkgId] = useState(params.get('pkg') || p.packages[0].id)
  const [hours, setHours] = useState(null)
  // Dates picked in a date search arrive pre-selected; each selected date becomes its own request.
  const [requestedDates] = useState(() => parseDates(params.get('dates')).map((k) => fmtBooking(fromKey(k))))
  const [dates, setDates] = useState(requestedDates)
  const toggleDate = (d) => setDates(dates.includes(d) ? dates.filter((x) => x !== d) : [...dates, d])
  const [time, setTime] = useState('2:00 PM')
  const [loc, setLoc] = useState(LOCATIONS[0].label)
  const [addons, setAddons] = useState([])
  const [note, setNote] = useState('')

  const pkg = p.packages.find((x) => x.id === pkgId)
  const isQuote = pkg.priceType === 'quote'
  const hrs = hours ?? pkg.hours
  const base = isQuote ? 0 : pkg.priceType === 'hourly' ? pkg.price * hrs : pkg.price
  const addonTotal = p.addons.filter((a) => addons.includes(a.id)).reduce((s, a) => s + a.price, 0)
  const extraKm = LOCATIONS.find((l) => l.label === loc).extraKm
  const travelFee = Math.round(extraKm * 1.5)
  const total = base + addonTotal + travelFee
  const deposit = Math.round((total * pkg.depositPct) / 100)

  const send = () => {
    // Requests need an account: sign in, then come straight back to this form.
    if (!user) {
      navigate(`/sign-in?next=${encodeURIComponent(window.location.pathname + window.location.search)}`)
      return
    }
    const ids = dates.map((date, i) => {
      const id = `b${Date.now()}${i}`
      addBooking({
        id, providerId, packageId: pkgId, addonIds: addons, date, time, location: loc, travelFee,
        total: isQuote ? null : total, depositPaid: false, status: 'requested', policy: p.cancellationPolicy,
        expiresIn: '48h', note, history: [{ status: 'requested', at: 'Just now' }],
      })
      return id
    })
    const first = p.name.split(' ')[0]
    toast(ids.length > 1 ? `${ids.length} requests sent. ${first} has 48h to respond.` : `Request sent. ${first} has 48h to respond.`)
    navigate(ids.length > 1 ? '/bookings' : `/bookings/${ids[0]}`, { replace: true })
  }

  return (
    <div>
      <TopBar title="Request booking" />
      <PersonRow person={p} sub={`${p.rating} ★ · ${p.serviceArea}`} />
      <div className="pad">
        <h4 className="section-title">Package</h4>
        {p.packages.map((x) => (
          <label key={x.id} className={`option ${pkgId === x.id ? 'on' : ''}`}>
            <input type="radio" checked={pkgId === x.id} onChange={() => { setPkgId(x.id); setHours(null) }} />
            <div className="grow">
              <b>{x.name}</b>
              <div className="muted small">
                {[x.hours && `${x.hours}h`, x.editedPhotos && `${x.editedPhotos} photos`, x.turnaroundDays && `${x.turnaroundDays}-day turnaround`]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
            <b>{priceLabel(x)}</b>
          </label>
        ))}

        {pkg.priceType === 'hourly' && (
          <div className="row between mt-sm">
            <span className="small">Hours</span>
            <div className="stepper">
              <button onClick={() => setHours(Math.max(1, hrs - 0.5))}>−</button>
              <b>{hrs}</b>
              <button onClick={() => setHours(hrs + 0.5)}>+</button>
            </div>
          </div>
        )}

        <h4 className="section-title">{dates.length > 1 ? `Dates (${dates.length})` : 'Date'}</h4>
        {requestedDates.length > 0 && (
          <>
            <div className="muted tiny">Your dates where {p.name.split(' ')[0]} is free</div>
            <div className="chips mt-xs mb-sm">
              {requestedDates.map((d) => (
                <button key={d} className={`chip toggle ${dates.includes(d) ? 'on' : ''}`} onClick={() => toggleDate(d)}>
                  {new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </button>
              ))}
            </div>
            <div className="muted tiny mt-sm">Or pick from the next 2 weeks</div>
          </>
        )}
        <AvailabilityStrip unavailable={p.unavailable} selected={dates} onSelect={toggleDate} />
        <div className="chips mt-sm">
          {TIMES.map((t) => (
            <button key={t} className={`chip toggle ${time === t ? 'on' : ''}`} onClick={() => setTime(t)}>
              {t}
            </button>
          ))}
        </div>

        <h4 className="section-title">Location</h4>
        <select className="input" value={loc} onChange={(e) => setLoc(e.target.value)}>
          {LOCATIONS.map((l) => (
            <option key={l.label} value={l.label}>
              {l.label}{l.extraKm ? ` (+${l.extraKm} km outside service area)` : ''}
            </option>
          ))}
        </select>

        {p.addons.length > 0 && (
          <>
            <h4 className="section-title">Add-ons</h4>
            {p.addons.map((a) => (
              <label key={a.id} className="check-row">
                <input
                  type="checkbox"
                  checked={addons.includes(a.id)}
                  onChange={() => setAddons(addons.includes(a.id) ? addons.filter((x) => x !== a.id) : [...addons, a.id])}
                />
                <span className="grow">{a.name}</span>
                <span>+${a.price}</span>
              </label>
            ))}
          </>
        )}

        <h4 className="section-title">Notes for {p.name.split(' ')[0]}</h4>
        <textarea className="input" rows={3} placeholder="Tell them about the shoot…" value={note} onChange={(e) => setNote(e.target.value)} />

        <h4 className="section-title">Price</h4>
        {isQuote ? (
          <div className="note">
            <Info size={16} /> This package is quote-based. {p.name.split(' ')[0]} will reply with a custom price.
          </div>
        ) : (
          <div className="summary">
            <div className="row between"><span>{pkg.name}{pkg.priceType === 'hourly' ? ` (${hrs}h)` : ''}</span><span>{money(base)}</span></div>
            {p.addons.filter((a) => addons.includes(a.id)).map((a) => (
              <div key={a.id} className="row between"><span>{a.name}</span><span>{money(a.price)}</span></div>
            ))}
            {travelFee > 0 && (
              <div className="row between"><span>Travel fee ({extraKm} km)</span><span>{money(travelFee)}</span></div>
            )}
            <div className="row between total"><span>{dates.length > 1 ? 'Per date' : 'Total'}</span><span>{money(total)}</span></div>
            {dates.length > 1 && (
              <div className="row between total"><span>Total for {dates.length} dates</span><span>{money(total * dates.length)}</span></div>
            )}
            <div className="row between muted small"><span>Deposit due on acceptance ({pkg.depositPct}%){dates.length > 1 && ', per date'}</span><span>{money(deposit)}</span></div>
            <div className="row between muted small"><span>Balance due 14 days before</span><span>{money(total - deposit)}</span></div>
          </div>
        )}

        <div className="mt">
          <PolicyTable policy={p.cancellationPolicy} />
        </div>

        <div className="note mt">
          <Info size={16} />
          You won't be charged until {p.name.split(' ')[0]} accepts. Your payment is held until your photos are delivered.
        </div>

        <button className="btn accent block mt-lg" disabled={!dates.length} onClick={send}>
          {dates.length === 0 ? 'Pick a date' : !user ? 'Sign in to send request' : dates.length === 1 ? `Send request · ${dates[0]}` : `Send ${dates.length} requests`}
        </button>
      </div>
    </div>
  )
}
