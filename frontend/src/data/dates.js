// Date helpers shared by the calendar, search and booking screens.

// The prototype's "today", matching the rest of the mock data.
export const TODAY = new Date(2026, 9, 7)

const pad = (n) => String(n).padStart(2, '0')

// Dates travel in URLs as YYYY-MM-DD keys, e.g. /search?dates=2026-10-10,2026-10-11
export const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const fromKey = (key) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const parseDates = (param) => (param ? param.split(',').filter(Boolean).sort() : [])

// "Oct 10, 2026": the format bookings store their date in.
export const fmtBooking = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
// "Sat, Oct 10": compact label for chips.
export const fmtChip = (d) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

export const isPast = (d) => d < TODAY
