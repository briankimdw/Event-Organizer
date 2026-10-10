// Conversation details sheet (the web's ChatInfo in screens/Chat.jsx): who's in it;
// for groups, add people / rename / leave; for one-to-one, report or block.
import { useRouter } from 'expo-router'
import { Flag, LogOut, Pencil, UserPlus } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import { View } from 'react-native'

import { addGroupMembers, leaveGroup, messageError, renameGroup } from '@shared/api/messages.js'
import { Avatar, Button, Sheet, Text, TextField } from '@/components'
import { useStore } from '@/state/store'
import { makeStyles } from '@/theme'
import { Group, ListRow, SectionLabel } from '../account/ui'
import PeoplePicker, { type Person } from './PeoplePicker'

type Member = Person & { lastReadAt?: string | null }
export type ChatConversation = {
  id: string
  title: string
  customTitle: string | null
  isGroup: boolean
  members: Member[]
}

type Props = {
  open: boolean
  onClose: () => void
  conversation: ChatConversation
  onChanged: () => void
  onLeft: () => void
  onReport: () => void
}

export default function ChatInfo({ open, onClose, conversation: c, onChanged, onLeft, onReport }: Props) {
  const s = useStyles()
  const router = useRouter()
  const { toast } = useStore()
  const [mode, setMode] = useState<null | 'add' | 'rename' | 'leave'>(null)
  const [picked, setPicked] = useState<Person[]>([])
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) {
      setMode(null)
      setPicked([])
    }
  }, [open])

  const run = async (fn: () => Promise<unknown>, done?: () => void) => {
    setBusy(true)
    try {
      await fn()
      done?.()
    } catch (e) {
      console.warn(e)
      toast(messageError(e))
    } finally {
      setBusy(false)
    }
  }

  const sheetTitle = mode === 'add' ? 'Add people' : mode === 'rename' ? 'Rename group' : mode === 'leave' ? 'Leave group?' : c.isGroup ? 'Group' : 'Details'
  return (
    <Sheet open={open} onClose={onClose} title={sheetTitle}>
      {mode === 'add' ? (
        <>
          <PeoplePicker selected={picked} onChange={setPicked} exclude={c.members.map((m) => m.profileId)} />
          <Button
            title={busy ? 'Adding…' : `Add${picked.length ? ` ${picked.length}` : ''}`}
            block
            disabled={!picked.length || busy}
            style={s.mt}
            onPress={() =>
              run(() => addGroupMembers(c.id, picked.map((p) => p.profileId)), () => {
                toast(`Added ${picked.length === 1 ? picked[0].name : `${picked.length} people`}`)
                onChanged()
                setMode(null)
                setPicked([])
              })
            }
          />
        </>
      ) : mode === 'rename' ? (
        <>
          <TextField autoFocus maxLength={80} placeholder="Group name" value={title} onChangeText={setTitle} returnKeyType="done"
            onSubmitEditing={() => run(() => renameGroup(c.id, title), () => { onChanged(); setMode(null) })} />
          <Button title={busy ? 'Saving…' : 'Save'} block disabled={busy} style={s.mt}
            onPress={() => run(() => renameGroup(c.id, title), () => { onChanged(); setMode(null) })} />
        </>
      ) : mode === 'leave' ? (
        <>
          <Text variant="small" muted>You’ll stop getting messages from “{c.title}”. Someone in the group can add you back.</Text>
          <View style={s.actions}>
            <Button title="Cancel" variant="ghost" grow onPress={() => setMode(null)} />
            <Button title="Leave" variant="danger" grow disabled={busy} onPress={() => run(() => leaveGroup(c.id), onLeft)} />
          </View>
        </>
      ) : (
        <>
          <SectionLabel style={s.firstLabel}>{c.isGroup ? `${c.members.length + 1} people` : 'With'}</SectionLabel>
          <Group>
            {c.members.map((m) => (
              <ListRow
                key={m.profileId}
                left={<Avatar uri={m.avatar} name={m.name} />}
                title={m.name}
                sub={m.username ? `@${m.username}${m.isPhotographer ? ' · Vendor' : ''}` : null}
                onPress={() => {
                  onClose()
                  router.push({ pathname: '/u/[id]', params: { id: m.id } })
                }}
              />
            ))}
            {c.isGroup ? <ListRow title="+ You" /> : null}
          </Group>
          <Group style={s.mt}>
            {c.isGroup ? <ListRow icon={UserPlus} title="Add people" onPress={() => setMode('add')} /> : null}
            {c.isGroup ? <ListRow icon={Pencil} title="Rename group" onPress={() => { setTitle(c.customTitle || ''); setMode('rename') }} /> : null}
            {c.isGroup ? <ListRow icon={LogOut} title="Leave group" danger chevron={false} onPress={() => setMode('leave')} /> : null}
            {!c.isGroup ? <ListRow icon={Flag} title="Report or block" danger chevron={false} onPress={onReport} /> : null}
          </Group>
        </>
      )}
    </Sheet>
  )
}

const useStyles = makeStyles((t) => ({
  mt: { marginTop: t.space.md },
  firstLabel: { paddingTop: 0 },
  actions: { flexDirection: 'row', gap: 8, marginTop: t.space.md },
}))
