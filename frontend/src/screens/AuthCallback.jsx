import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Link2Off } from 'lucide-react'
import { safeNext, useAuth } from '../auth.jsx'
import '../components/auth/auth.css'

// Where magic links and Google sign-in land. supabase-js reads the session
// from the URL on load; we wait for it, then continue.
export default function AuthCallback() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const { user, profile, needsWelcome } = useAuth()

  // Errors come back in the query string or the hash (e.g. an expired link).
  const hash = new URLSearchParams(location.hash.slice(1))
  const urlError = params.get('error_description') || hash.get('error_description')
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (user && profile) navigate(needsWelcome ? `/welcome?next=${encodeURIComponent(next)}` : next, { replace: true })
  }, [user, profile, needsWelcome, next, navigate])

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 10000)
    return () => clearTimeout(t)
  }, [])

  if (urlError || timedOut) {
    return (
      <div className="au">
        <div className="au-status-screen">
          <div className="au-badge" aria-hidden="true"><Link2Off size={26} /></div>
          <h1 className="au-title">That sign-in link didn’t work</h1>
          <p className="au-lede">
            {urlError ? urlError.replace(/\+/g, ' ').replace(/\.?$/, '.') :'It may have expired or already been used.'} Links work once and expire after an hour.
          </p>
          <Link to={`/sign-in?next=${encodeURIComponent(next)}`} className="au-btn au-btn-primary">Try again</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="au">
      <div className="au-status-screen">
        <div className="wordmark">photomatch</div>
        <div className="spinner" />
        <p className="au-lede" role="status">Signing you in…</p>
      </div>
    </div>
  )
}
