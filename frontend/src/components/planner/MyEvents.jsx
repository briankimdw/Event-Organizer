import { ChevronRight } from 'lucide-react'
import { ErrorState, Loading } from '../States.jsx'
import { centsShort, datesLabel, typeIcon } from './brief.js'

// Saved plans. Tapping one restores its brief and re-runs the planner.
export default function MyEvents({ query, onOpen, activeId }) {
  const { data, loading, error, reload } = query
  if (loading && !data) return <Loading inline label="Loading your events…" />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!data?.length) return <div className="muted small plan-events-empty">Plans you save show up here.</div>
  return (
    <div className="plan-events">
      {data.map((ev) => {
        const Icon = typeIcon(ev.type)
        const bits = [datesLabel(ev.brief), ev.locationText?.split(',')[0], ev.budgetCents != null && centsShort(ev.budgetCents)].filter(Boolean)
        return (
          <button key={ev.id} type="button" className={`plan-event-row ${ev.id === activeId ? 'active' : ''}`} onClick={() => onOpen(ev)}>
            <span className="round-icon"><Icon size={17} /></span>
            <span className="grow">
              <b className="small ellipsis block">{ev.title}</b>
              <span className="muted tiny ellipsis block">{bits.join(' · ') || 'No details yet'}</span>
            </span>
            <ChevronRight size={16} className="muted" />
          </button>
        )
      })}
    </div>
  )
}
