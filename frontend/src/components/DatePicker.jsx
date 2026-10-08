import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { TODAY, toKey } from '../data/dates.js'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const monthStart = (d) => new Date(d.getFullYear(), d.getMonth(), 1)

// Month calendar where several days can be selected. `dots` maps a date key to a
// list of booking statuses to mark that day with.
export default function DatePicker({ selected = [], onToggle, dots = {}, isDisabled = () => false, month, onMonthChange }) {
  const [ownMonth, setOwnMonth] = useState(monthStart(TODAY))
  const shown = month ?? ownMonth
  const setShown = onMonthChange ?? setOwnMonth

  const firstWeekday = shown.getDay()
  const daysInMonth = new Date(shown.getFullYear(), shown.getMonth() + 1, 0).getDate()
  const cells = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(shown.getFullYear(), shown.getMonth(), i + 1)),
  ]
  const todayKey = toKey(TODAY)

  return (
    <div className="date-picker">
      <div className="bk-cal-head">
        <button className="icon-btn" onClick={() => setShown(new Date(shown.getFullYear(), shown.getMonth() - 1, 1))} aria-label="Previous month">
          <ChevronLeft size={18} />
        </button>
        <b>{shown.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</b>
        <button className="icon-btn" onClick={() => setShown(new Date(shown.getFullYear(), shown.getMonth() + 1, 1))} aria-label="Next month">
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="bk-cal-grid">
        {WEEKDAYS.map((d, i) => <div key={i} className="bk-weekday">{d}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />
          const key = toKey(d)
          const marks = dots[key] || []
          return (
            <button
              key={key}
              className={`bk-day ${key === todayKey ? 'today' : ''} ${selected.includes(key) ? 'selected' : ''} ${marks.length ? 'has' : ''}`}
              disabled={isDisabled(d)}
              onClick={() => onToggle(key)}
            >
              {d.getDate()}
              {marks.length > 0 && (
                <span className="bk-dots">
                  {marks.slice(0, 3).map((s, j) => <i key={j} className={`cal-dot s-${s}`} />)}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
