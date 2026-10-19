import { useState } from 'react'
import { Send } from 'lucide-react'
import ShareSheet from '../share/ShareSheet.jsx'

// "Share" for a plan saved as an event: sends it to chats as an event card.
export default function SharePlanButton({ eventId, title, subtitle }) {
  const [open, setOpen] = useState(false)
  if (!eventId) return null
  return (
    <>
      <button type="button" className="btn sm ghost share-btn" onClick={() => setOpen(true)}>
        <Send size={14} /> Share
      </button>
      {open && <ShareSheet item={{ kind: 'event', id: eventId, title, subtitle }} onClose={() => setOpen(false)} />}
    </>
  )
}
