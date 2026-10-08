import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Camera, CircleDot, MapPin, MessageCircle, MoreHorizontal, Send, Clock, Images, Sparkles } from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import Segmented from '../components/Segmented.jsx'
import Stars from '../components/Stars.jsx'
import { IdVerified, ProBadge } from '../components/Badges.jsx'
import { PolicyTable, priceLabel } from '../components/Booking.jsx'
import { ModerationSheet, ShareSheet } from '../components/PostSheets.jsx'
import { useStore } from '../store.jsx'
import { getPerson, img, posts } from '../data/mock.js'

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

export function AvailabilityStrip({ unavailable, selected, onSelect }) {
  const today = new Date(2026, 9, 7)
  return (
    <div className="avail-strip">
      {Array.from({ length: 14 }, (_, i) => {
        const d = new Date(today)
        d.setDate(today.getDate() + i + 1)
        const busy = unavailable.includes(i)
        const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        return (
          <button
            key={i}
            className={`avail-day ${busy ? 'busy' : ''} ${selected === label ? 'on' : ''}`}
            disabled={busy || !onSelect}
            onClick={() => onSelect?.(label)}
          >
            <span>{DAYS[d.getDay()]}</span>
            <b>{d.getDate()}</b>
          </button>
        )
      })}
    </div>
  )
}

export default function Profile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { following, toggleFollow, startConversation } = useStore()
  const person = getPerson(id)
  const isProvider = !!person.packages
  const [tab, setTab] = useState('portfolio')
  const [share, setShare] = useState(false)
  const [menu, setMenu] = useState(false)

  const portfolio = [
    ...posts.filter((p) => p.authorId === id).map((p) => ({ seed: p.photos[0], postId: p.id })),
    ...Array.from({ length: 9 }, (_, i) => ({ seed: `${id}-grid-${i}` })),
  ]

  const contact = () => navigate(`/inbox/${startConversation(id)}`)

  return (
    <div>
      <TopBar
        title={`@${person.username}`}
        right={
          <>
            <button className="icon-btn" onClick={() => setShare(true)}><Send size={20} /></button>
            <button className="icon-btn" onClick={() => setMenu(true)}><MoreHorizontal size={20} /></button>
          </>
        }
      />
      {person.cover && <img className="cover" src={person.cover} alt="" />}
      <div className={`profile-head ${person.cover ? 'has-cover' : ''}`}>
        <img className="avatar xl" src={person.avatar} alt="" />
        <h2>
          {person.name} {person.idVerified && <IdVerified label />} {person.pro && <ProBadge />}
        </h2>
        {person.city && (
          <div className="muted small inline-icon">
            <MapPin size={13} /> {person.city}
          </div>
        )}
        {isProvider && (
          <div className="row gap-xs small mt-xs">
            <Stars value={person.rating} /> <b>{person.rating}</b>
            <span className="muted">({person.reviewCount} reviews)</span>
            <span className="muted">· {person.followers} followers</span>
          </div>
        )}
        {person.bio && <p className="mt-sm">{person.bio}</p>}
        {isProvider && (
          <div className="chips center">
            {person.specialties.map((s) => (
              <span key={s} className="chip">{s}</span>
            ))}
          </div>
        )}
        <div className="row gap-xs mt full">
          <button className={`btn grow ${following.has(id) ? 'ghost' : ''}`} onClick={() => toggleFollow(id)}>
            {following.has(id) ? 'Following' : 'Follow'}
          </button>
          <button className="btn ghost grow" onClick={contact}>
            <MessageCircle size={16} /> {isProvider ? 'Ask a question' : 'Message'}
          </button>
        </div>
        {isProvider && (
          <Link to={`/book/${id}`} className="btn accent block mt-sm">
            Book {person.name.split(' ')[0]}
          </Link>
        )}
      </div>

      {isProvider && (
        <div className="pad-x">
          <div className="info-card">
            <div className="row between">
              <div className="small"><b>Availability</b> · next 2 weeks</div>
              <div className="muted tiny">{person.serviceArea}</div>
            </div>
            <AvailabilityStrip unavailable={person.unavailable} />
          </div>
        </div>
      )}

      {isProvider && (
        <div className="pad-x mt">
          <Segmented
            options={[
              { value: 'portfolio', label: 'Portfolio' },
              { value: 'packages', label: 'Packages' },
              { value: 'gear', label: 'Gear' },
              { value: 'reviews', label: 'Reviews' },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
      )}

      {tab === 'portfolio' && (
        <div className="grid3 mt-sm">
          {portfolio.map((p) =>
            p.postId ? (
              <Link key={p.seed} to={`/post/${p.postId}`}>
                <img src={img(p.seed, 300, 300)} alt="" loading="lazy" />
              </Link>
            ) : (
              <img key={p.seed} src={img(p.seed, 300, 300)} alt="" loading="lazy" />
            ),
          )}
        </div>
      )}

      {tab === 'packages' && (
        <div className="pad">
          {person.packages.map((pkg) => (
            <div key={pkg.id} className="package-card">
              <div className="row between">
                <h4>{pkg.name}</h4>
                <b>{priceLabel(pkg)}</b>
              </div>
              <div className="pkg-facts">
                {pkg.hours && <span><Clock size={13} /> {pkg.hours}h</span>}
                {pkg.editedPhotos && <span><Images size={13} /> {pkg.editedPhotos} edited</span>}
                {pkg.turnaroundDays && <span><Sparkles size={13} /> {pkg.turnaroundDays}-day turnaround</span>}
              </div>
              {pkg.editingLevel && <div className="muted small">Editing: {pkg.editingLevel}</div>}
              <div className="muted small">Includes: {pkg.deliverables.join(', ')}</div>
              <div className="muted small">{pkg.depositPct}% deposit to confirm</div>
              <Link to={`/book/${id}?pkg=${pkg.id}`} className="btn sm mt-sm">Select</Link>
            </div>
          ))}
          {person.addons.length > 0 && (
            <>
              <h4 className="section-title">Add-ons</h4>
              {person.addons.map((a) => (
                <div key={a.id} className="row between small line">
                  <span>{a.name}</span>
                  <span>+${a.price}</span>
                </div>
              ))}
            </>
          )}
          <h4 className="section-title">Service area</h4>
          <div className="small">{person.serviceArea}</div>
          <div className="muted small">Travel fee: {person.travelFee}</div>
          <div className="mt">
            <PolicyTable policy={person.cancellationPolicy} />
          </div>
        </div>
      )}

      {tab === 'gear' && (
        <div className="pad">
          <h4 className="section-title">Bodies</h4>
          {person.gear.bodies.map((g) => (
            <div key={g} className="gear-row"><Camera size={16} /> {g}</div>
          ))}
          <h4 className="section-title">Lenses</h4>
          {person.gear.lenses.map((g) => (
            <div key={g} className="gear-row"><CircleDot size={16} /> {g}</div>
          ))}
        </div>
      )}

      {tab === 'reviews' && (
        <div className="pad">
          <div className="rating-summary">
            <div className="big">{person.rating}</div>
            <div>
              <Stars value={person.rating} size={16} />
              <div className="muted small">{person.reviewCount} reviews from completed bookings</div>
            </div>
          </div>
          {person.reviews.length === 0 && <div className="muted small mt">No written reviews yet.</div>}
          {person.reviews.map((r) => (
            <div key={r.name} className="review">
              <div className="row gap-xs">
                <img className="avatar sm" src={r.avatar} alt="" />
                <b className="small">{r.name}</b>
                <Stars value={r.rating} size={12} />
                <span className="muted tiny grow right-text">{r.date}</span>
              </div>
              <p className="small">{r.text}</p>
            </div>
          ))}
        </div>
      )}

      <ShareSheet open={share} onClose={() => setShare(false)} link={`/u/${person.username}`} payload={{ text: `Check out @${person.username}` }} />
      <ModerationSheet open={menu} onClose={() => setMenu(false)} what="profile" username={person.username} />
    </div>
  )
}
