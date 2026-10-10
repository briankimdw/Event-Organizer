// How many conversations have unread messages, live (the web TabBar's inbox badge).
// Rechecks when the app returns to the foreground and when a message arrives anywhere.
import { useEffect } from 'react'
import { AppState } from 'react-native'

import { subscribeToInbox, unreadCount } from '@shared/api/messages.js'
import useQuery from '@/hooks/useQuery'
import { useAuth } from '@/state/auth'

export default function useUnreadCount(): number {
  const { user } = useAuth()
  const { data, reload } = useQuery<number>(user ? unreadCount : null, [user?.id])
  useEffect(() => (user ? subscribeToInbox(reload) : undefined), [user?.id, reload]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && reload())
    return () => sub.remove()
  }, [reload])
  return data ?? 0
}
