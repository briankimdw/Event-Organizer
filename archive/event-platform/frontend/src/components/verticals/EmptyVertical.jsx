import { useState } from 'react'
import { Link } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import { ShareSheet } from '../PostSheets.jsx'
import { lowerFirst, nounFor, verticalMeta } from '../../verticals/index.js'
import { VerticalBadge } from './VerticalIcon.jsx'

// "No caterers near you yet": a friendly state for a vertical with no providers,
// with an invite link (share the sign-up page) and "List your business".
//   vertical: slug. title/text override the defaults. compact: smaller, for lists.
export default function EmptyVertical({ vertical, title, text, compact = false, listing = true }) {
  const [share, setShare] = useState(false)
  const m = verticalMeta(vertical)
  const plural = nounFor(vertical, 2)
  const link = `/new-listing?v=${encodeURIComponent(vertical)}`
  return (
    <div className={`state empty v-empty ${compact ? 'compact' : ''}`}>
      <VerticalBadge vertical={vertical} size={compact ? 36 : 48} />
      <div className="state-title">{title || `No ${plural} near you yet`}</div>
      <div className="muted small state-text">
        {text || `We’re just getting started with ${lowerFirst(m.name)}. Know a great ${m.noun}? Invite them, and they can set up a listing in minutes.`}
      </div>
      <div className="row gap-xs wrap center-row">
        <button className="btn sm" onClick={() => setShare(true)}><UserPlus size={14} /> Invite a {m.noun}</button>
        {listing && <Link to={link} className="btn ghost sm">I’m a {m.noun}</Link>}
      </div>
      <ShareSheet
        open={share}
        onClose={() => setShare(false)}
        link={link}
        payload={{ text: `You should list your ${lowerFirst(m.name)} business here so clients can book you: ${typeof window === 'undefined' ? '' : window.location.origin}${link}` }}
      />
    </div>
  )
}
