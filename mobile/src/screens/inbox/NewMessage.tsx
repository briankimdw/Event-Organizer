// /inbox/new: native port of frontend/src/screens/NewMessage.jsx. Pick one person
// for a direct message, or several for a group.
import { useRouter } from 'expo-router'
import { Users } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'

import { createGroup, messageError, startDirectMessage } from '@shared/api/messages.js'
import { Button, Loading, Screen, SignInPrompt, TextField } from '@/components'
import { useAuth } from '@/state/auth'
import { useStore } from '@/state/store'
import { makeStyles, useTheme } from '@/theme'
import PeoplePicker, { type Person } from './PeoplePicker'

export default function NewMessage() {
  const s = useStyles()
  const { c } = useTheme()
  const router = useRouter()
  const { user, loading } = useAuth()
  const { toast } = useStore()
  const [selected, setSelected] = useState<Person[]>([])
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const isGroup = selected.length > 1

  const start = async () => {
    if (!selected.length || busy) return
    setBusy(true)
    try {
      const id = isGroup ? await createGroup(title.trim(), selected.map((p) => p.profileId)) : await startDirectMessage(selected[0].profileId)
      router.replace({ pathname: '/inbox/[id]', params: { id: String(id) } })
    } catch (e) {
      console.warn(e)
      toast(messageError(e))
      setBusy(false)
    }
  }

  if (loading) return <Screen title="New message" back><Loading /></Screen>
  if (!user) return <Screen title="New message" back><SignInPrompt title="Sign in to send messages" /></Screen>

  return (
    <Screen
      title="New message"
      back
      padded
      right={<Button title={busy ? 'Opening…' : isGroup ? 'Create' : 'Chat'} size="sm" disabled={!selected.length || busy} onPress={start} />}
    >
      {isGroup && (
        <View style={s.group}>
          <View style={s.groupIcon}><Users size={18} color={c.ink} /></View>
          <TextField
            placeholder="Group name (optional)"
            maxLength={80}
            value={title}
            onChangeText={setTitle}
            containerStyle={s.grow}
          />
        </View>
      )}
      <PeoplePicker selected={selected} onChange={setSelected} />
    </Screen>
  )
}

const useStyles = makeStyles((t) => ({
  group: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: t.space.md },
  groupIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: t.c.soft, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1 },
}))
