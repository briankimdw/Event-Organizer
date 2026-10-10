import { Link } from 'react-router-dom'
import { CalendarDays, ChevronRight, ImageOff, MapPin, Star } from 'lucide-react'
import { shareLink } from '../../api/messages.js'
import './share.css'

// A card for something shared in chat (message.shared from api/messages.js):
// a post, a vendor or an event. Tapping it opens the thing.
export default function ShareCard({ shared, mine = false }) {
  if (!shared) return null
  if (!shared.available && shared.kind !== 'event') {
    return (
      <div className={`share-card gone ${mine ? 'mine' : ''}`}>
        <ImageOff size={16} />
        <span className="small">{shared.kind === 'post' ? 'This post is no longer available' : 'This vendor is no longer available'}</span>
      </div>
    )
  }
  if (shared.kind === 'post') return <PostCard s={shared} />
  if (shared.kind === 'provider') return <VendorCard s={shared} />
  if (shared.kind === 'event') return <EventCard s={shared} />
  return null
}

function PostCard({ s }) {
  return (
    <Link to={shareLink(s)} className="share-card post" aria-label={`Post${s.title ? `: ${s.title}` : ''}${s.vendorName ? ` by ${s.vendorName}` : ''}`}>
      {s.vendorName && <div className="sc-head"><b className="small ellipsis">{s.vendorName}</b></div>}
      {s.cover ? <img className="sc-photo" src={s.cover} alt="" loading="lazy" /> : <div className="sc-photo ph"><ImageOff size={22} /></div>}
      <div className="sc-body">
        {s.title && <b className="small ellipsis">{s.title}</b>}
        {s.caption && <div className="sc-caption tiny">{s.caption}</div>}
      </div>
    </Link>
  )
}

function VendorCard({ s }) {
  const meta = [s.noun && s.noun.replace(/^\w/, (c) => c.toUpperCase()), s.city?.split(',')[0]].filter(Boolean).join(' · ')
  return (
    <Link to={shareLink(s)} className="share-card vendor" aria-label={`Vendor: ${s.name}`}>
      <div className={`sc-cover ${s.cover ? '' : 'ph'}`}>{s.cover && <img src={s.cover} alt="" loading="lazy" />}</div>
      <div className="sc-vendor">
        <img className="sc-avatar" src={s.avatar} alt="" />
        <div className="grow ellipsis">
          <b className="ellipsis">{s.name}</b>
          {meta && <div className="muted tiny ellipsis">{meta}</div>}
          <div className="sc-stats tiny">
            {s.rating != null ? (
              <span><Star size={11} className="sc-star" /> {s.rating.toFixed(1)} <span className="muted">({s.reviewCount})</span></span>
            ) : (
              <span className="muted">New</span>
            )}
            {s.fromPrice && <span className="sc-price">{s.fromPrice}</span>}
          </div>
        </div>
      </div>
      <div className="sc-cta tiny">View profile <ChevronRight size={14} /></div>
    </Link>
  )
}

function EventCard({ s }) {
  const d = s.startsAt ? new Date(s.startsAt) : null
  const body = (
    <>
      {s.cover && <img className="sc-event-cover" src={s.cover} alt="" loading="lazy" />}
      <div className="sc-event-top">
        <div className="sc-cal" aria-hidden="true">
          {d ? (
            <>
              <span>{d.toLocaleDateString('en-US', { month: 'short' })}</span>
              <b>{d.getDate()}</b>
            </>
          ) : (
            <CalendarDays size={20} />
          )}
        </div>
        <div className="grow ellipsis">
          <div className="sc-kicker tiny">Event</div>
          <b className="sc-event-title">{s.title}</b>
        </div>
      </div>
      <div className="sc-event-lines tiny">
        <div><CalendarDays size={12} /> {s.date || 'Date to be decided'}</div>
        {s.location && <div className="ellipsis"><MapPin size={12} /> {s.location}</div>}
      </div>
      {s.available ? <div className="sc-cta tiny">View event <ChevronRight size={14} /></div> : <div className="sc-cta tiny muted">This event was deleted</div>}
    </>
  )
  return s.available ? (
    <Link to={shareLink(s)} className="share-card event" aria-label={`Event: ${s.title}`}>{body}</Link>
  ) : (
    <div className="share-card event">{body}</div>
  )
}
