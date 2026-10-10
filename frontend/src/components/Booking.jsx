import { Check } from 'lucide-react'
import { bookingSteps, statusLabels } from '../lib/format.js'

// Re-exported so screens can keep importing the money helpers from here.
export { fromPriceLabel, money, priceLabel, startingPackage, startingPrice } from '../lib/format.js'

export function StatusPill({ status }) {
  return <span className={`status-pill s-${status}`}>{statusLabels[status] || status}</span>
}

const SIDE_BRANCHES = ['declined', 'expired', 'cancelled_by_client', 'cancelled_by_provider', 'disputed', 'refunded']
const STEP_LABELS = { ...statusLabels, accepted: 'Accepted', countered: 'Counter offer' }

// The booking state machine as a vertical timeline. "Counter offer" and
// "Accepted" only appear when the booking actually went through them.
export function StatusTimeline({ booking }) {
  const reached = new Set(booking.history.map((h) => h.status))
  const at = (s) => booking.history.find((h) => h.status === s)?.at
  const branch = [...booking.history].reverse().find((h) => SIDE_BRANCHES.includes(h.status))
  const steps = bookingSteps.flatMap((s) =>
    s === 'confirmed' ? [...['countered', 'accepted'].filter((x) => reached.has(x) || booking.status === x), s] : [s],
  )

  return (
    <ol className="timeline">
      {steps.map((s) => {
        const done = reached.has(s)
        return (
          <li key={s} className={`${done ? 'done' : ''} ${booking.status === s ? 'current' : ''}`}>
            <span className="dot">{done && <Check size={11} strokeWidth={3} />}</span>
            <div>
              <div className="tl-label">{STEP_LABELS[s]}</div>
              {at(s) && <div className="muted tiny">{at(s)}</div>}
            </div>
          </li>
        )
      })}
      {branch && (
        <li className="branch current">
          <span className="dot" />
          <div>
            <div className="tl-label">{statusLabels[branch.status]}</div>
            <div className="muted tiny">{branch.at}</div>
          </div>
        </li>
      )}
    </ol>
  )
}

// policy: { label, tiers } from policyFromRules (provider.cancellationPolicy / booking.policy).
export function PolicyTable({ policy: p }) {
  if (!p?.tiers?.length) return null
  return (
    <div className="policy">
      <div className="policy-head">
        Cancellation policy: <b>{p.label}</b>
      </div>
      {p.tiers.map((t) => (
        <div key={t.when} className="policy-row">
          <span>{t.when}</span>
          <span className={t.refund ? '' : 'muted'}>{t.refund}% refund</span>
        </div>
      ))}
    </div>
  )
}
