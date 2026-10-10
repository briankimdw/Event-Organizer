// Entry to the AI event planner (the web's components/planner/PlanCard.jsx):
// tap the card to open /plan, or type a first message and send it as ?q=.
import { useRouter } from 'expo-router'
import { ArrowUp, Sparkles } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, TextInput, View } from 'react-native'

import { Text } from '@/components'
import { makeStyles, useTheme } from '@/theme'

export function PlannerEntry() {
  const s = useStyles()
  const { c } = useTheme()
  const router = useRouter()
  const [text, setText] = useState('')
  const submit = () => {
    const q = text.trim()
    router.push(q ? { pathname: '/plan', params: { q } } : '/plan')
  }
  return (
    <View style={s.card}>
      <Pressable onPress={() => router.push('/plan')} style={s.head} accessibilityRole="button" accessibilityLabel="Plan an event with AI">
        <View style={s.mark}>
          <Sparkles size={18} color={c.onAccent} />
        </View>
        <View style={s.grow}>
          <Text variant="body" weight="700">Plan an event with AI</Text>
          <Text variant="small" muted>Say when, where and your budget. Get a draft plan and vendors who fit.</Text>
        </View>
      </Pressable>
      <View style={s.inputRow}>
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={submit}
          returnKeyType="send"
          placeholder="A wedding in Napa next June, $15k…"
          placeholderTextColor={c.faint}
          style={s.input}
          accessibilityLabel="Describe your event"
        />
        <Pressable onPress={submit} style={s.send} accessibilityRole="button" accessibilityLabel="Plan it">
          <ArrowUp size={16} color={c.onInk} strokeWidth={2.5} />
        </Pressable>
      </View>
    </View>
  )
}

const useStyles = makeStyles((t) => ({
  card: { marginTop: 12, padding: 14, borderRadius: t.radius.xl, backgroundColor: t.c.accentSoft, gap: 12 },
  head: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  mark: { width: 36, height: 36, borderRadius: 18, backgroundColor: t.c.accent, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1, gap: 2 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.c.bg, borderRadius: t.radius.md, paddingLeft: 12, paddingRight: 6, paddingVertical: 5 },
  input: { flex: 1, fontSize: 14, color: t.c.ink, paddingVertical: 6 },
  send: { width: 30, height: 30, borderRadius: 15, backgroundColor: t.c.ink, alignItems: 'center', justifyContent: 'center' },
}))
