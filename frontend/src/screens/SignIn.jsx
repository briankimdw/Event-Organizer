import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, KeyRound, Mail, MailCheck, X } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { safeNext, useAuth } from '../auth.jsx'
import Segmented from '../components/Segmented.jsx'
import useQuery from '../lib/useQuery.js'
import { listProviders } from '../api/catalog.js'
import { CODE_LENGTH, MIN_PASSWORD, coverMix } from '../components/auth/authKit.js'
import PasswordField from '../components/auth/PasswordField.jsx'
import CodeInput from '../components/auth/CodeInput.jsx'
import '../components/auth/auth.css'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RESEND_SECONDS = 30

// Turn Supabase auth errors into something a person can act on.
const friendly = (error) => {
  const msg = (error?.message || '').toLowerCase()
  if (error?.status === 429 || msg.includes('rate limit') || msg.includes('only request this after')) {
    return 'Too many attempts. Wait a minute, then try again.'
  }
  if (msg.includes('invalid login credentials')) return 'Wrong email or password.'
  if (msg.includes('email not confirmed')) return 'Confirm your email first: check your inbox for the link we sent.'
  if (msg.includes('not authorized') || msg.includes('not allowed')) {
    return 'Sign-in emails can only go to approved addresses until email sending is set up. Ask the team to add you.'
  }
  if (msg.includes('password should be') || msg.includes('weak password')) {
    return `Choose a stronger password (at least ${MIN_PASSWORD} characters).`
  }
  if (msg.includes('expired') || msg.includes('invalid') || msg.includes('token')) {
    return 'That code didn’t work. Check it, or send a new one.'
  }
  return error?.message || 'Something went wrong. Please try again.'
}

// Steps: start (Google / email) -> email -> password (log in or create) -> done,
// with side trips: code (email link + 6-digit code), confirm (new account must confirm),
// forgot -> forgot-sent.
export default function SignIn() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const { user, profile, needsWelcome } = useAuth()
  // Decorative collage: recent album covers from vendors on the app.
  const { data: providers } = useQuery(() => listProviders(), [])
  const collage = coverMix(providers, 6)

  const [mode, setMode] = useState(params.get('mode') === 'signup' ? 'signup' : 'login')
  // The way back: each step pushes; the back arrow pops.
  const [trail, setTrail] = useState(['start'])
  const step = trail[trail.length - 1]
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [resendIn, setResendIn] = useState(0)
  const [googleEnabled, setGoogleEnabled] = useState(null) // null = checking
  const headingRef = useRef(null)

  // Signed in (or just finished): move on.
  useEffect(() => {
    if (user && profile) navigate(needsWelcome ? `/welcome?next=${encodeURIComponent(next)}` : next, { replace: true })
  }, [user, profile, needsWelcome, next, navigate])

  // Ask the project which sign-in methods are switched on, so we never send
  // people to a raw "provider is not enabled" error page.
  useEffect(() => {
    const url = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
      .then((r) => r.json())
      .then((s) => setGoogleEnabled(!!s?.external?.google))
      .catch(() => setGoogleEnabled(false))
  }, [])

  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  // Steps without a text field get focus on their heading, so keyboard and screen-reader
  // users land on the new content (the others autofocus their field).
  useEffect(() => {
    if (['confirm', 'forgot-sent'].includes(step)) headingRef.current?.focus()
  }, [step])

  // Built on demand (only ever runs in the browser).
  const callbackUrl = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
  const cleanEmail = email.trim().toLowerCase()

  const go = (nextStep) => {
    setTrail((t) => (nextStep === 'start' ? ['start'] : [...t, nextStep]))
    setError('')
    setNotice('')
  }
  // Jump to a step with a known way back (e.g. "Use a different email").
  const jump = (newTrail) => {
    setTrail(newTrail)
    setError('')
    setNotice('')
  }
  const back = () => jump(trail.length > 1 ? trail.slice(0, -1) : ['start'])
  const switchMode = (m) => {
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

  const run = async (fn) => {
    if (busy) return // buttons stay enabled while busy (so focus isn't dropped); ignore repeats
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  // ---- Email step: just check the address, then ask for the password ----
  const submitEmail = (e) => {
    e.preventDefault()
    if (!checkEmail()) return
    go('password')
  }

  // ---- Log in with email + password ----
  const logIn = (e) => {
    e.preventDefault()
    if (!checkEmail()) return
    run(async () => {
      const { error: err } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })
      if (err) setError(friendly(err))
      // On success the auth listener picks up the session and the effect above navigates.
    })
  }

  // ---- Create an account with email + password ----
  const signUp = (e) => {
    e.preventDefault()
    if (!checkEmail()) return
    if (password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters for your password.`)
      return
    }
    run(async () => {
      const { data, error: err } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: { emailRedirectTo: callbackUrl() },
      })
      if (err) {
        setError(friendly(err))
        return
      }
      // Supabase doesn't reveal whether an email is registered; an existing
      // address comes back with no identities.
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
        headingRef.current?.focus()
      }
    })

  // ---- Passwordless: email a sign-in link + code ----
  const sendLink = (e) => {
    e?.preventDefault()
    if (!checkEmail()) return
    run(async () => {
      const { error: err } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: { emailRedirectTo: callbackUrl(), shouldCreateUser: true },
      })
      if (err) {
        setError(friendly(err))
        return
      }
      setCode('')
      if (step !== 'code') go('code')
      else {
        setNotice('New code sent. Check your inbox (and spam).')
        document.getElementById('signin-code')?.focus()
      }
      setResendIn(RESEND_SECONDS)
    })
  }

  // `token` lets the code boxes submit the moment the last digit lands.
  const verifyCode = (e, token = code) => {
    e?.preventDefault()
    if (busy || token.length < CODE_LENGTH) return
    run(async () => {
      const { error: err } = await supabase.auth.verifyOtp({ email: cleanEmail, token: token.trim(), type: 'email' })
      if (err) {
        setError(friendly(err))
        setCode('')
      }
    })
  }

  // ---- Forgot password ----
  const sendReset = (e) => {
    e.preventDefault()
    if (!checkEmail()) return
    run(async () => {
      const { error: err } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (err) setError(friendly(err))
      else go('forgot-sent')
    })
  }

  const google = async () => {
    setError('')
    setGoogleBusy(true)
    const { error: err } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callbackUrl() } })
    if (err) {
      setError(friendly(err))
      setGoogleBusy(false)
    }
  }

  const close = () => (location.key === 'default' ? navigate('/') : navigate(-1))
  const errId = error ? 'signin-error' : undefined

  // Messages sit right above the step's main button, where people are looking.
  const messages = (
    <>
      {notice && <div className="au-notice" role="status">{notice}</div>}
      {error && <div className="au-error" role="alert" id="signin-error">{error}</div>}
    </>
  )
  const legal = (
    <p className="au-legal">
      By continuing, you agree to our <b>Terms of Service</b> and <b>Privacy Policy</b>.
    </p>
  )
  const emailChip = (
    <div className="au-chip">
      <Mail size={16} aria-hidden="true" />
      <span className="au-chip-text">{cleanEmail}</span>
      <button type="button" className="au-link" onClick={() => jump(['start', 'email'])}>
        Change<span className="sr-only"> email</span>
      </button>
    </div>
  )

  if (step === 'start') {
    return (
      <div className="au">
        <div className="au-hero" aria-hidden="true">
          <div className="au-collage">
            {Array.from({ length: 6 }, (_, i) =>
              collage[i] ? <img key={i} src={collage[i]} alt="" className={`c${i}`} /> : <span key={i} className={`au-tile c${i}`} />,
            )}
          </div>
        </div>
        <button className="au-close" onClick={close} aria-label="Close">
          <X size={20} aria-hidden="true" />
        </button>

        <div className="au-start">
          <div className="wordmark">photomatch</div>
          <h1 className="au-headline">Plan any event. Book trusted vendors.</h1>
          <p className="au-sub">Photographers, caterers, venues, DJs and more, all in one place.</p>

          <div className="au-actions">
            <button className="au-btn au-btn-google" onClick={google} disabled={googleEnabled === false || googleBusy}
              aria-describedby={googleEnabled === false ? 'google-off' : errId}>
              {googleBusy ? <span className="au-spin" aria-hidden="true" /> : <GoogleLogo />}
              {googleBusy ? 'Opening Google…' : 'Continue with Google'}
            </button>
            {googleEnabled === false && (
              <p className="au-hint center" id="google-off">Google sign-in isn’t switched on for this project yet.</p>
            )}
            <button className="au-btn au-btn-primary" onClick={() => go('email')}>
              <Mail size={18} aria-hidden="true" /> Continue with email
            </button>
          </div>
          {messages}

          <p className="au-switch">
            New here?{' '}
            <button type="button" className="au-link strong" onClick={() => { switchMode('signup'); go('email') }}>
              Create an account
            </button>
          </p>
          {legal}
        </div>
      </div>
    )
  }

  return (
    <div className="au au-flow">
      <div className="au-bar">
        <button className="au-icon-btn" onClick={back} aria-label="Back">
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <div className="wordmark au-bar-mark" aria-hidden="true">photomatch</div>
        <button className="au-icon-btn" onClick={close} aria-label="Close">
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      <div className="au-step" key={step}>
        {step === 'email' && (
          <>
            <Segmented
              className="au-seg"
              options={[
                { value: 'login', label: 'Log in' },
                { value: 'signup', label: 'Sign up' },
              ]}
              value={mode}
              label="Log in or sign up"
              onChange={switchMode}
            />
            <h1 className="au-title">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
            <p className="au-lede">
              {mode === 'login' ? 'Log in with the email you signed up with.' : 'Free, and it takes less than a minute.'}
            </p>
            <form onSubmit={submitEmail} noValidate className="au-form">
              <div className="au-field">
                <div className="au-label-row"><label htmlFor="signin-email">Email</label></div>
                <div className={`au-input-wrap${error ? ' invalid' : ''}`}>
                  <input id="signin-email" className="au-input" type="email" inputMode="email" autoComplete="email"
                    autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next"
                    placeholder="you@example.com" value={email} onChange={(e) => { setEmail(e.target.value); if (error) setError('') }}
                    aria-invalid={error ? true : undefined} aria-describedby={errId} autoFocus />
                </div>
              </div>
              {messages}
              <button className="au-btn au-btn-primary" disabled={!email.trim()}>Continue</button>
            </form>
          </>
        )}

        {step === 'password' && (
          <>
            <h1 className="au-title">{mode === 'login' ? 'Enter your password' : 'Create a password'}</h1>
            {emailChip}
            <form onSubmit={mode === 'login' ? logIn : signUp} noValidate className="au-form">
              {/* For password managers: the account this password belongs to. */}
              <input type="email" name="email" autoComplete="username" value={cleanEmail} readOnly hidden />
              <PasswordField
                id="signin-password"
                label={mode === 'login' ? 'Password' : 'New password'}
                value={password}
                onChange={(v) => { setPassword(v); if (error) setError('') }}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                show={showPassword}
                onToggleShow={() => setShowPassword((v) => !v)}
                meter={mode === 'signup'}
                invalid={!!error}
                describedBy={errId}
                enterKeyHint="go"
                autoFocus
                labelRight={mode === 'login' && (
                  <button type="button" className="au-link small" onClick={() => go('forgot')}>Forgot password?</button>
                )}
              />
              {messages}
              {mode === 'login' && error === 'Wrong email or password.' && (
                <p className="au-hint">
                  New here?{' '}
                  <button type="button" className="au-link strong" onClick={() => switchMode('signup')}>Create an account instead</button>
                </p>
              )}
              <button className="au-btn au-btn-primary" disabled={!password} aria-busy={busy || undefined}>
                {busy && <span className="au-spin" aria-hidden="true" />}
                {busy ? (mode === 'login' ? 'Logging in…' : 'Creating account…') : mode === 'login' ? 'Log in' : 'Create account'}
              </button>
            </form>
            <div className="au-divider"><span>or</span></div>
            <button className="au-btn au-btn-ghost" onClick={sendLink} disabled={busy}>
              <KeyRound size={18} aria-hidden="true" /> Email me a code instead
            </button>
          </>
        )}

        {step === 'code' && (
          <>
            <div className="au-badge" aria-hidden="true"><MailCheck size={26} /></div>
            <h1 className="au-title">Check your email</h1>
            <p className="au-lede">
              We sent a {CODE_LENGTH}-digit code to <b className="au-ink">{cleanEmail}</b>. Enter it below, or tap the link in the email on this device.
            </p>
            <form onSubmit={verifyCode} className="au-form">
              <CodeInput
                id="signin-code"
                label={`${CODE_LENGTH}-digit code`}
                value={code}
                onChange={(v) => { setCode(v); if (error) setError('') }}
                onComplete={(v) => verifyCode(null, v)}
                invalid={!!error}
                describedBy={errId}
                autoFocus
              />
              {messages}
              <button className="au-btn au-btn-primary" disabled={!busy && code.length < CODE_LENGTH} aria-busy={busy || undefined}>
                {busy && <span className="au-spin" aria-hidden="true" />}
                {busy ? 'Checking…' : 'Verify and continue'}
              </button>
            </form>
            <p className="au-hint center">
              Didn’t get it?{' '}
              {resendIn > 0 ? (
                <span className="au-ink" role="timer" aria-live="off">Resend in {resendIn}s</span>
              ) : (
                <button type="button" className="au-link strong" onClick={sendLink} disabled={busy}>Resend code</button>
              )}
              {' · '}
              <button type="button" className="au-link strong" onClick={() => jump(['start', 'email'])}>Use a different email</button>
            </p>
          </>
        )}

        {step === 'confirm' && (
          <>
            <div className="au-badge" aria-hidden="true"><MailCheck size={26} /></div>
            <h1 className="au-title" tabIndex={-1} ref={headingRef}>Confirm your email</h1>
            <p className="au-lede">
              We sent a confirmation link to <b className="au-ink">{cleanEmail}</b>. Open it to finish creating your account. After that you can log in with your email and password any time.
            </p>
            <div className="au-form">
              {messages}
              <button className="au-btn au-btn-primary" onClick={() => { setMode('login'); jump(['start', 'email', 'password']) }}>
                I’ve confirmed, log me in
              </button>
            </div>
            <p className="au-hint center">
              Didn’t get it?{' '}
              {resendIn > 0 ? (
                <span className="au-ink" role="timer" aria-live="off">Resend in {resendIn}s</span>
              ) : (
                <button type="button" className="au-link strong" onClick={resendConfirmation} disabled={busy}>Resend confirmation email</button>
              )}
            </p>
          </>
        )}

        {step === 'forgot' && (
          <>
            <h1 className="au-title">Reset your password</h1>
            <p className="au-lede">Enter your account email and we’ll send a link to choose a new password.</p>
            <form onSubmit={sendReset} noValidate className="au-form">
              <div className="au-field">
                <div className="au-label-row"><label htmlFor="forgot-email">Email</label></div>
                <div className={`au-input-wrap${error ? ' invalid' : ''}`}>
                  <input id="forgot-email" className="au-input" type="email" inputMode="email" autoComplete="email"
                    autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="send" placeholder="you@example.com"
                    aria-invalid={error ? true : undefined} aria-describedby={errId}
                    value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
                </div>
              </div>
              {messages}
              <button className="au-btn au-btn-primary" disabled={!email.trim()} aria-busy={busy || undefined}>
                {busy && <span className="au-spin" aria-hidden="true" />}
                {busy ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          </>
        )}

        {step === 'forgot-sent' && (
          <>
            <div className="au-badge ok" aria-hidden="true"><MailCheck size={26} /></div>
            <h1 className="au-title" tabIndex={-1} ref={headingRef}>Check your email</h1>
            <p className="au-lede">
              If <b className="au-ink">{cleanEmail}</b> has an account, a password reset link is on its way. It works once and expires after an hour.
            </p>
            <div className="au-form">
              <button className="au-btn au-btn-primary" onClick={() => { setMode('login'); jump(['start', 'email', 'password']) }}>
                Back to log in
              </button>
            </div>
          </>
        )}
      </div>
      {legal}
    </div>
  )
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  )
}
