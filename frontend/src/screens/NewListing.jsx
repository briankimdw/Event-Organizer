import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Clock } from 'lucide-react'
import { ErrorState, Loading, SignInPrompt } from '../components/States.jsx'
import { VerticalGrid } from '../components/verticals/VerticalSwitcher.jsx'
import { VerticalBadge } from '../components/verticals/VerticalIcon.jsx'
import { useAuth } from '../auth.jsx'
import { useStore } from '../store.jsx'
import useQuery from '../lib/useQuery.js'
import { getCategories, invalidate } from '../api/catalog.js'
import { becomeProvider, slugify } from '../api/portfolio.js'
import { getVertical, lowerFirst, nounFor, verticalMeta } from '../verticals/index.js'

const friendlyError = (err) => {
  const msg = err?.message || ''
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return 'Network problem. Check your connection and try again.'
  if (/jwt|not authenticated|row-level security/i.test(msg)) return 'Your session expired. Sign in again, then retry.'
  if (/unknown category/i.test(msg)) return 'This service isn’t open for listings yet.'
  if (/duplicate key.*profile_id/i.test(msg)) return 'You already have a listing for this service.'
  return msg || 'Something went wrong.'
}

// /new-listing?v=catering: "What do you offer?" -> pick a vertical, its services,
// then a name and link. A user can have one listing per vertical.
export default function NewListing() {
  const { user, loading } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { setMode } = useStore()
  const preset = getVertical(params.get('v')) ? params.get('v') : null

  if (!loading && !user) {
    return (
      <div className="up-screen">
        <Header title="List your services" />
        <SignInPrompt title="Sign in to list your services" text="Set up a listing so clients can find and book you." />
      </div>
    )
  }
  if (loading) return <div className="up-screen"><Header title="List your services" /><Loading /></div>
  return (
    <ListingSetup
      initialVertical={preset}
      onDone={(provider) => {
        setMode('provider')
        // Visual services post their work first; everyone else starts with packages.
        navigate(verticalMeta(provider.vertical).visual ? '/upload' : '/me?tab=packages', { replace: true })
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

// The setup form. Also used by /upload the first time someone posts (initialVertical
// 'photography', lockVertical). onDone(provider) gets the new providers row (+ `vertical`).
export function ListingSetup({ initialVertical = null, lockVertical = false, onDone, title }) {
  const { profile } = useAuth()
  const { myProviders, refreshProvider, toast } = useStore()
  const cats = useQuery(getCategories, [])
  const taken = useMemo(() => new Set((myProviders || []).map((p) => p.vertical)), [myProviders])
  const [step, setStep] = useState(initialVertical ? 2 : 1)
  const [vertical, setVertical] = useState(initialVertical)
  const [name, setName] = useState(profile?.display_name || '')
  const [slug, setSlug] = useState(slugify(profile?.display_name || profile?.username || ''))
  const [slugTouched, setSlugTouched] = useState(false)
  const [editLink, setEditLink] = useState(false)
  const [city, setCity] = useState(profile?.city || '')
  const [picked, setPicked] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const live = useMemo(() => (cats.data ? new Set(cats.data.filter((v) => v.live).map((v) => v.slug)) : null), [cats.data])
  const info = cats.data?.find((v) => v.slug === vertical)
  const meta = verticalMeta(vertical)
  const services = (info?.services || []).filter((s) => s.live)
  const isLive = !!info?.live
  const already = vertical && taken.has(vertical)
  const noun = nounFor(vertical)

  // A second listing gets its own link: suggest one with the vertical in it.
  useEffect(() => {
    if (!slugTouched && vertical && taken.size) setSlug(slugify(`${name || profile?.username || ''} ${vertical}`))
  }, [vertical]) // eslint-disable-line react-hooks/exhaustive-deps

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
      const provider = await becomeProvider({ displayName: name.trim(), slug, city: city.trim(), serviceIds: ids, vertical })
      invalidate('providers')
      await refreshProvider(provider.id)
      toast(meta.visual ? 'You’re set up. Now add your first photos.' : 'You’re set up. Now add a package.')
      onDone({ ...provider, vertical })
    } catch (err) {
      if (err.code === '23505' && /slug/i.test(err.message || '')) {
        setEditLink(true)
        setError('That profile link is taken. Try another.')
      } else if (err.code === '23505') {
        setError('You already have a listing for this service.')
      } else {
        setError(friendlyError(err))
      }
    } finally {
      setBusy(false)
    }
  }

  // ---- step 1: what do you offer? ----
  if (step === 1) {
    return (
      <div className="up-screen">
        <Header title={title || 'List your services'} />
        <div className="pad bp">
          <div className="bp-hero">
            <h2>What do you offer?</h2>
            <p className="muted small">Pick one. You can add more services later, each with its own listing.</p>
          </div>
          {cats.error && <ErrorState error={cats.error} onRetry={cats.reload} />}
          <VerticalGrid value={vertical} onChange={setVertical} live={live} taken={taken} />
        </div>
        <div className="up-footer">
          <button className="btn accent block" disabled={!vertical} onClick={() => setStep(2)}>
            {vertical ? `Continue as a ${noun}` : 'Pick a service'}
          </button>
        </div>
      </div>
    )
  }

  // ---- step 2: details ----
  const back = lockVertical ? undefined : () => setStep(1)
  return (
    <form className="up-screen" onSubmit={save} noValidate>
      <Header title={title || `Become a ${noun}`} onBack={back} />
      <div className="pad bp">
        <div className="bp-hero">
          <VerticalBadge vertical={vertical} size={64} />
          <h2>{meta.visual ? 'Show clients your work' : `Get booked as a ${noun}`}</h2>
          <p className="muted small">
            {meta.visual ? `Set up your ${noun} profile once, then post your work.` : `Set up your ${noun} profile, then add your packages and prices.`} You can change any of this later.
          </p>
        </div>

        {cats.loading && !cats.data ? (
          <Loading inline />
        ) : already ? (
          <div className="callout">
            <b className="small">You already have a {noun} listing.</b>
            <div className="muted small mt-xs">Switch to it from your profile, or pick a different service.</div>
            <div className="row gap-xs mt-sm">
              <Link to="/me" className="btn sm">Go to my profile</Link>
              {!lockVertical && <button type="button" className="btn ghost sm" onClick={() => setStep(1)}>Pick another</button>}
            </div>
          </div>
        ) : !isLive ? (
          <div className="callout coming-soon">
            <div className="inline-icon"><Clock size={16} /> <b>{meta.name} is coming soon</b></div>
            <div className="muted small mt-xs">
              We’re opening {lowerFirst(meta.name)} listings shortly. Check back soon{lockVertical ? '' : ', or pick another service you offer'}.
            </div>
            {!lockVertical && <button type="button" className="btn ghost sm mt-sm" onClick={() => setStep(1)}>Pick another service</button>}
          </div>
        ) : (
          <>
            <label className="field pf-field">
              <span className="pf-label">Name clients will see</span>
              <input className="input" maxLength={80} placeholder={`e.g. ${placeholderName(vertical)}`} value={name} autoComplete="organization"
                onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)) }} />
            </label>
            {editLink ? (
              <label className="field pf-field">
                <span className="pf-label">Profile link</span>
                <div className="input-prefix">
                  <span>photomatch.app/</span>
                  <input value={slug} maxLength={40} autoCapitalize="none" autoCorrect="off" spellCheck={false}
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
              <div className="field pf-field">
                <span className="pf-label">What kinds of {lowerFirst(meta.name)}? <span className="pf-optional">optional</span></span>
                <div className="chips">
                  {services.map((s) => (
                    <button type="button" key={s.slug} className={`chip toggle ${picked.has(s.slug) ? 'on' : ''}`} aria-pressed={picked.has(s.slug)}
                      onClick={() => setPicked((prev) => { const n = new Set(prev); n.has(s.slug) ? n.delete(s.slug) : n.add(s.slug); return n })}>
                      {s.name}
                    </button>
                  ))}
                </div>
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

const PLACEHOLDER_NAMES = {
  photography: 'Alex Rivera Photography', catering: 'Casa Taco Catering', venue: 'The Glasshouse', music: 'DJ Nova',
  florals: 'Wild Poppy Florals', cakes: 'Sugar & Crumb', 'hair-makeup': 'Glow by Dana', planning: 'Golden Hour Events',
}
const placeholderName = (v) => PLACEHOLDER_NAMES[v] || `Your ${lowerFirst(verticalMeta(v).name)} business`
