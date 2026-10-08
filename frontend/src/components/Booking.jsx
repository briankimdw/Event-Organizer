import { Check } from 'lucide-react'
import { bookingSteps, cancellationPolicies, statusLabels } from '../data/mock.js'

export const money = (n) => (n == null ? 'Quote' : `$${Number(n).toLocaleString()}`)

export const startingPrice = (provider) => {
  const priced = provider.packages.filter((x) => x.price != null)
  return priced.length ? Math.min(...priced.map((x) => x.price)) : null
}

export const priceLabel =(pkg) =>
  pkg.priceType === 'quote' ? 'Custom quote' : pkg.priceType === 'hourly' ? `${money(pkg.price)}/hr` : money(pkg.price)

export function StatusPill({ status }) {
  return <span className={`status-pill s-${status}`}>{statusLabels[status]}</span>
}

const SIDE_BRANCHES = ['declined', 'cancelled_by_client', 'cancelled_by_provider', 'disputed', 'refunded']

// The booking state machine as a vertical timeline.
export function StatusTimeline({ booking }) {
  const reached = new Set(booking.history.map((h) => h.status))
  const at = (s) => booking.history.find((h) => h.status === s)?.at
  const branch = [...booking.history].reverse().find((h) => SIDE_BRANCHES.includes(h.status))
  const current = booking.status === 'accepted' || booking.status === 'countered' ? 'requested' : booking.status

  return (
    <ol className="timeline">
      {bookingSteps.map((s) => {
        const done = reached.has(s)
        return (
          <li key={s} className={`${done ? 'done' : ''} ${current === s ? 'current' : ''}`}>
            <span className="dot">{done && <Check size={11} strokeWidth={3} />}</span>
            <div>
              <div className="tl-label">{statusLabels[s]}</div>
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

export function PolicyTable({ policy }) {
  const p = cancellationPolicies[policy]
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
