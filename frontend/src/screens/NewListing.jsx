import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft, Clock } from 'lucide-react'
import { ErrorState, Loading, SignInPrompt } from '../components/States.jsx'
import { VerticalBadge } from '../components/verticals/VerticalIcon.jsx'
import { useAuth } from '../auth.jsx'
import { useStore } from '../store.jsx'
import useQuery from '../lib/useQuery.js'
import { getCategories, invalidate } from '../api/catalog.js'
import { becomeProvider, slugify } from '../api/portfolio.js'
import { PHOTO_VERTICAL } from '../verticals/index.js'

const friendlyError = (err) => {
  const msg = err?.message || ''
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return 'Network problem. Check your connection and try again.'
  if (/jwt|not authenticated|row-level security/i.test(msg)) return 'Your session expired. Sign in again, then retry.'
  if (/unknown category/i.test(msg)) return 'Listings aren’t open yet.'
  if (/duplicate key.*profile_id/i.test(msg)) return 'You already have a listing.'
  return msg || 'Something went wrong.'
}

const TITLE = 'Set up your photography listing'

// /new-listing: name, link, city and the kinds of shoot you offer (photo and video), then
// on to posting your first work. One listing per person (accounts from the multi-vendor
// days may have more; they're told they already have one).
export default function NewListing() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const { setMode } = useStore()

  if (!loading && !user) {
    return (
      <div className="up-screen">
        <Header title={TITLE} />
        <SignInPrompt title="Sign in to set up your listing" text="Set up a listing so clients can find and book you." />
      </div>
    )
  }
  if (loading) return <div className="up-screen"><Header title={TITLE} /><Loading /></div>
  return (
    <ListingSetup
      onDone={() => {
        setMode('provider')
        navigate('/upload', { replace: true })
      }}
    />
  )
}

// Same look as TopBar, with a custom back action.
function Header({ title, onBack }) {
  const navigate = useNavigate()
  const location = useLocation()
  const back = onBack ?? (() => (location.key === 'default' ? navigate('/me', { replace: true }) : navigate(-1)))
  return (
    <header className="topbar">
      <div className="topbar-side">
        <button className="icon-btn" onClick={back} aria-label="Back"><ChevronLeft size={24} /></button>
      </div>
      <div className="topbar-title"><div>{title}</div></div>
      <div className="topbar-side right" />
    </header>
  )
}

const SERVICE_GROUPS = [
  { kind: 'photo', label: 'Photo' },
  { kind: 'video', label: 'Video' },
]

// The setup form (only /new-listing uses it; Upload links here when someone has no listing yet). onDone(provider) gets
// the new providers row (+ `vertical`). (initialVertical / lockVertical are accepted for old
// callers; there's one vertical.)
export function ListingSetup({ onDone, title }) {
  const { profile } = useAuth()
  const { myProviders, refreshProvider, toast } = useStore()
  const cats = useQuery(getCategories, [])
  const [name, setName] = useState(profile?.display_name || '')
  const [slug, setSlug] = useState(slugify(profile?.display_name || profile?.username || ''))
  const [slugTouched, setSlugTouched] = useState(false)
  const [editLink, setEditLink] = useState(false)
  const [city, setCity] = useState(profile?.city || '')
  const [picked, setPicked] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const info = cats.data?.[0]
  const services = useMemo(() => (info?.services || []).filter((s) => s.live), [info])
  const isLive = !!info?.live
  const already = (myProviders || []).length > 0

  const slugOk = /^[a-z0-9-]{3,40}$/.test(slug)
  const ready = name.trim().length > 0 && slugOk && isLive && !already

  const save = async (e) => {
    e.preventDefault()
    if (!ready) {
      setError(!name.trim() ? 'Add the name clients will see.' : !slugOk ? 'Your profile link needs 3–40 letters, numbers or dashes.' : '')
      if (!slugOk) setEditLink(true)
      return
    }
    setBusy(true)
    setError('')
    try {
      const ids = services.filter((s) => picked.has(s.slug)).map((s) => s.id)
      const provider = await becomeProvider({ displayName: name.trim(), slug, city: city.trim(), serviceIds: ids })
      invalidate('providers')
      await refreshProvider(provider.id)
      toast('You’re set up. Now add your first photos.')
      onDone({ ...provider, vertical: PHOTO_VERTICAL })
    } catch (err) {
      if (err.code === '23505' && /slug/i.test(err.message || '')) {
        setEditLink(true)
        setError('That profile link is taken. Try another.')
      } else if (err.code === '23505') {
        setError('You already have a listing.')
      } else {
        setError(friendlyError(err))
      }
    } finally {
      setBusy(false)
    }
  }

  const toggle = (slugToToggle) => setPicked((prev) => {
    const n = new Set(prev)
    n.has(slugToToggle) ? n.delete(slugToToggle) : n.add(slugToToggle)
    return n
  })

  return (
    <form className="up-screen" onSubmit={save} noValidate>
      <Header title={title || TITLE} />
      <div className="pad bp">
        <div className="bp-hero">
          <VerticalBadge vertical={PHOTO_VERTICAL} size={64} />
          <h2>Show clients your work</h2>
          <p className="muted small">
            Photographers and videographers: set up your profile once, then post your work and add packages. You can change any of this later.
          </p>
        </div>

        {cats.error ? (
          <ErrorState error={cats.error} onRetry={cats.reload} />
        ) : cats.loading && !cats.data ? (
          <Loading inline />
        ) : already ? (
          <div className="callout">
            <b className="small">You already have a listing.</b>
            <div className="muted small mt-xs">Manage it, post work and edit your packages from your profile.</div>
            <div className="row gap-xs mt-sm">
              <Link to="/me" className="btn sm">Go to my profile</Link>
            </div>
          </div>
        ) : !isLive ? (
          <div className="callout coming-soon">
            <div className="inline-icon"><Clock size={16} aria-hidden="true" /> <b>Listings open soon</b></div>
            <div className="muted small mt-xs">We’re getting photo & video listings ready. Check back soon.</div>
          </div>
        ) : (
          <>
            <label className="field pf-field">
              <span className="pf-label">Name clients will see</span>
              <input className="input" maxLength={80} placeholder="e.g. Alex Rivera Photography" value={name} autoComplete="organization"
                onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)) }} />
            </label>
            {editLink ? (
              <label className="field pf-field">
                <span className="pf-label">Profile link</span>
                <div className="input-prefix">
                  <span>photomatch.app/</span>
                  <input value={slug} maxLength={40} autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-label="Profile link"
                    onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)) }} />
                </div>
                {slug && !slugOk && <small className="field-hint">3–40 characters: letters, numbers and dashes.</small>}
              </label>
            ) : (
              <div className="bp-link muted tiny">
                <span>Your link: photomatch.app/<b>{slug || '…'}</b></span>
                <button type="button" className="link-btn accent tiny" onClick={() => setEditLink(true)}>Change</button>
              </div>
            )}

            <label className="field pf-field">
              <span className="pf-label">City <span className="pf-optional">optional</span></span>
              <input className="input" maxLength={80} placeholder="Los Angeles, CA" value={city} autoComplete="address-level2" onChange={(e) => setCity(e.target.value)} />
            </label>

            {services.length > 0 && (
              <div className="field pf-field" role="group" aria-label="What do you shoot?">
                <span className="pf-label">What do you shoot? <span className="pf-optional">optional</span></span>
                {SERVICE_GROUPS.map((g) => {
                  const list = services.filter((s) => (s.kind || 'photo') === g.kind)
                  if (!list.length) return null
                  return (
                    <div key={g.kind} className="mt-xs">
                      <div className="muted tiny">{g.label}</div>
                      <div className="chips mt-xs">
                        {list.map((s) => (
                          <button type="button" key={s.slug} className={`chip toggle ${picked.has(s.slug) ? 'on' : ''}`} aria-pressed={picked.has(s.slug)} onClick={() => toggle(s.slug)}>
                            {s.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
        {error && <div className="form-error" role="alert">{error}</div>}
      </div>
      {isLive && !already && (
        <div className="up-footer">
          <button className="btn accent block" disabled={busy}>{busy ? 'Setting up…' : 'Continue'}</button>
        </div>
      )}
    </form>
  )
}
