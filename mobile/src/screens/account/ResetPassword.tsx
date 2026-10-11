// /reset-password: native port of frontend/src/screens/ResetPassword.jsx. Reached
// from a "reset your password" email (the link opens the app here and signs you in
// for this one step; see authLink.ts) or from Settings while signed in.
import { useLocalSearchParams, useRouter } from 'expo-router'
import { CircleAlert, CircleCheck, KeyRound, Link2Off } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

import { MIN_PASSWORD } from '@shared/components/auth/authKit.js'
import { KeyboardView, Text, TopBar } from '@/components'
import { supabase } from '@/lib/supabase'
import { AuthButton, AuthMessage, Badge, PasswordField } from '@/screens/auth/AuthUI'
import { useAuth } from '@/state/auth'
import { useStore } from '@/state/store'
import { makeStyles, useTheme } from '@/theme'
import { useIncomingUrl } from './AuthCallback'
import { completeAuthFromUrl } from './authLink'

export default function ResetPassword() {
  const s = useStyles()
  const { c } = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<Record<string, string>>()
  const url = useIncomingUrl(params)
  const { user, loading } = useAuth()
  const { toast } = useStore()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [linkError, setLinkError] = useState('')
  const [waited, setWaited] = useState(false)

  // Opened from the email: sign in with the link's tokens first.
  useEffect(() => {
    let live = true
    completeAuthFromUrl(url).then((r) => live && r.error && setLinkError(r.error))
    return () => { live = false }
  }, [url])

  // A reset link needs a moment to sign you in; only then decide it was invalid.
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 4000)
    return () => clearTimeout(t)
  }, [])

  const save = async () => {
    if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`)
    if (password !== confirm) return setError('The passwords don’t match.')
    setBusy(true)
    setError('')
    const { error: err } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (err) return setError(err.message)
    toast('Password saved. You can now log in with it.')
    router.replace('/me')
  }

  if (!user) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <TopBar title="New password" />
        <View style={s.center}>
          {(loading || !waited) && !linkError ? (
            <>
              <ActivityIndicator size="large" color={c.ink} />
              <Text muted accessibilityLiveRegion="polite">Checking your link…</Text>
            </>
          ) : (
            <>
              <Badge icon={Link2Off} />
              <Text variant="h2" center>That reset link didn’t work</Text>
              <Text muted center>{linkError ? `${linkError.replace(/\.?$/, '.')} ` : ''}It may have expired or already been used. Request a new one from the log-in screen.</Text>
              <AuthButton title="Back to log in" onPress={() => router.replace('/sign-in')} style={s.btn} />
            </>
          )}
        </View>
      </SafeAreaView>
    )
  }

  const matches = confirm.length > 0 && confirm === password
  const mismatch = confirm.length >= password.length && confirm.length > 0 && confirm !== password
  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <TopBar title="New password" />
      <KeyboardView bottomInset={insets.bottom}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <Badge icon={KeyRound} />
          <Text variant="h1" style={s.title}>Choose a new password</Text>
          <Text muted>
            For <Text weight="700">{user.email}</Text>. You’ll use it to log in from now on.
          </Text>
          <View style={s.form}>
            <PasswordField
              label="New password"
              show={show}
              onToggleShow={() => setShow((v) => !v)}
              meter
              autoComplete="new-password"
              textContentType="newPassword"
              passwordRules={`minlength: ${MIN_PASSWORD};`}
              value={password}
              onChangeText={(v) => { setPassword(v); if (error) setError('') }}
              autoFocus
              returnKeyType="next"
            />
            <PasswordField
              label="Confirm password"
              show={show}
              toggle={false}
              autoComplete="new-password"
              textContentType="newPassword"
              value={confirm}
              onChangeText={(v) => { setConfirm(v); if (error) setError('') }}
              onSubmitEditing={save}
              returnKeyType="done"
              invalid={mismatch}
            />
            {(matches || mismatch) && (
              <View style={s.status} accessible accessibilityLiveRegion="polite">
                {matches ? <CircleCheck size={15} color={c.ok} /> : <CircleAlert size={15} color={c.danger} />}
                <Text variant="small" color={matches ? 'ok' : 'danger'}>{matches ? 'Passwords match' : 'The passwords don’t match yet'}</Text>
              </View>
            )}
            {!!error && <AuthMessage>{error}</AuthMessage>}
            <AuthButton title={busy ? 'Saving…' : 'Save password'} loading={busy} disabled={!password || !confirm} onPress={save} />
          </View>
        </ScrollView>
      </KeyboardView>
    </SafeAreaView>
  )
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.c.bg },
  center: { alignItems: 'center', gap: 12, paddingTop: 80, paddingHorizontal: t.space.xl },
  body: { paddingHorizontal: 24, paddingTop: t.space.xl, paddingBottom: t.space.xxl, gap: 8 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.8 },
  btn: { alignSelf: 'stretch', marginTop: t.space.sm },
  form: { gap: 14, marginTop: 18 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -6 },
}))
