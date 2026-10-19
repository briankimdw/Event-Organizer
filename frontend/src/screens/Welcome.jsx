import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Camera, Check, CircleAlert, CircleCheck, Search, User } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { safeNext, useAuth } from '../auth.jsx'
import { USERNAME_RE, initials, usernameTaken } from '../components/auth/authKit.js'
import '../components/auth/auth.css'

// One-time step after a new account is created: pick a name and username (and, optionally,
// say whether you're planning or offering a service; vendors go on to create their listing).
export default function Welcome() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const { user, profile, refreshProfile, loading } = useAuth()
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [intent, setIntent] = useState('') // '' | 'plan' | 'offer'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Live availability: { name, taken: true | false | null } for the last checked username.
  const [check, setCheck] = useState(null)

  useEffect(() => {
    if (!loading && !user) navigate(`/sign-in?next=${encodeURIComponent(next)}`, { replace: true })
  }, [loading, user, next, navigate])

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

  const save = async (e) => {
    e.preventDefault()
    if (!name.trim() || !usernameOk || taken) return
    setBusy(true)
    setError('')
    const { error: err } = await supabase
      .from('profiles')
      .update({ display_name: name.trim(), username: cleanUsername })
      .eq('id', user.id)
    setBusy(false)
    if (err) {
      setError(err.code === '23505' ? 'That username is taken. Try another.' : err.message)
      return
    }
    await refreshProfile()
    navigate(intent === 'offer' ? '/new-listing' : next, { replace: true })
  }

  let status = null
  if (username && !usernameOk) {
    status = <span className="au-status bad"><CircleAlert size={15} aria-hidden="true" /> 3–30 characters: lowercase letters, numbers, dots and underscores.</span>
  } else if (usernameOk && isOwn) {
    status = <span className="au-status ok"><CircleCheck size={15} aria-hidden="true" /> @{cleanUsername} is yours</span>
  } else if (usernameOk && checked === undefined) {
    status = <span className="au-status" aria-hidden="true"><span className="au-spin" /> Checking…</span>
  } else if (taken) {
    status = <span className="au-status bad"><CircleAlert size={15} aria-hidden="true" /> @{cleanUsername} is taken. Try another.</span>
  } else if (usernameOk && checked === false) {
    status = <span className="au-status ok"><CircleCheck size={15} aria-hidden="true" /> @{cleanUsername} is available</span>
  }

  const choices = [
    { value: 'plan', icon: Search, title: 'Booking a shoot', sub: 'Find and book photographers' },
    { value: 'offer', icon: Camera, title: 'I shoot photo or video', sub: 'List your work, get booked' },
  ]

  return (
    <div className="au au-welcome">
      <div className={`au-avatar${initials(name) ? '' : ' empty'}`} aria-hidden="true">{initials(name) || <User size={30} />}</div>
      <h1 className="au-title">Make it yours</h1>
      <p className="au-lede">Photographers see your name when you message or book them.</p>

      <form onSubmit={save} className="au-form" noValidate>
        <div className="au-field">
          <div className="au-label-row"><label htmlFor="welcome-name">Your name</label></div>
          <div className="au-input-wrap">
            <input id="welcome-name" className="au-input" autoComplete="name" value={name} maxLength={80} enterKeyHint="next"
              onChange={(e) => setName(e.target.value)} placeholder="Alex Rivera" autoFocus />
          </div>
        </div>

        <div className="au-field">
          <div className="au-label-row"><label htmlFor="welcome-username">Username</label></div>
          <div className={`au-input-wrap${(username && !usernameOk) || taken ? ' invalid' : ''}`}>
            <span className="au-prefix" aria-hidden="true">@</span>
            <input id="welcome-username" className="au-input" value={username} maxLength={30} autoComplete="username"
              autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="done"
              aria-invalid={(username && !usernameOk) || taken ? true : undefined}
              aria-describedby={['welcome-username-status', error && 'welcome-error'].filter(Boolean).join(' ')}
              onChange={(e) => setUsername(e.target.value.toLowerCase())} />
          </div>
          <div id="welcome-username-status" aria-live="polite">{status}</div>
        </div>

        <fieldset className="au-choices">
          <legend>What brings you here? <span>(optional)</span></legend>
          {choices.map(({ value, icon: Icon, title, sub }) => (
            <label key={value} className="au-choice">
              <input type="radio" name="intent" value={value} checked={intent === value}
                onChange={() => setIntent(value)} onClick={() => intent === value && setIntent('')} />
              <Icon size={22} className="au-choice-icon" aria-hidden="true" />
              <span className="au-choice-title">{title}</span>
              <span className="au-choice-sub">{sub}</span>
              <span className="au-choice-check" aria-hidden="true">{intent === value && <Check size={12} strokeWidth={3} />}</span>
            </label>
          ))}
        </fieldset>

        {error && <div className="au-error" role="alert" id="welcome-error">{error}</div>}
        <button className="au-btn au-btn-primary" disabled={busy || !name.trim() || !usernameOk || taken} aria-busy={busy || undefined}>
          {busy && <span className="au-spin" aria-hidden="true" />}
          {busy ? 'Saving…' : intent === 'offer' ? 'Continue to your listing' : 'Continue'}
        </button>
      </form>
    </div>
  )
}
