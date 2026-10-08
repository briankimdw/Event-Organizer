import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Mail, X } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { safeNext, useAuth } from '../auth.jsx'
import { img } from '../data/mock.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RESEND_SECONDS = 30

// Turn Supabase auth errors into something a person can act on.
const friendly = (error) => {
  const msg = (error?.message || '').toLowerCase()
  if (error?.status === 429 || msg.includes('rate limit') || msg.includes('only request this after')) {
    return 'Too many attempts. Wait a minute, then try again.'
  }
  if (msg.includes('not authorized') || msg.includes('not allowed')) {
    return 'Sign-in emails can only go to approved addresses until email sending is set up. Ask the team to add you.'
  }
  if (msg.includes('expired') || msg.includes('invalid') || msg.includes('token')) {
    return 'That code didn’t work. Check it, or send a new one.'
  }
  return error?.message || 'Something went wrong. Please try again.'
}

export default function SignIn() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const { user, profile, needsWelcome } = useAuth()

  const [step, setStep] = useState('start') // start | code
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [resendIn, setResendIn] = useState(0)
  const [googleEnabled, setGoogleEnabled] = useState(null) // null = checking

  // Already signed in (or just finished): move on.
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

  // Computed on demand (only ever runs in the browser).
  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`

  const sendEmail = async (e) => {
    e?.preventDefault()
    const address = email.trim().toLowerCase()
    if (!EMAIL_RE.test(address)) {
      setError('Enter a valid email address.')
      return
    }
    setBusy(true)
    setError('')
    const { error: err } = await supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: redirectTo(), shouldCreateUser: true },
    })
    setBusy(false)
    if (err) {
      setError(friendly(err))
      return
    }
    setEmail(address)
    setCode('')
    setStep('code')
    setResendIn(RESEND_SECONDS)
  }

  const verify = async (e) => {
    e?.preventDefault()
    setBusy(true)
    setError('')
    const { error: err } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'email' })
    setBusy(false)
    if (err) setError(friendly(err))
    // On success the auth listener picks up the session and the effect above navigates.
  }

  const google = async () => {
    setError('')
    const { error: err } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo() } })
    if (err) setError(friendly(err))
  }

  return (
    <div className="signin">
      <div className="signin-hero">
        <div className="signin-collage">
          {['maya-2', 'jonah-1', 'p1-album-1-0', 'sofia-1', 'p3-album-1-0', 'leo-1'].map((s, i) => (
            <img key={s} src={img(s, 300, 380)} alt="" className={`c${i}`} />
          ))}
        </div>
        <button className="icon-btn signin-close" onClick={() => (location.key === 'default' ? navigate('/') : navigate(-1))} aria-label="Close">
          <X size={22} />
        </button>
      </div>

      <div className="signin-body">
        {step === 'start' ? (
          <>
            <div className="wordmark">photomatch</div>
            <h1 className="signin-title">Find and book photographers you’ll love</h1>
            <p className="muted small">Sign in to request bookings, message photographers and save your favorites.</p>

            <button className="btn-google mt" onClick={google} disabled={googleEnabled === false}>
              <GoogleLogo /> Continue with Google
            </button>
            {googleEnabled === false && (
              <div className="tiny muted center-text mt-xs">Google sign-in isn’t switched on for this project yet.</div>
            )}

            <div className="divider"><span>or</span></div>

            <form onSubmit={sendEmail} noValidate>
              <label className="field">
                <span>Email</span>
                <input
                  className="input"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <button className="btn block mt-sm" disabled={busy || !email.trim()}>
                <Mail size={16} /> {busy ? 'Sending…' : 'Continue with email'}
              </button>
            </form>
            <p className="tiny muted mt-sm">No password needed. We’ll email you a sign-in link and code.</p>
          </>
        ) : (
          <>
            <button className="link-btn small muted" onClick={() => { setStep('start'); setError('') }}>
              <ArrowLeft size={14} /> Use a different email
            </button>
            <h1 className="signin-title mt-sm">Check your email</h1>
            <p className="muted small">
              We sent a sign-in link to <b className="ink">{email}</b>. Tap it on this device, or enter the code from the email.
            </p>
            <form onSubmit={verify} className="mt">
              <input
                className="input code-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={10}
                placeholder="••••••"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                aria-label="Sign-in code"
                autoFocus
              />
              <button className="btn block mt-sm" disabled={busy || code.length < 6}>
                {busy ? 'Checking…' : 'Sign in'}
              </button>
            </form>
            <button className="link-btn small mt" disabled={resendIn > 0 || busy} onClick={sendEmail}>
              {resendIn > 0 ? `Resend email in ${resendIn}s` : 'Resend email'}
            </button>
          </>
        )}

        {error && <div className="form-error mt-sm" role="alert">{error}</div>}

        <p className="tiny muted signin-legal">
          By continuing you agree to the <Link to="#">Terms</Link> and <Link to="#">Privacy Policy</Link>.
        </p>
      </div>
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
