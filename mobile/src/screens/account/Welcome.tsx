// /welcome: native port of frontend/src/screens/Welcome.jsx. One-time step after a
// new account is created: pick a name and a username (live availability), and optionally
// say what brings you here ("I offer a service" goes on to /new-listing). The root layout
// sends accounts without a name here (needsWelcome), like the web App does.
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Camera, Check, CircleAlert, CircleCheck, Search, User, type LucideIcon } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, View, type TextInput } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

import { USERNAME_RE, initials, usernameTaken } from '@shared/components/auth/authKit.js'
import { KeyboardView, Text } from '@/components'
import { supabase } from '@/lib/supabase'
import { AuthButton, AuthField, AuthMessage } from '@/screens/auth/AuthUI'
import { safeNext, useAuth } from '@/state/auth'
import { makeStyles, useTheme } from '@/theme'

type Intent = '' | 'plan' | 'offer'
const CHOICES: { value: Exclude<Intent, ''>; icon: LucideIcon; title: string; sub: string }[] = [
  { value: 'plan', icon: Search, title: 'Booking a shoot', sub: 'Find and book photographers' },
  { value: 'offer', icon: Camera, title: 'I shoot photo or video', sub: 'List your work, get booked' },
]

export default function Welcome() {
  const s = useStyles()
  const { c } = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ next?: string }>()
  const next = safeNext(params.next)
  const { user, profile, refreshProfile, loading } = useAuth()
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [intent, setIntent] = useState<Intent>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [check, setCheck] = useState<{ name: string; taken: boolean | null } | null>(null)
  const usernameRef = useRef<TextInput>(null)

  useEffect(() => {
    if (!loading && !user) router.replace({ pathname: '/sign-in', params: { next } })
  }, [loading, user, next, router])

  useEffect(() => {
    if (profile) {
      setName((n) => n || profile.display_name || '')
      setUsername((u) => u || profile.username || '')
    }
  }, [profile])

  const cleanUsername = username.trim().toLowerCase()
  const usernameOk = USERNAME_RE.test(cleanUsername)
  const isOwn = !!profile?.username && cleanUsername === profile.username.toLowerCase()

  // Ask (debounced) whether someone else already has it. Their own current username is fine.
  useEffect(() => {
    if (!usernameOk || isOwn || !user) return
    let live = true
    const t = setTimeout(async () => {
      const taken = await usernameTaken(cleanUsername, user.id)
      if (live) setCheck({ name: cleanUsername, taken })
    }, 400)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [cleanUsername, usernameOk, isOwn, user])

  const checked = check?.name === cleanUsername ? check.taken : undefined // undefined = checking
  const taken = usernameOk && !isOwn && checked === true

  const save = async () => {
    if (!user || !name.trim() || !usernameOk || taken || busy) return
    setBusy(true)
    setError('')
    const { error: err } = await supabase.from('profiles').update({ display_name: name.trim(), username: cleanUsername }).eq('id', user.id)
    setBusy(false)
    if (err) {
      setError(err.code === '23505' ? 'That username is taken. Try another.' : err.message)
      return
    }
    await refreshProfile()
    router.replace((intent === 'offer' ? '/new-listing' : next) as any)
  }

  let status: { tone: 'ok' | 'bad' | 'wait'; text: string } | null = null
  if (username && !usernameOk) status = { tone: 'bad', text: '3–30 characters: lowercase letters, numbers, dots and underscores.' }
  else if (usernameOk && isOwn) status = { tone: 'ok', text: `@${cleanUsername} is yours` }
  else if (usernameOk && checked === undefined) status = { tone: 'wait', text: 'Checking…' }
  else if (taken) status = { tone: 'bad', text: `@${cleanUsername} is taken. Try another.` }
  else if (usernameOk && checked === false) status = { tone: 'ok', text: `@${cleanUsername} is available` }
  const tint = status?.tone === 'ok' ? c.ok : status?.tone === 'bad' ? c.danger : c.muted
  const statusEl = status && (
    <View style={s.status} accessibilityLiveRegion={status.tone === 'wait' ? 'none' : 'polite'} accessible>
      {status.tone === 'wait' ? <ActivityIndicator size="small" color={c.muted} /> : status.tone === 'ok' ? <CircleCheck size={15} color={tint} /> : <CircleAlert size={15} color={tint} />}
      <Text variant="small" style={{ color: tint, flexShrink: 1 }}>{status.text}</Text>
    </View>
  )
  const ini = initials(name)

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <KeyboardView bottomInset={insets.bottom}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <View style={[s.avatar, !ini && s.avatarEmpty]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            {ini ? <Text style={s.avatarText} maxFontSizeMultiplier={1.2}>{ini}</Text> : <User size={30} color={c.muted} />}
          </View>
          <Text variant="h1" style={s.title}>Make it yours</Text>
          <Text muted>Photographers see your name when you message or book them.</Text>

          <View style={s.form}>
            <AuthField
              label="Your name"
              autoComplete="name"
              textContentType="name"
              value={name}
              maxLength={80}
              onChangeText={setName}
              placeholder="Alex Rivera"
              autoFocus
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => usernameRef.current?.focus()}
            />
            <AuthField
              ref={usernameRef}
              label="Username"
              prefix="@"
              value={username}
              maxLength={30}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="username"
              textContentType="username"
              onChangeText={(v) => setUsername(v.toLowerCase())}
              placeholder="alex.rivera"
              onSubmitEditing={save}
              returnKeyType="done"
              invalid={(!!username && !usernameOk) || taken}
              below={statusEl}
            />

            <View accessibilityRole="radiogroup" accessibilityLabel="What brings you here? Optional">
              <Text variant="small" weight="600" style={s.legend} importantForAccessibility="no" accessibilityElementsHidden>
                What brings you here? <Text variant="small" muted>(optional)</Text>
              </Text>
              <View style={s.choices}>
                {CHOICES.map(({ value, icon: Icon, title, sub }) => {
                  const on = intent === value
                  return (
                    <Pressable
                      key={value}
                      onPress={() => setIntent(on ? '' : value)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                      aria-checked={on}
                      accessibilityLabel={`${title}. ${sub}`}
                      style={({ pressed }) => [s.choice, on && s.choiceOn, pressed && { opacity: 0.85 }]}
                    >
                      <Icon size={22} color={c.ink} />
                      <Text variant="body" weight="700">{title}</Text>
                      <Text variant="small" muted>{sub}</Text>
                      <View style={[s.check, on && s.checkOn]}>{on && <Check size={12} strokeWidth={3} color={c.bg} />}</View>
                    </Pressable>
                  )
                })}
              </View>
            </View>

            {!!error && <AuthMessage>{error}</AuthMessage>}
            <AuthButton
              title={busy ? 'Saving…' : intent === 'offer' ? 'Continue to your listing' : 'Continue'}
              loading={busy}
              disabled={!name.trim() || !usernameOk || taken}
              onPress={save}
            />
          </View>
        </ScrollView>
      </KeyboardView>
    </SafeAreaView>
  )
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.c.bg },
  body: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: t.space.xxl, gap: 8 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: t.c.ink, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  avatarEmpty: { backgroundColor: t.c.soft },
  avatarText: { color: t.c.onInk, fontSize: 26, fontWeight: '700' },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.8 },
  form: { gap: 18, marginTop: 18 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 20 },
  legend: { marginBottom: 8 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  choice: {
    flexGrow: 1, flexBasis: 140, gap: 4, padding: 14, borderRadius: 16, borderWidth: 1,
    borderColor: t.scheme === 'dark' ? '#3f3f46' : '#dedede', backgroundColor: t.c.card, minHeight: 104,
  },
  choiceOn: { borderColor: t.c.ink, borderWidth: 2, backgroundColor: t.c.soft, padding: 13 },
  check: {
    position: 'absolute', top: 10, right: 10, width: 20, height: 20, borderRadius: 10, borderWidth: 1.5,
    borderColor: t.scheme === 'dark' ? '#71717a' : '#8f8f8f', alignItems: 'center', justifyContent: 'center',
  },
  checkOn: { backgroundColor: t.c.ink, borderColor: t.c.ink },
}))
