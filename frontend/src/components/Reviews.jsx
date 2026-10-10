import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, ShieldCheck } from 'lucide-react'
import Sheet from './Sheet.jsx'
import Stars from './Stars.jsx'
import ProfileLink, { PersonAvatar } from './ProfileLink.jsx'
import useQuery from '../lib/useQuery.js'
import { reviewBooking } from '../api/catalog.js'

// Reviews from listReviews(): tap the reviewer to open their profile, tap the review to read it in full.
// provider: who the reviews are about ({ id, name, avatar }). here: we're on that provider's page.
export default function ReviewList({ reviews, provider, here = false }) {
  const [open, setOpen] = useState(null)
  return (
    <>
      {reviews.map((r) => (
        <ReviewItem key={r.id} review={r} onOpen={() => setOpen(r)} />
      ))}
      <ReviewSheet review={open} provider={provider} here={here} onClose={() => setOpen(null)} />
    </>
  )
}

function ReviewItem({ review: r, onOpen }) {
  const onKey = (e) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen()
    }
  }
  return (
    <div
      className="review tappable"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={onKey}
      aria-label={`${r.rating}-star review by ${r.name}, ${r.date}. Read the full review`}
    >
      <div className="row gap-xs">
        <PersonAvatar id={r.authorId} src={r.avatar} name={r.name} username={r.username} className="avatar sm" />
        {r.authorId ? (
          <ProfileLink id={r.authorId} className="review-author"><b className="small">{r.name}</b></ProfileLink>
        ) : (
          <b className="small">{r.name}</b>
        )}
        <Stars value={r.rating} size={12} />
        <span className="muted tiny grow right-text">{r.date}</span>
      </div>
      {r.text ? <p className="small review-text">{r.text}</p> : <p className="muted small">Rated {r.rating} out of 5, no written comment.</p>}
    </div>
  )
}

const fullDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null)

export function ReviewSheet({ review: r, provider, here = false, onClose }) {
  // What it was for: only the booking's client and photographer can see that.
  const { data: booking } = useQuery(r?.bookingId ? () => reviewBooking(r.bookingId).catch(() => null) : null, [r?.bookingId])
  const first = (r?.name || '').split(' ')[0]
  return (
    <Sheet open={!!r} onClose={onClose} title="Review">
      {r && (
        <div className="review-detail">
          <div className="row gap-xs">
            <PersonAvatar id={r.authorId} src={r.avatar} name={r.name} username={r.username} className="avatar lg" />
            <div className="grow">
              {r.authorId ? (
                <ProfileLink id={r.authorId} className="review-author"><b>{r.name}</b></ProfileLink>
              ) : (
                <b>{r.name}</b>
              )}
              <div className="row gap-xs mt-xs">
                <Stars value={r.rating} size={18} />
                <span className="small"><b>{r.rating}</b><span className="muted"> / 5</span></span>
              </div>
              <div className="muted tiny mt-xs">{fullDate(r.createdAt) || r.date}</div>
            </div>
          </div>

          {r.text ? <p className="review-full">{r.text}</p> : <p className="muted small mt">No written comment, just a {r.rating}-star rating.</p>}

          {provider && (() => {
            const about = (
              <>
                <img className="avatar sm" src={provider.avatar} alt="" />
                <span className="grow small">
                  Review of <b>{provider.name}</b>
                  {booking?.packageName && <span className="muted"> · {booking.packageName}</span>}
                  {booking?.completed && <span className="muted"> · {booking.completed}</span>}
                </span>
              </>
            )
            return here ? (
              <div className="review-for">{about}</div>
            ) : (
              <ProfileLink id={provider.id} className="review-for">{about}<ChevronRight size={16} className="muted" /></ProfileLink>
            )
          })()}

          <div className="muted tiny inline-icon mt-sm">
            <ShieldCheck size={13} /> From a completed booking. Only clients who booked can leave a review.
          </div>

          {r.authorId && (
            <Link to={`/u/${r.authorId}`} className="btn block mt">
              View {first ? `${first}’s` : 'their'} profile
            </Link>
          )}
        </div>
      )}
    </Sheet>
  )
}
