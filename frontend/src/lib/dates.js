// Date helpers shared by the calendar, search and booking screens.

// Today at midnight (local time).
export const today = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
// For screens that read it once at load.
export const TODAY = today()

const pad = (n) => String(n).padStart(2, '0')

// Dates travel in URLs (and to the database) as YYYY-MM-DD keys, e.g. /search?dates=2026-10-10,2026-10-11
export const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const fromKey = (key) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const parseDates = (param) => (param ? param.split(',').filter(Boolean).sort() : [])
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

// "Oct 10, 2026"
export const fmtBooking = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
// "Sat, Oct 10": compact label for chips.
export const fmtChip = (d) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
// "Sep 2026"
export const fmtMonth = (d) => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
// "2:00 PM" (in a given IANA time zone, e.g. the provider's)
export const fmtTime = (d, timeZone) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone })

// "now", "5m", "3h", "2d", or "Sep 21" for older.
export const ago = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const s = (Date.now() - d.getTime()) / 1000
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export const isPast = (d) => d < today()
