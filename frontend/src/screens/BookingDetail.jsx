import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Calendar, CreditCard, Lock, MapPin, MessageCircle, ShieldCheck, Upload as UploadIcon } from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import PersonRow from '../components/PersonRow.jsx'
import Sheet from '../components/Sheet.jsx'
import { PolicyTable, StatusPill, StatusTimeline, money } from '../components/Booking.jsx'
import { useStore } from '../store.jsx'
import { findPackage } from '../data/mock.js'

const TODAY = new Date(2026, 9, 7)
const REFUND_RULES = {
  flexible: [[7, 100], [2, 50], [0, 0]],
  moderate: [[30, 100], [14, 50], [0, 0]],
  strict: [[90, 50], [0, 0]],
}
const refundPct = (policy, dateStr) => {
  const days = Math.max(0, Math.round((new Date(dateStr) - TODAY) / 86400000))
  return REFUND_RULES[policy].find(([min]) => days >= min)[1]
}

export default function BookingDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { bookings, updateBooking, startConversation, toast } = useStore()
  const b = bookings.find((x) => x.id === id)
  const { provider: p, pkg } = findPackage(b.packageId)
  const first = p.name.split(' ')[0]
  const [sheet, setSheet] = useState(null) // pay | cancel | dispute
  const [disputeText, setDisputeText] = useState('')

  const total = b.counterTotal ?? b.total
  const deposit = total != null ? Math.round((total * pkg.depositPct) / 100) : null
  const paid = b.depositPaid ? deposit : 0
  const refund = Math.round((paid * refundPct(b.policy, b.date)) / 100)
  const addons = p.addons.filter((a) => b.addonIds.includes(a.id))

  const message = () => navigate(`/inbox/${b.conversationId || startConversation(p.id)}`)

  const pay = () => {
    updateBooking(b.id, { status: 'confirmed', depositPaid: true })
    setSheet(null)
    toast('Deposit paid. Your date is locked in.')
  }
  const cancel = () => {
    updateBooking(b.id, { status: 'cancelled_by_client' })
    setSheet(null)
    toast(paid ? `Cancelled. ${money(refund)} will be refunded.` : 'Request cancelled.')
  }
  const dispute = () => {
    updateBooking(b.id, { status: 'disputed' })
    setSheet(null)
    toast('Dispute opened. The payout is frozen while we review.')
  }

  return (
    <div>
      <TopBar title="Booking" subtitle={`#${b.id.toUpperCase().slice(0, 8)}`} />
      <PersonRow person={p} sub={pkg.name} right={<StatusPill status={b.status} />} />

      <div className="pad">
        <div className="info-card">
          <div className="inline-icon"><Calendar size={15} /> {b.date || 'Date TBD'} · {b.time}</div>
          <div className="inline-icon mt-xs"><MapPin size={15} /> {b.location}</div>
        </div>

        {/* Status-specific call to action */}
        {b.status === 'requested' && (
          <div className="callout">
            <b>Waiting for {first} to respond</b>
            <div className="muted small">The request expires in {b.expiresIn || '48h'}. Your date is held tentatively until then.</div>
          </div>
        )}
        {b.status === 'countered' && (
          <div className="callout">
            <b>{first} sent a counter offer: {money(b.counterTotal)}</b>
            {b.counterNote && <div className="small">“{b.counterNote}”</div>}
            <div className="row gap-xs mt-sm">
              <button className="btn sm" onClick={() => updateBooking(b.id, { status: 'accepted' })}>Accept offer</button>
              <button className="btn ghost sm" onClick={() => updateBooking(b.id, { status: 'declined' })}>Decline</button>
            </div>
          </div>
        )}
        {b.status === 'accepted' && (
          <div className="callout accent">
            <b>{first} accepted! Pay the deposit to confirm.</b>
            <button className="btn accent block mt-sm" onClick={() => setSheet('pay')}>
              <CreditCard size={16} /> Pay {money(deposit)} deposit
            </button>
          </div>
        )}
        {b.status === 'confirmed' && (
          <div className="callout">
            <b><Lock size={14} /> You're booked</b>
            <div className="muted small">{first}'s calendar is locked for this date.</div>
          </div>
        )}
        {b.status === 'in_progress' && (
          <div className="callout"><b>Shoot day!</b><div className="muted small">{first} will upload your photos when they're ready.</div></div>
        )}
        {b.status === 'delivered' && (
          <div className="callout accent">
            <b>Your photos are ready</b>
            <div className="muted small">Accept the delivery to release payment. It's accepted automatically after 7 days.</div>
            <Link to={`/bookings/${b.id}/delivery`} className="btn accent block mt-sm">View gallery</Link>
            <div className="row gap-xs mt-sm">
              <button className="btn ghost sm grow" onClick={() => { updateBooking(b.id, { status: 'completed' }); toast(`Payment released to ${first}. You can leave a review now.`) }}>
                Accept delivery
              </button>
              <button className="btn ghost sm grow danger" onClick={() => setSheet('dispute')}>Report a problem</button>
            </div>
          </div>
        )}
        {b.status === 'completed' && (
          <div className="callout">
            <b>Completed</b>
            <div className="muted small">Payment released to {first}.</div>
            {b.myReview ? (
              <div className="small mt-sm">
                {b.theirReviewSubmitted ? 'Both reviews are now visible.' : `Your review is hidden until ${first} reviews you or 14 days pass.`}
              </div>
            ) : (
              <Link to={`/bookings/${b.id}/review`} className="btn block mt-sm">Review {first}</Link>
            )}
            {b.deliveryExpiresDays && <Link to={`/bookings/${b.id}/delivery`} className="btn ghost block mt-sm">View gallery</Link>}
          </div>
        )}
        {b.status === 'disputed' && (
          <div className="callout danger">
            <b>Dispute open</b>
            <div className="muted small">The payout to {first} is frozen. Both sides can add evidence, then our team decides on a release or refund.</div>
          </div>
        )}
        {(b.status === 'cancelled_by_client' || b.status === 'declined') && (
          <div className="callout">
            <b>{b.status === 'declined' ? 'This request was declined' : 'Booking cancelled'}</b>
            {paid > 0 && <div className="muted small">{money(refund)} refunded to your card.</div>}
          </div>
        )}

        <h4 className="section-title">Status</h4>
        <StatusTimeline booking={b} />

        <h4 className="section-title">Payment</h4>
        <div className="summary">
          {total == null ? (
            <div className="muted small">Waiting for a custom quote.</div>
          ) : (
            <>
              <div className="row between"><span>{pkg.name}</span><span>{money(total - b.travelFee - addons.reduce((s, a) => s + a.price, 0))}</span></div>
              {addons.map((a) => (
                <div key={a.id} className="row between"><span>{a.name}</span><span>{money(a.price)}</span></div>
              ))}
              {b.travelFee > 0 && <div className="row between"><span>Travel fee</span><span>{money(b.travelFee)}</span></div>}
              <div className="row between total"><span>Total</span><span>{money(total)}</span></div>
              <div className="row between small">
                <span>Deposit ({pkg.depositPct}%)</span>
                <span>{b.depositPaid ? `${money(deposit)} paid` : money(deposit)}</span>
              </div>
              {b.depositPaid && !['completed', 'cancelled_by_client'].includes(b.status) && (
                <div className="note mt-sm"><ShieldCheck size={16} /> Held securely. {first} is paid after you accept the delivery.</div>
              )}
            </>
          )}
        </div>

        <div className="mt">
          <PolicyTable policy={b.policy} />
        </div>

        <div className="row gap-xs mt">
          <button className="btn ghost grow" onClick={message}><MessageCircle size={16} /> Message {first}</button>
          {['requested', 'countered', 'accepted', 'confirmed'].includes(b.status) && (
            <button className="btn ghost grow danger" onClick={() => setSheet('cancel')}>Cancel</button>
          )}
        </div>

        {/* Lets you walk through the provider's side of the flow in this prototype. */}
        <DemoControls b={b} updateBooking={updateBooking} />
      </div>

      <Sheet open={sheet === 'pay'} onClose={() => setSheet(null)} title="Pay deposit">
        <div className="summary">
          <div className="row between"><span>Deposit ({pkg.depositPct}%)</span><b>{money(deposit)}</b></div>
          <div className="row between muted small"><span>Balance, charged 14 days before</span><span>{money(total - deposit)}</span></div>
        </div>
        <div className="card-input mt">
          <CreditCard size={18} />
          <span className="grow">Visa •••• 4242</span>
          <span className="muted small">12/29</span>
        </div>
        <div className="note mt"><ShieldCheck size={16} /> Your money is held until your photos are delivered and you accept them.</div>
        <div className="mt"><PolicyTable policy={b.policy} /></div>
        <button className="btn accent block mt" onClick={pay}>Pay {money(deposit)}</button>
      </Sheet>

      <Sheet open={sheet === 'cancel'} onClose={() => setSheet(null)} title="Cancel booking?">
        <PolicyTable policy={b.policy} />
        <div className="summary mt">
          <div className="row between"><span>Paid so far</span><span>{money(paid)}</span></div>
          <div className="row between total"><span>You'd get back</span><span>{money(refund)}</span></div>
        </div>
        <button className="btn danger-solid block mt" onClick={cancel}>Cancel booking</button>
        <button className="btn ghost block mt-sm" onClick={() => setSheet(null)}>Keep booking</button>
      </Sheet>

      <Sheet open={sheet === 'dispute'} onClose={() => setSheet(null)} title="Report a problem">
        <p className="muted small">Opening a dispute freezes the payout to {first}. You'll both be able to share evidence before our team decides.</p>
        <textarea className="input mt" rows={4} placeholder="What went wrong?" value={disputeText} onChange={(e) => setDisputeText(e.target.value)} />
        <button className="btn ghost block mt-sm" onClick={() => toast('Evidence attached')}>
          <UploadIcon size={16} /> Add photos or files
        </button>
        <button className="btn danger-solid block mt" disabled={!disputeText.trim()} onClick={dispute}>Open dispute</button>
      </Sheet>
    </div>
  )
}

function DemoControls({ b, updateBooking }) {
  const actions = {
    requested: [
      ['Provider accepts', { status: 'accepted' }],
      ['Provider counters', { status: 'countered', counterTotal: Math.round((b.total ?? 500) * 1.15), counterNote: 'Adding a bit for the travel day.' }],
      ['Provider declines', { status: 'declined' }],
    ],
    confirmed: [['Event day starts', { status: 'in_progress' }]],
    in_progress: [['Provider uploads photos', { status: 'delivered', deliveryExpiresDays: 30 }]],
  }[b.status]
  if (!actions) return null
  return (
    <div className="demo-box">
      <div className="tiny muted">PROTOTYPE · simulate the other side</div>
      <div className="row gap-xs wrap mt-xs">
        {actions.map(([label, patch]) => (
          <button key={label} className="btn ghost sm" onClick={() => updateBooking(b.id, patch)}>{label}</button>
        ))}
      </div>
    </div>
  )
}
