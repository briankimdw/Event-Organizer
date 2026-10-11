import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CircleAlert, CircleCheck, KeyRound, Link2Off } from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../auth.jsx'
import { useStore } from '../store.jsx'
import { MIN_PASSWORD } from '../components/auth/authKit.js'
import PasswordField from '../components/auth/PasswordField.jsx'
import '../components/auth/auth.css'

// Choose a new password. Reached two ways:
//  - from a "reset your password" email (the link signs you in for this one step)
//  - from Settings > Set or change password, while signed in
export default function ResetPassword() {
  const navigate = useNavigate()
  const { user, loading } = useAuth()
  const { toast } = useStore()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [waited, setWaited] = useState(false)

  // A reset link needs a moment to sign you in; only then decide it was invalid.
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 4000)
    return () => clearTimeout(t)
  }, [])

  const save = async (e) => {
    e.preventDefault()
    if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`)
    if (password !== confirm) return setError('The passwords don’t match.')
    setBusy(true)
    setError('')
    const { error: err } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (err) {
      setError(err.message)
      return
    }
    toast('Password saved. You can now log in with it.')
    navigate('/me', { replace: true })
  }

  if (!user) {
    return (
      <div className="au">
        <TopBar title="New password" />
        <div className="au-status-screen">
          {loading || !waited ? (
            <>
              <div className="spinner" />
              <p className="au-lede" role="status">Checking your link…</p>
            </>
          ) : (
            <>
              <div className="au-badge" aria-hidden="true"><Link2Off size={26} /></div>
              <h2 className="au-title">That reset link didn’t work</h2>
              <p className="au-lede">It may have expired or already been used. Request a new one from the log-in screen.</p>
              <Link to="/sign-in" className="au-btn au-btn-primary">Back to log in</Link>
            </>
          )}
        </div>
      </div>
    )
  }

  const matches = confirm.length > 0 && confirm === password
  const mismatch = confirm.length >= password.length && confirm.length > 0 && confirm !== password
  return (
    <div className="au">
      <TopBar title="New password" />
      <form className="au-welcome" onSubmit={save} noValidate>
        <div className="au-badge" aria-hidden="true"><KeyRound size={26} /></div>
        <h2 className="au-title">Choose a new password</h2>
        <p className="au-lede">For <b className="au-ink">{user.email}</b>. You’ll use it to log in from now on.</p>
        <div className="au-form">
          <PasswordField
            id="reset-password"
            label="New password"
            value={password}
            onChange={(v) => { setPassword(v); if (error) setError('') }}
            autoComplete="new-password"
            show={show}
            onToggleShow={() => setShow((v) => !v)}
            meter
            describedBy={error ? 'reset-error' : undefined}
            enterKeyHint="next"
            autoFocus
          />
          <div className="au-field">
            <PasswordField
              id="reset-confirm"
              label="Confirm password"
              value={confirm}
              onChange={(v) => { setConfirm(v); if (error) setError('') }}
              autoComplete="new-password"
              show={show}
              toggle={false}
              invalid={mismatch}
              describedBy={['reset-match', error && 'reset-error'].filter(Boolean).join(' ')}
              enterKeyHint="done"
            />
            <div id="reset-match" aria-live="polite">
              {matches && <span className="au-status ok"><CircleCheck size={15} aria-hidden="true" /> Passwords match</span>}
              {mismatch && <span className="au-status bad"><CircleAlert size={15} aria-hidden="true" /> The passwords don’t match yet</span>}
            </div>
          </div>
          {error && <div className="au-error" role="alert" id="reset-error">{error}</div>}
          <button className="au-btn au-btn-primary" disabled={busy || !password || !confirm} aria-busy={busy || undefined}>
            {busy && <span className="au-spin" aria-hidden="true" />}
            {busy ? 'Saving…' : 'Save password'}
          </button>
        </div>
      </form>
    </div>
  )
}
