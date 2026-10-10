// Report / block (the web's ModerationSheet in components/PostSheets.jsx).
// target: { type: 'profile'|'provider'|'album'|'photo'|'message'|'review', id }.
// blockProfileId: the person's profile id (shows "Block @username").
import { Ban, Flag } from 'lucide-react-native'

import { Sheet } from '@/components'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/state/auth'
import { useStore } from '@/state/store'
import { Group, ListRow } from '../account/ui'

export type ModerationTarget = { what: string; username?: string | null; target?: { type: string; id: string } | null; blockProfileId?: string | null }

export default function ModerationSheet({ open, onClose, what, username, target, blockProfileId }: { open: boolean; onClose: () => void } & Partial<ModerationTarget>) {
  const { toast } = useStore()
  const { user } = useAuth()
  const act = async (kind: 'report' | 'block') => {
    if (!user) {
      toast('Sign in to report or block')
      return onClose()
    }
    try {
      if (kind === 'report' && target?.id) {
        const { error } = await supabase.from('reports').insert({ target_type: target.type as any, target_id: target.id, reason: `Reported ${what} from the app` })
        if (error) throw error
      }
      if (kind === 'block' && blockProfileId) {
        const { error } = await supabase.from('blocks').upsert({ blocked_id: blockProfileId } as any, { ignoreDuplicates: true })
        if (error) throw error
      }
      toast(kind === 'report' ? `Reported ${what}. Our team will review it.` : `Blocked @${username}`)
    } catch (e) {
      console.warn(e)
      toast('Couldn’t send that. Try again.')
    }
    onClose()
  }
  return (
    <Sheet open={open} onClose={onClose} title="Report or block">
      <Group>
        {target?.id ? <ListRow icon={Flag} title={`Report ${what}`} danger chevron={false} onPress={() => act('report')} /> : null}
        {username && blockProfileId ? <ListRow icon={Ban} title={`Block @${username}`} danger chevron={false} onPress={() => act('block')} /> : null}
      </Group>
    </Sheet>
  )
}
