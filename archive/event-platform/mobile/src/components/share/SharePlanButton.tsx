// "Share" for a plan saved as an event: sends it to chats as an event card.
import { Send } from 'lucide-react-native'
import { useState } from 'react'

import { Button } from '@/components'
import { ShareSheet } from './ShareSheet'

export function SharePlanButton({ eventId, title, subtitle }: { eventId?: string | null; title?: string; subtitle?: string }) {
  const [open, setOpen] = useState(false)
  if (!eventId) return null
  return (
    <>
      <Button title="Share" icon={Send} size="sm" variant="ghost" onPress={() => setOpen(true)} />
      {open && <ShareSheet item={{ kind: 'event', id: eventId, title, subtitle }} onClose={() => setOpen(false)} />}
    </>
  )
}

export default SharePlanButton
