// /sign-in: native port of frontend/src/screens/SignIn.jsx. A short stepper:
// start (Google / email) -> email -> password (log in or create, live strength) -> done,
// with side trips: code (email link + 6-digit code), confirm (new account), forgot -> forgot-sent.
// ?next=/u/abc returns there after signing in; ?mode=signup preselects "Sign up".
//
// Email links: the app passes Linking.createURL('/auth/callback') as the redirect.
// For the link (not the code) to open the app, that URL must be in Supabase Auth >
// URL Configuration > Redirect URLs, and /auth/callback must exchange the token
// (TODO: port AuthCallback). Entering the code from the email works without any of that.
// Google: Supabase's OAuth page in an in-app browser session (works in Expo Go); the
// redirect back to Linking.createURL('/auth/callback') must be an allowed Redirect URL
// (exp://** for Expo Go, eventorganizer://** for builds). Native Google account picker
// (signInWithIdToken) would need a development build.
import { LinearGradient } from 'expo-linear-gradient'
import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ArrowLeft, KeyRound, Mail, MailCheck, X } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native'
import Animated, { FadeIn, FadeInRight } from 'react-native-reanimated'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

import { listProviders } from '@shared/api/catalog.js'
import { CODE_LENGTH, MIN_PASSWORD, coverMix } from '@shared/components/auth/authKit.js'
import { KeyboardView, Photo, Segmented, Text } from '@/components'
import useQuery from '@/hooks/useQuery'
import { focusOn } from '@/lib/a11y'
import { BRAND, isPhotoListing } from '@/lib/photo'
import { supabase } from '@/lib/supabase'
import { completeAuthFromUrl } from '@/screens/account/authLink'
import { AuthButton, AuthField, AuthMessage, Badge, CodeInput, GoogleLogo, Legal, PasswordField, TextLink } from '@/screens/auth/AuthUI'
import { safeNext, useAuth } from '@/state/auth'
import { makeStyles, useTheme } from '@/theme'
import type { Provider } from '@/types'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RESEND_SECONDS = 30

// Turn Supabase auth errors into something a person can act on (same as the web).
const friendly = (error: { message?: string; status?: number } | null) => {
  const msg = (error?.message || '').toLowerCase()
  if (error?.status === 429 || msg.includes('rate limit') || msg.includes('only request this after')) return 'Too many attempts. Wait a minute, then try again.'
  if (msg.includes('invalid login credentials')) return 'Wrong email or password.'
  if (msg.includes('email not confirmed')) return 'Confirm your email first: check your inbox for the link we sent.'
  if (msg.includes('not authorized') || msg.includes('not allowed')) {
    return 'Sign-in emails can only go to approved addresses until email sending is set up. Ask the team to add you.'
  }
  if (msg.includes('password should be') || msg.includes('weak password')) return `Choose a stronger password (at least ${MIN_PASSWORD} characters).`
  if (msg.includes('expired') || msg.includes('invalid') || msg.includes('token')) return 'That code didn’t work. Check it, or send a new one.'
  return error?.message || 'Something went wrong. Please try again.'
}

// Closes the auth popup on the web target (no-op on phones).
WebBrowser.maybeCompleteAuthSession()

// Dev-only sign-in trace in the Expo server's terminal (never passwords or tokens).
const authLog = (...args: unknown[]) => {
  if (__DEV__) console.log('[auth]', ...args)
}
// A redirect URL with its tokens / codes cut out.
const redact = (url: string) => url.replace(/([?#&](access_token|refresh_token|code|provider_token|token_hash)=)[^&]+/g, '$1…')

// A short slide-in per step. Not on the web target: there the entering animation starts the
// step hidden, so its field can't take autofocus.
const STEP_IN = Platform.OS === 'web' ? undefined : FadeInRight.duration(240)

type Step = 'start' | 'email' | 'password' | 'code' | 'confirm' | 'forgot' | 'forgot-sent'

export default function SignIn() {
  const s = useStyles()
  const { c } = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const params = useLocalSearchParams<{ next?: string; mode?: string }>()
  const next = safeNext(params.next)
  const { user, profile, needsWelcome } = useAuth()
  const { data: providers } = useQuery<Provider[]>(() => listProviders().then((list: Provider[]) => list.filter(isPhotoListing)), [])
  const collage = coverMix(providers, 6)

  const [mode, setMode] = useState<'login' | 'signup'>(params.mode === 'signup' ? 'signup' : 'login')
  // The way back: each step pushes; the back arrow pops.
  const [trail, setTrail] = useState<Step[]>(['start'])
  const step = trail[trail.length - 1]
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [resendIn, setResendIn] = useState(0)
  const headingRef = useRef<View>(null)

  // Signed in (or just finished): move on.
  useEffect(() => {
    if (user && profile) router.replace((needsWelcome ? { pathname: '/welcome', params: { next } } : next) as any)
  }, [user, profile, needsWelcome, next, router])

  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  // Steps without a field: the screen reader starts at the heading (the others autofocus their field).
  useEffect(() => {
    if (step === 'confirm' || step === 'forgot-sent') focusOn(headingRef, 300)
  }, [step])

  const callbackUrl = () => Linking.createURL('/auth/callback', { queryParams: { next } })
  const cleanEmail = email.trim().toLowerCase()

  const go = (nextStep: Step) => {
    setTrail((t) => (nextStep === 'start' ? ['start'] : [...t, nextStep]))
    setError('')
    setNotice('')
  }
  const jump = (newTrail: Step[]) => {
    setTrail(newTrail)
    setError('')
    setNotice('')
  }
  const back = () => jump(trail.length > 1 ? trail.slice(0, -1) : ['start'])
  const switchMode = (m: 'login' | 'signup') => {
    setMode(m)
    setError('')
    setNotice('')
  }
  const checkEmail = () => {
    if (!EMAIL_RE.test(cleanEmail)) {
      setError('Enter a valid email address.')
      return false
    }
    return true
  }
  const run = async (fn: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await fn()
    } catch (e: any) {
      // Network failures and browser errors throw instead of returning { error }.
      authLog('sign-in step threw', e?.name, e?.message)
      setError(friendly(e))
    } finally {
      setBusy(false)
    }
  }

  // Google through Supabase: open its sign-in page, wait for the redirect back to the
  // app, then finish the session from that URL (same handler as email links).
  const google = () =>
    run(async () => {
      const redirectTo = Linking.createURL('/auth/callback')
      authLog('google: redirectTo', redirectTo)
      const { data, error: err } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } })
      if (err || !data?.url) {
        authLog('google: could not start', err?.status, err?.message)
        return setError(friendly(err))
      }
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)
      authLog('google: browser closed', result.type, result.type === 'success' ? redact(result.url) : '')
      if (result.type !== 'success') {
        // Android can hand the redirect to the /auth/callback route instead of this
        // promise; give it a moment, then see whether that signed us in.
        await new Promise((r) => setTimeout(r, 800))
        const { data: now } = await supabase.auth.getSession()
        if (now.session) return
        if (result.type === 'dismiss' || result.type === 'cancel') {
          setError(`Google didn’t send you back to the app. If you ended up on a website, add ${redirectTo.split('/--/')[0]}/** to Supabase → Authentication → URL Configuration → Redirect URLs.`)
        }
        return
      }
      const done = await completeAuthFromUrl(result.url)
      authLog('google: finished', done.handled, done.error || 'ok')
      if (done.error) setError(done.error)
      else if (!done.handled) setError('Google sign-in didn’t finish. Make sure this app’s link is an allowed redirect URL in Supabase.')
    })

  // Email step: check the address, then ask for the password.
  const submitEmail = () => {
    if (!checkEmail()) return
    go('password')
  }

  const logIn = () => {
    if (!checkEmail()) return
    run(async () => {
      const { error: err } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })
      authLog('password sign-in', err ? `failed: ${err.status} ${err.name} ${err.message}` : 'ok')
      if (err) setError(friendly(err))
      // On success the auth listener picks up the session and the effect above navigates.
    })
  }

  const signUp = () => {
    if (!checkEmail()) return
    if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters for your password.`)
    run(async () => {
      const { data, error: err } = await supabase.auth.signUp({ email: cleanEmail, password, options: { emailRedirectTo: callbackUrl() } })
      if (err) return setError(friendly(err))
      // An existing address comes back with no identities.
      if (data.user && data.user.identities?.length === 0) {
        setMode('login')
        setNotice('You already have an account with this email. Log in instead.')
        return
      }
      if (!data.session) {
        go('confirm')
        setResendIn(RESEND_SECONDS)
      }
    })
  }

  const resendConfirmation = () =>
    run(async () => {
      const { error: err } = await supabase.auth.resend({ type: 'signup', email: cleanEmail, options: { emailRedirectTo: callbackUrl() } })
      if (err) setError(friendly(err))
      else {
        setNotice('Sent again. Check your inbox (and spam).')
        setResendIn(RESEND_SECONDS)
      }
    })

  const sendLink = () => {
    if (!checkEmail()) return
    run(async () => {
      const { error: err } = await supabase.auth.signInWithOtp({ email: cleanEmail, options: { emailRedirectTo: callbackUrl(), shouldCreateUser: true } })
      authLog('email code sent', err ? `failed: ${err.status} ${err.message}` : 'ok')
      if (err) return setError(friendly(err))
      setCode('')
      if (step !== 'code') go('code')
      else setNotice('New code sent. Check your inbox (and spam).')
      setResendIn(RESEND_SECONDS)
    })
  }

  // `token` lets the code boxes submit the moment the last digit lands.
  const verifyCode = (token: string = code) => {
    if (busy || token.length < CODE_LENGTH) return
    run(async () => {
      const { error: err } = await supabase.auth.verifyOtp({ email: cleanEmail, token: token.trim(), type: 'email' })
      authLog('email code check', err ? `failed: ${err.status} ${err.message}` : 'ok')
      if (err) {
        setError(friendly(err))
        setCode('')
      }
    })
  }

  const sendReset = () => {
    if (!checkEmail()) return
    run(async () => {
      const { error: err } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo: Linking.createURL('/reset-password') })
      if (err) setError(friendly(err))
      else go('forgot-sent')
    })
  }

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'))

  const messages = (
    <>
      {!!notice && <AuthMessage tone="notice">{notice}</AuthMessage>}
      {!!error && <AuthMessage>{error}</AuthMessage>}
    </>
  )
  const heading = (text: string) => (
    <Text ref={headingRef as any} variant="h1" style={s.title}>{text}</Text>
  )
  const emailChip = (
    <View style={s.chip}>
      <Mail size={16} color={c.muted} />
      <Text variant="small" weight="600" numberOfLines={1} style={s.chipText}>{cleanEmail}</Text>
      <TextLink title="Change" accessibilityLabel="Change email" onPress={() => jump(['start', 'email'])} />
    </View>
  )

  // ---------------------------------------------------------------- start
  if (step === 'start') {
    const heroH = Math.max(220, Math.min(340, height * 0.4))
    const tileH = heroH * 0.56
    return (
      <SafeAreaView style={s.root} edges={['bottom']}>
        <ScrollView contentContainerStyle={s.startScroll} bounces={false}>
          <View style={[s.hero, { height: heroH + insets.top }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <View style={s.collage}>
              {[0, 1, 2].map((col) => (
                <View key={col} style={[s.collageCol, { marginTop: col === 1 ? -tileH * 0.35 : col === 2 ? tileH * 0.12 : 0 }]}>
                  {[0, 3].map((row) => (
                    <Animated.View key={row} entering={FadeIn.duration(500).delay((col + row) * 60)}>
                      <Photo uri={collage[col + row]} style={[s.tile, { height: tileH }]} />
                    </Animated.View>
                  ))}
                </View>
              ))}
            </View>
            <LinearGradient colors={[`${c.bg}00`, `${c.bg}d9`, c.bg]} locations={[0.4, 0.8, 1]} style={s.fade} />
          </View>
          <Pressable onPress={close} style={[s.close, { top: insets.top + 10 }]} accessibilityRole="button" accessibilityLabel="Close" hitSlop={4}>
            <X size={20} color={c.ink} />
          </Pressable>

          <View style={s.startBody}>
            <Text variant="display">{BRAND}<Text variant="display" color="accent" accessibilityRole="none">.</Text></Text>
            <Text variant="h1" style={s.headline}>Book photographers & videographers you’ll love.</Text>
            <Text muted style={s.sub}>Weddings, portraits, headshots, films and reels. Swipe real work, then book.</Text>

            <View style={s.actions}>
              <AuthButton title="Continue with Google" variant="outline" left={<GoogleLogo />} onPress={google} loading={busy} />
              <AuthButton title="Continue with email" icon={Mail} onPress={() => go('email')} disabled={busy} />
            </View>
            {messages}
            <View style={s.switchRow}>
              <Text variant="small" muted>New here?</Text>
              <TextLink title="Create an account" onPress={() => { switchMode('signup'); go('email') }} />
            </View>
            <Legal />
          </View>
        </ScrollView>
      </SafeAreaView>
    )
  }

  // ---------------------------------------------------------------- focused steps
  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.bar}>
        <Pressable onPress={back} style={s.barBtn} accessibilityRole="button" accessibilityLabel="Back">
          <ArrowLeft size={22} color={c.ink} />
        </Pressable>
        <Text variant="h3" weight="800" importantForAccessibility="no" accessibilityElementsHidden accessibilityRole="none">
          {BRAND}<Text variant="h3" weight="800" color="accent">.</Text>
        </Text>
        <Pressable onPress={close} style={s.barBtn} accessibilityRole="button" accessibilityLabel="Close">
          <X size={22} color={c.ink} />
        </Pressable>
      </View>
      {/* KeyboardView: KeyboardAvoidingView with behavior={undefined} does nothing on Android edge-to-edge. */}
      <KeyboardView style={s.flex}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Animated.View key={step} entering={STEP_IN} style={s.body}>
            {step === 'email' && (
              <>
                <Segmented
                  options={[{ value: 'login', label: 'Log in' }, { value: 'signup', label: 'Sign up' }]}
                  value={mode}
                  label="Log in or sign up"
                  onChange={switchMode}
                />
                <View style={s.gapLg} />
                {heading(mode === 'login' ? 'Welcome back' : 'Create your account')}
                <Text muted>{mode === 'login' ? 'Log in with the email you signed up with.' : 'Free, and it takes less than a minute.'}</Text>
                <View style={s.form}>
                  <AuthField
                    label="Email"
                    value={email}
                    onChangeText={(v) => { setEmail(v); if (error) setError('') }}
                    placeholder="you@example.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    autoComplete="email"
                    textContentType="emailAddress"
                    returnKeyType="next"
                    onSubmitEditing={submitEmail}
                    submitBehavior="submit"
                    invalid={!!error}
                    autoFocus
                  />
                  {messages}
                  <AuthButton title="Continue" disabled={!email.trim()} onPress={submitEmail} />
                </View>
              </>
            )}

            {step === 'password' && (
              <>
                {heading(mode === 'login' ? 'Enter your password' : 'Create a password')}
                {emailChip}
                <View style={s.form}>
                  <PasswordField
                    label={mode === 'login' ? 'Password' : 'New password'}
                    labelRight={mode === 'login' ? <TextLink title="Forgot password?" onPress={() => go('forgot')} /> : undefined}
                    value={password}
                    onChangeText={(v) => { setPassword(v); if (error) setError('') }}
                    show={showPassword}
                    onToggleShow={() => setShowPassword((v) => !v)}
                    meter={mode === 'signup'}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    textContentType={mode === 'login' ? 'password' : 'newPassword'}
                    passwordRules={mode === 'signup' ? `minlength: ${MIN_PASSWORD};` : undefined}
                    returnKeyType="go"
                    onSubmitEditing={mode === 'login' ? logIn : signUp}
                    submitBehavior="submit"
                    invalid={!!error}
                    autoFocus
                  />
                  {messages}
                  {mode === 'login' && error === 'Wrong email or password.' && (
                    <View style={s.switchRowLeft}>
                      <Text variant="small" muted>New here?</Text>
                      <TextLink title="Create an account instead" onPress={() => switchMode('signup')} />
                    </View>
                  )}
                  <AuthButton
                    title={busy ? (mode === 'login' ? 'Logging in…' : 'Creating account…') : mode === 'login' ? 'Log in' : 'Create account'}
                    loading={busy}
                    disabled={!password}
                    onPress={mode === 'login' ? logIn : signUp}
                  />
                </View>
                <View style={s.divider}>
                  <View style={s.rule} />
                  <Text variant="small" muted>or</Text>
                  <View style={s.rule} />
                </View>
                <AuthButton title="Email me a code instead" variant="ghost" icon={KeyRound} disabled={busy} onPress={sendLink} />
              </>
            )}

            {step === 'code' && (
              <>
                <Badge icon={MailCheck} />
                {heading('Check your email')}
                <Text muted>
                  We sent a {CODE_LENGTH}-digit code to <Text weight="700">{cleanEmail}</Text>. Enter it below.
                </Text>
                <View style={s.form}>
                  <CodeInput
                    label={`${CODE_LENGTH}-digit code`}
                    value={code}
                    onChange={(v) => { setCode(v); if (error) setError('') }}
                    onComplete={verifyCode}
                    invalid={!!error}
                    autoFocus
                  />
                  {messages}
                  <AuthButton title={busy ? 'Checking…' : 'Verify and continue'} loading={busy} disabled={!busy && code.length < CODE_LENGTH} onPress={() => verifyCode()} />
                </View>
                <View style={s.switchRow}>
                  <Text variant="small" muted>Didn’t get it?</Text>
                  {resendIn > 0 ? (
                    <Text variant="small" weight="700">Resend in {resendIn}s</Text>
                  ) : (
                    <TextLink title="Resend code" disabled={busy} onPress={sendLink} />
                  )}
                </View>
                <View style={s.center}>
                  <TextLink title="Use a different email" onPress={() => jump(['start', 'email'])} />
                </View>
              </>
            )}

            {step === 'confirm' && (
              <>
                <Badge icon={MailCheck} />
                {heading('Confirm your email')}
                <Text muted>
                  We sent a confirmation link to <Text weight="700">{cleanEmail}</Text>. Open it to finish creating your account, then log in with your email and password.
                </Text>
                <View style={s.form}>
                  {messages}
                  <AuthButton title="I’ve confirmed, log me in" onPress={() => { setMode('login'); jump(['start', 'email', 'password']) }} />
                </View>
                <View style={s.switchRow}>
                  <Text variant="small" muted>Didn’t get it?</Text>
                  {resendIn > 0 ? (
                    <Text variant="small" weight="700">Resend in {resendIn}s</Text>
                  ) : (
                    <TextLink title="Resend confirmation email" disabled={busy} onPress={resendConfirmation} />
                  )}
                </View>
              </>
            )}

            {step === 'forgot' && (
              <>
                {heading('Reset your password')}
                <Text muted>Enter your account email and we’ll send a link to choose a new password.</Text>
                <View style={s.form}>
                  <AuthField
                    label="Email"
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    textContentType="emailAddress"
                    returnKeyType="send"
                    onSubmitEditing={sendReset}
                    invalid={!!error}
                    autoFocus
                  />
                  {messages}
                  <AuthButton title={busy ? 'Sending…' : 'Send reset link'} loading={busy} disabled={!email.trim()} onPress={sendReset} />
                </View>
              </>
            )}

            {step === 'forgot-sent' && (
              <>
                <Badge icon={MailCheck} tone="ok" />
                {heading('Check your email')}
                <Text muted>
                  If <Text weight="700">{cleanEmail}</Text> has an account, a password reset link is on its way. It works once and expires after an hour.
                </Text>
                <View style={s.form}>
                  <AuthButton title="Back to log in" onPress={() => { setMode('login'); jump(['start', 'email', 'password']) }} />
                </View>
              </>
            )}
          </Animated.View>
          <View style={s.flex} />
          <Legal />
        </ScrollView>
      </KeyboardView>
    </SafeAreaView>
  )
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.c.bg },
  flex: { flex: 1 },
  // start
  startScroll: { flexGrow: 1, paddingBottom: t.space.lg },
  hero: { overflow: 'hidden' },
  collage: {
    position: 'absolute', top: -30, left: -50, right: -50, flexDirection: 'row', gap: 10,
    transform: [{ rotate: '-7deg' }],
  },
  collageCol: { flex: 1, gap: 10 },
  tile: { width: '100%', borderRadius: 18 },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 },
  close: {
    position: 'absolute', right: 12, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: t.c.bg, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  startBody: { flexGrow: 1, paddingHorizontal: 24, marginTop: -28 },
  headline: { fontSize: 30, lineHeight: 35, fontWeight: '800', letterSpacing: -0.9, marginTop: 12 },
  sub: { fontSize: 15, lineHeight: 22, marginTop: 8 },
  actions: { gap: 12, marginTop: 28, marginBottom: 4 },
  switchRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', columnGap: 6, rowGap: 2, marginTop: 20 },
  switchRowLeft: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 6 },
  center: { alignItems: 'center', marginTop: 14 },
  // focused steps
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, minHeight: 56 },
  barBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: t.space.xl },
  body: { gap: 8, paddingTop: 4 },
  gapLg: { height: 14 },
  // Focused (for screen readers) on steps without a field; no browser outline on the web target.
  title: { fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.8, ...((Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as object) },
  form: { gap: 14, marginTop: 18 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start', maxWidth: '100%', marginTop: 6,
    paddingLeft: 14, paddingRight: 12, minHeight: 44, borderRadius: 999, backgroundColor: t.c.soft,
  },
  chipText: { flexShrink: 1 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  rule: { flex: 1, height: 1, backgroundColor: t.c.line },
}))
