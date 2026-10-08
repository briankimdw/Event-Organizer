import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { EyeOff } from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import Stars from '../components/Stars.jsx'
import ProfileLink from '../components/ProfileLink.jsx'
import { useStore } from '../store.jsx'
import { findPackage } from '../data/mock.js'

export default function Review() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { bookings, updateBooking, toast } = useStore()
  const b = bookings.find((x) => x.id === id)
  const { provider: p, pkg } = findPackage(b.packageId)
  const [rating, setRating] = useState(0)
  const [text, setText] = useState('')

  const submit = () => {
    updateBooking(b.id, { myReview: { rating, text } })
    toast(b.theirReviewSubmitted ? 'Review posted. Both reviews are now visible.' : 'Review saved. It stays hidden until both of you review.')
    navigate(-1)
  }

  return (
    <div>
      <TopBar title="Leave a review" />
      <div className="pad center-col">
        <ProfileLink id={p.id}><img className="avatar xl" src={p.avatar} alt="" /></ProfileLink>
        <h3>How was your shoot with {p.name.split(' ')[0]}?</h3>
        <div className="muted small">{pkg.name} · {b.date}</div>
        <div className="mt">
          <Stars value={rating} size={36} onChange={setRating} />
        </div>
        <textarea className="input mt" rows={5} placeholder="Share details about your experience" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="note mt">
          <EyeOff size={16} />
          Reviews are double-blind. Neither of you sees the other's review until you've both posted, or 14 days pass.
          {b.theirReviewSubmitted && ` ${p.name.split(' ')[0]} has already reviewed you.`}
        </div>
        <button className="btn accent block mt-lg" disabled={!rating} onClick={submit}>Submit review</button>
      </div>
    </div>
  )
}
