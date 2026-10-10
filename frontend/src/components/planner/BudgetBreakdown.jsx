import { useState } from 'react'
import { cents } from './brief.js'

// Fixed categorical order (by position among the bookable categories, so a
// category keeps its color as long as the plan's shape doesn't change).
// Categories you can't book yet are drawn in grey.
const SERIES = ['#2a78d6', '#1baf7a', '#eda100', '#e87ba4', '#4a3aa7', '#eb6834']

// Stacked bar + rows. The rows double as the legend and the table view.
export default function BudgetBreakdown({ budget, total }) {
  const [active, setActive] = useState(null)
  if (!budget?.length) return null

  const sum = budget.reduce((s, b) => s + (b.cents || 0), 0)
  const shown = total ?? sum
  const shownBase = Math.max(shown || 0, sum)
  let bookableIndex = 0
  const rows = budget.map((b) => ({
    ...b,
    color: b.bookable ? SERIES[bookableIndex++ % SERIES.length] : null,
    share: sum ? (b.cents || 0) / sum : 0,
    // Computed from the amounts so it always adds up, whatever scale `pct` uses.
    pctLabel: shownBase ? Math.round(((b.cents || 0) / shownBase) * 100) : Math.round(b.pct ?? 0),
  }))

  return (
    <section className="plan-card">
      <div className="row between">
        <div className="plan-label">Budget breakdown</div>
        <b className="plan-total">{cents(shown)}</b>
      </div>
      <div className="plan-bar" role="img" aria-label={rows.map((r) => `${r.label} ${cents(r.cents)}`).join(', ')}>
        {rows.map((r) =>
          r.share > 0 ? (
            <span
              key={r.category}
              className={`plan-bar-seg ${r.bookable ? '' : 'soon'} ${active && active !== r.category ? 'dim' : ''}`}
              style={{ flexGrow: r.share, background: r.color || undefined }}
              title={`${r.label}: ${cents(r.cents)} (${r.pctLabel}%)`}
              onMouseEnter={() => setActive(r.category)}
              onMouseLeave={() => setActive(null)}
              onClick={() => setActive((a) => (a === r.category ? null : r.category))}
            />
          ) : null,
        )}
      </div>
      <div className="plan-budget-rows">
        {rows.map((r) => (
          <div
            key={r.category}
            className={`plan-budget-row ${r.bookable ? '' : 'soon'} ${active === r.category ? 'active' : ''}`}
            onMouseEnter={() => setActive(r.category)}
            onMouseLeave={() => setActive(null)}
          >
            <i className={`plan-dot ${r.bookable ? '' : 'soon'}`} style={{ background: r.color || undefined }} />
            <span className="grow">
              {r.label}
              {!r.bookable && <span className="plan-soon-tag">Coming soon</span>}
            </span>
            <span className="muted tiny plan-pct">{r.pctLabel}%</span>
            <b className="plan-amt">{cents(r.cents)}</b>
          </div>
        ))}
      </div>
    </section>
  )
}
