import { Link } from 'react-router-dom'
import { CalendarDays, ChevronRight, ImageOff, Star } from 'lucide-react'
import { shareLink } from '../../api/messages.js'
import { BeforeAfterBadge } from '../beforeafter/BeforeAfter.jsx'
import './share.css'

// A card for something shared in chat (message.shared from api/messages.js):
// a post or a photographer. Tapping it opens the thing. Events shared before events
// were archived show as a stub.
export default function ShareCard({ shared, mine = false }) {
  if (!shared) return null
  if (shared.kind === 'event') return <EventStub s={shared} mine={mine} />
  if (!shared.available) {
    return (
      <div className={`share-card gone ${mine ? 'mine' : ''}`}>
        <ImageOff size={16} aria-hidden="true" />
        <span className="small">{shared.kind === 'post' ? 'This post is no longer available' : 'This profile is no longer available'}</span>
      </div>
    )
  }
  if (shared.kind === 'post') return <PostCard s={shared} />
  if (shared.kind === 'provider') return <VendorCard s={shared} />
  return null
}

function PostCard({ s }) {
  return (
    <Link to={shareLink(s)} className="share-card post" aria-label={`${s.beforeAfter ? 'Before and after post' : 'Post'}${s.title ? `: ${s.title}` : ''}${s.vendorName ? ` by ${s.vendorName}` : ''}`}>
      {s.vendorName && <div className="sc-head"><b className="small ellipsis">{s.vendorName}</b></div>}
      {s.cover ? (
        s.beforeAfter ? (
          <span className="sc-media">
            <img className="sc-photo" src={s.cover} alt="" loading="lazy" />
            <BeforeAfterBadge />
          </span>
        ) : <img className="sc-photo" src={s.cover} alt="" loading="lazy" />
      ) : <div className="sc-photo ph"><ImageOff size={22} /></div>}
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
    <Link to={shareLink(s)} className="share-card vendor" aria-label={`Photographer: ${s.name}`}>
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

// An event shared before events were archived: just say what it was (no page to open).
function EventStub({ s, mine }) {
  return (
    <div className={`share-card gone ${mine ? 'mine' : ''}`}>
      <CalendarDays size={16} aria-hidden="true" />
      <span className="small">Shared an event{s.title ? `: ${s.title}` : ''}</span>
    </div>
  )
}
