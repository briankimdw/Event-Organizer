import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft, ImagePlus, Lock, MapPinOff, Store, X } from 'lucide-react'
import Segmented from '../components/Segmented.jsx'
import Sheet from '../components/Sheet.jsx'
import { ErrorState, Loading, SignInPrompt } from '../components/States.jsx'
import VerticalIcon from '../components/verticals/VerticalIcon.jsx'
import PhotoPicker from '../components/upload/PhotoPicker.jsx'
import usePhotoItems from '../components/upload/usePhotoItems.js'
import CameraSettings, { SETTING_FIELDS, readFields, settingsSummary } from '../components/upload/CameraSettings.jsx'
import { CaptionField, CategoryField, Disclosure, OccasionField, PlaceDateFields, TitleField, prettyDay, validatePost } from '../components/upload/PostFields.jsx'
import { CreditsField } from '../components/upload/Credits.jsx'
import ListingPicker from '../components/upload/ListingPicker.jsx'
import { Posted, PostFailed, Posting } from '../components/upload/PostingStatus.jsx'
import { useAuth } from '../auth.jsx'
import { useStore } from '../store.jsx'
import { invalidate } from '../api/catalog.js'
import { creditsSupported, getMyProviders, getProviderServiceIds, getServicesOf, postAlbum } from '../api/portfolio.js'
import { autoPostTitle, getOccasion, occasionsFor, postConfig } from '../verticals/index.js'
import '../components/upload/upload.css'

const lastCategoryKey = (providerId) => `pm:last-category:${providerId}`
const readLast = (key) => {
  try { return localStorage.getItem(key) } catch { return null }
}
const writeLast = (key, value) => {
  try { localStorage.setItem(key, value) } catch { /* private mode */ }
}

// Camera settings are only kept for photo / video work; other vendors' posts save none.
const ALL_SETTINGS = SETTING_FIELDS.map(([key]) => key)

const friendlyError = (err) => {
  const msg = err?.message || ''
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return 'Network problem. Check your connection and try again.'
  if (/jwt|not authenticated|row-level security/i.test(msg)) return 'Your session expired. Sign in again, then retry.'
  return msg || 'Something went wrong.'
}

// Post work to one of your listings. Signed-in vendors only: people without a listing get
// a short explanation and a way to set one up. The post's wording, categories and options
// follow the listing's vertical; with several listings you pick which one it's for
// (starting with the one selected on the Me tab).
export default function Upload() {
  const { user, loading } = useAuth()
  const { myProvider } = useStore()
  const selectedId = myProvider?.id ?? null
  const [providers, setProviders] = useState(undefined) // undefined = loading
  const [loadError, setLoadError] = useState(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!user) return
    let live = true
    setLoadError(null)
    getMyProviders(user.id)
      .then((list) => live && setProviders(list))
      .catch((e) => live && setLoadError(e))
    return () => { live = false }
  }, [user, tick])

  if (!loading && !user) {
    return (
      <div className="up-screen">
        <Header title="New post" />
        <SignInPrompt title="Sign in to post your work" text="Share your work on your listing so people planning an event can find and book you." />
      </div>
    )
  }
  if (loadError) {
    return (
      <div className="up-screen">
        <Header title="New post" />
        <ErrorState error={loadError} onRetry={() => setTick((t) => t + 1)} />
      </div>
    )
  }
  if (loading || providers === undefined) {
    return (
      <div className="up-screen">
        <Header title="New post" />
        <Loading />
      </div>
    )
  }
  if (!providers.length) return <NotAVendor />
  const initial = providers.find((p) => p.id === selectedId) || providers[0]
  return <Composer providers={providers} initialId={initial.id} userId={user.id} />
}

// Same look as TopBar, with a custom back action (and an optional close icon).
function Header({ title, subtitle, onBack, close = false, right }) {
  const navigate = useNavigate()
  const location = useLocation()
  const back = onBack ?? (() => (location.key === 'default' ? navigate('/me', { replace: true }) : navigate(-1)))
  return (
    <header className="topbar">
      <div className="topbar-side">
        {back && (
          <button className="icon-btn" onClick={back} aria-label={close ? 'Close' : 'Back'}>
            {close ? <X size={22} /> : <ChevronLeft size={24} />}
          </button>
        )}
      </div>
      <div className="topbar-title">
        <div>{title}</div>
        {subtitle && <small>{subtitle}</small>}
      </div>
      <div className="topbar-side right">{right}</div>
    </header>
  )
}

// Signed in, but no listing: posting is for vendors.
function NotAVendor() {
  const navigate = useNavigate()
  const location = useLocation()
  const back = () => (location.key === 'default' ? navigate('/', { replace: true }) : navigate(-1))
  const examples = [
    ['UtensilsCrossed', '#f97316', 'A caterer’s dishes'],
    ['Building', '#0ea5e9', 'A venue’s spaces'],
    ['Flower2', '#f43f5e', 'A florist’s arrangements'],
    ['Camera', '#6366f1', 'A photographer’s shoots'],
  ]
  return (
    <div className="up-screen">
      <Header title="New post" close onBack={back} />
      <div className="pad uv">
        <div className="uv-icon"><Store size={28} /></div>
        <h2 className="uv-title">Posting is for vendors</h2>
        <p className="muted small uv-text">
          Posts show off a vendor’s work on their listing, so people planning an event can see it and book them.
        </p>
        <div className="uv-examples">
          {examples.map(([icon, tint, text]) => (
            <div key={text} className="uv-example">
              <span className="lp-icon" style={{ '--tint': tint }}><VerticalIcon name={icon} size={15} /></span>
              <span className="small">{text}</span>
            </div>
          ))}
        </div>
        <p className="small uv-text">Offer a service? Set up a free listing in about a minute, then post your work.</p>
        <div className="uv-actions">
          <Link to="/new-listing" className="btn accent block">Set up a listing</Link>
          <button type="button" className="btn ghost block" onClick={back}>Not now</button>
        </div>
        <div className="muted tiny uv-foot">Planning an event? <Link to="/search" className="accent-text">Find vendors</Link></div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The composer: 1) photos, 2) details, then posting
// ---------------------------------------------------------------------------
function Composer({ providers, initialId, userId }) {
  const navigate = useNavigate()
  const location = useLocation()
  const photos = usePhotoItems()
  const { items } = photos

  const [providerId, setProviderId] = useState(initialId)
  const provider = providers.find((p) => p.id === providerId) || providers[0]
  const vertical = provider.vertical || 'photography'
  const post = postConfig(vertical)
  const occasions = useMemo(() => occasionsFor(vertical), [vertical])

  const [step, setStep] = useState(1)
  const [phase, setPhase] = useState('edit') // edit | posting | done | failed
  const [mode, setMode] = useState('photos') // photos | before_after
  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState(null)
  const [occasion, setOccasion] = useState(null)
  const [credits, setCredits] = useState([])
  const [canCredit, setCanCredit] = useState(false)
  const [caption, setCaption] = useState('')
  const [place, setPlace] = useState(provider.city || '')
  const [shotOn, setShotOn] = useState('')
  const [dateTouched, setDateTouched] = useState(false)
  const [hidden, setHidden] = useState(new Set())
  const [services, setServices] = useState(null)
  const [errors, setErrors] = useState({})
  const [openMore, setOpenMore] = useState(false)
  const [openCamera, setOpenCamera] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const [dropping, setDropping] = useState(false)
  const [posting, setPosting] = useState(null) // { list, perPhoto, error, albumId, cover }
  const body = useRef()

  // Credits need the album_credits table (a migration); hide them until it's there.
  useEffect(() => {
    let live = true
    creditsSupported().then((ok) => live && setCanCredit(ok)).catch(() => {})
    return () => { live = false }
  }, [])

  // The listing's categories, and a sensible default: the last one used, or the only one it offers.
  useEffect(() => {
    let live = true
    setServices(null)
    setCategoryId(null)
    Promise.all([getServicesOf(vertical), getProviderServiceIds(provider.id).catch(() => [])])
      .then(([all, mine]) => {
        if (!live) return
        // The listing's own services first.
        setServices([...all.filter((s) => mine.includes(s.id)), ...all.filter((s) => !mine.includes(s.id))])
        const last = readLast(lastCategoryKey(provider.id))
        const pick = all.some((s) => s.id === last) ? last : mine.length === 1 ? mine[0] : all.length === 1 ? all[0].id : null
        if (pick) setCategoryId(pick)
      })
      .catch(() => live && setServices([]))
    return () => { live = false }
  }, [provider.id, vertical])

  // Switching listing: drop what the new vertical doesn't offer.
  const switchListing = (id) => {
    const next = providers.find((p) => p.id === id)
    if (!next || id === providerId) return
    setProviderId(id)
    setErrors({})
    setCredits((list) => list.filter((c) => c.providerId !== id))
    if (!postConfig(next.vertical).beforeAfter && mode === 'before_after') setMode('photos')
    if (!place.trim() || place === provider.city) setPlace(next.city || '')
  }

  // The photos in this post (before/after uses the first two).
  const used = mode === 'before_after' ? items.slice(0, 2) : items
  const ready = used.length > 0 && used.every((i) => i.status === 'ready')
  const canContinue = ready && (mode === 'before_after' ? used.length === 2 : true)
  const kindLabel = mode === 'before_after' ? 'before & after' : 'post'

  // Event date from the photos (earliest), unless you've set it yourself.
  const exifDate = useMemo(() => used.map((i) => i.settings?.taken_on).filter(Boolean).sort()[0] || '', [used])
  useEffect(() => {
    if (!dateTouched) setShotOn(exifDate)
  }, [exifDate, dateTouched])

  const fields = useMemo(() => (post.showCamera ? readFields(used) : []), [used, post.showCamera])
  const serviceName = services?.find((s) => s.id === categoryId)?.name
  const fallbackTitle = autoPostTitle({ service: serviceName, occasion: getOccasion(occasion)?.name, slug: vertical })

  // Warn before closing the tab with unposted photos (or mid-upload).
  const dirty = items.length > 0 && phase !== 'done'
  useEffect(() => {
    if (!dirty) return
    const onUnload = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [dirty])

  const scrollTop = () => body.current?.closest('.viewport')?.scrollTo({ top: 0 })
  const goStep = (n) => {
    setStep(n)
    scrollTop()
  }
  const leave = () => (location.key === 'default' ? navigate('/me', { replace: true }) : navigate(-1))
  const onBack = () => {
    if (step === 2) return goStep(1)
    if (items.length) return setDiscarding(true)
    leave()
  }

  const toggleHidden = (key) =>
    setHidden((prev) => {
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })

  // Drag & drop files anywhere on the composer (desktop).
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files')
  const dropProps = phase === 'edit' ? {
    onDragOver: (e) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setDropping(true)
    },
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setDropping(false)
    },
    onDrop: (e) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      setDropping(false)
      photos.add(e.dataTransfer.files, { max: mode === 'before_after' ? 2 : undefined })
      if (step !== 1) goStep(1)
    },
  } : {}

  const post_ = async () => {
    const errs = validatePost({ title, categoryId, shotOn })
    setErrors(errs)
    if (Object.keys(errs).length) {
      if (errs.shotOn) setOpenMore(true)
      setTimeout(() => body.current?.querySelector('[aria-invalid=true], .field-hint')?.closest('.field')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0)
      return
    }
    const list = used
    setPosting({ list, perPhoto: [], error: '', albumId: null, cover: list[mode === 'before_after' ? 1 : 0]?.processed?.url || list[0]?.thumbUrl })
    setPhase('posting')
    scrollTop()
    try {
      const files = await photos.forUpload(list)
      const albumId = await postAlbum({
        userId,
        providerId: provider.id,
        kind: mode === 'before_after' ? 'before_after' : 'album',
        title: title.trim() || fallbackTitle,
        caption: caption.trim(),
        location: place.trim(),
        shotOn,
        categoryId,
        occasion,
        credits: canCredit ? credits : [],
        files,
        hiddenFields: post.showCamera ? [...hidden] : ALL_SETTINGS,
        onPhotoProgress: (i, p) => setPosting((s) => {
          const perPhoto = [...s.perPhoto]
          perPhoto[i] = p
          return { ...s, perPhoto }
        }),
      })
      writeLast(lastCategoryKey(provider.id), categoryId)
      invalidate('providers')
      setPosting((s) => ({ ...s, albumId }))
      setPhase('done')
    } catch (err) {
      console.warn(err)
      setPosting((s) => ({ ...s, error: friendlyError(err) }))
      setPhase('failed')
    }
  }

  const postAnother = () => {
    photos.reset()
    setTitle('')
    setCaption('')
    setOccasion(null)
    setCredits([])
    setDateTouched(false)
    setHidden(new Set())
    setErrors({})
    setOpenMore(false)
    setOpenCamera(false)
    setMode('photos')
    setPosting(null)
    setPhase('edit')
    goStep(1)
  }

  // ---- posting / done / failed ----
  if (phase !== 'edit') {
    return (
      <div className="up-screen" ref={body}>
        <Header title="New post" onBack={phase === 'posting' ? false : phase === 'failed' ? () => setPhase('edit') : leave} close={phase === 'done'} />
        {phase === 'posting' && <Posting items={posting.list} perPhoto={posting.perPhoto} kindLabel={kindLabel} />}
        {phase === 'done' && (
          <Posted cover={posting.cover} kindLabel={kindLabel} viewTo={`/gallery/${provider.id}?post=${posting.albumId}`} onAnother={postAnother} />
        )}
        {phase === 'failed' && <PostFailed error={posting.error} onRetry={post_} onEdit={() => setPhase('edit')} />}
      </div>
    )
  }

  const countLine = (n) => (n === 1 ? '1 photo' : `${n} photos`)
  const subtitle = used.length ? (mode === 'before_after' ? 'Before & after' : countLine(used.length)) : providers.length > 1 ? null : provider.display_name
  const moreSummary = [place.trim(), prettyDay(shotOn), caption.trim() && 'caption added'].filter(Boolean).join(' · ')
  const shownCount = fields.filter((f) => !hidden.has(f.key)).length

  return (
    <div className="up-screen" ref={body} {...dropProps}>
      <Header title="New post" subtitle={subtitle} onBack={onBack} close={step === 1} />
      <div className="up-steps" aria-label={`Step ${step} of 2`}>
        <button type="button" className={`up-step ${step >= 1 ? 'on' : ''}`} onClick={() => goStep(1)} aria-current={step === 1 ? 'step' : undefined}>
          <span className="up-step-bar" /><span>1 · Photos</span>
        </button>
        <button type="button" className={`up-step ${step >= 2 ? 'on' : ''}`} onClick={() => canContinue && goStep(2)} disabled={!canContinue} aria-current={step === 2 ? 'step' : undefined}>
          <span className="up-step-bar" /><span>2 · Details</span>
        </button>
      </div>

      {providers.length > 1 && (
        <div className="up-listing">
          <ListingPicker providers={providers} value={provider.id} onChange={switchListing} />
        </div>
      )}

      {step === 1 ? (
        <div className="pad up-body">
          {post.beforeAfter && (
            <Segmented
              className="up-mode"
              options={[{ value: 'photos', label: 'Photos' }, { value: 'before_after', label: 'Before / After' }]}
              value={mode}
              onChange={(m) => { setMode(m); photos.clearNotice() }}
            />
          )}
          <div className={post.beforeAfter ? 'mt' : ''}>
            <PhotoPicker mode={mode} photos={photos} copy={post} />
          </div>
        </div>
      ) : (
        <div className="pad up-body up-details">
          <button type="button" className="up-summary" onClick={() => goStep(1)}>
            <span className="up-summary-thumbs">
              {used.slice(0, 3).map((it, i) => <img key={it.id} src={it.thumbUrl} alt="" style={{ zIndex: 3 - i }} />)}
            </span>
            <span className="grow">
              <b className="small">{mode === 'before_after' ? 'Before & after' : countLine(used.length)}</b>
              <span className="muted tiny block">{mode === 'before_after' ? 'Before first, then after' : used.length > 1 ? 'First photo is the cover' : 'Ready to post'}</span>
            </span>
            <span className="link-btn accent small">Edit</span>
          </button>

          <CategoryField label="What is it?" value={categoryId} services={services} error={errors.category}
            onChange={(v) => { setCategoryId(v); errors.category && setErrors((e) => ({ ...e, category: undefined })) }} />
          <OccasionField value={occasion} onChange={setOccasion} occasions={occasions} />
          <TitleField value={title} onChange={(v) => { setTitle(v); errors.title && setErrors((e) => ({ ...e, title: undefined })) }} error={errors.title}
            placeholder={post.title} fallback={categoryId ? fallbackTitle : null} />
          {canCredit && <CreditsField value={credits} onChange={setCredits} exclude={[provider.id]} />}

          <Disclosure title="More details" badge={<span className="pf-optional">optional</span>} summary={moreSummary || 'Caption, location, date'}
            open={openMore} onToggle={() => setOpenMore((o) => !o)}>
            <CaptionField value={caption} onChange={setCaption} placeholder={post.caption} />
            <PlaceDateFields location={place} onLocation={setPlace} shotOn={shotOn}
              onShotOn={(v) => { setShotOn(v); setDateTouched(true); errors.shotOn && setErrors((e) => ({ ...e, shotOn: undefined })) }}
              dateError={errors.shotOn} dateHint={!dateTouched && exifDate ? 'Date read from your photos.' : null} />
          </Disclosure>

          {post.showCamera && (
            <Disclosure title="Camera settings"
              badge={fields.length ? <span className="pf-optional">{shownCount} of {fields.length} shown</span> : null}
              summary={fields.length ? settingsSummary(fields, hidden) || 'All hidden' : 'None found in these photos'}
              open={openCamera} onToggle={() => setOpenCamera((o) => !o)}>
              <CameraSettings fields={fields} hidden={hidden} onToggle={toggleHidden} />
            </Disclosure>
          )}

          <div className="up-trust">
            <div><MapPinOff size={14} /> GPS location is never read, and it’s stripped from what clients see.</div>
            <div><Lock size={14} /> Your full-size originals are stored privately.</div>
          </div>
        </div>
      )}

      {(step === 2 || items.length > 0) && <div className="up-footer">
        {step === 1 ? (
          <button className="btn accent block" disabled={!canContinue} onClick={() => goStep(2)}>
            {items.some((i) => i.status === 'loading') ? 'Reading photos…' : mode === 'before_after' && used.length === 1 ? 'Add the after photo' : 'Next'}
          </button>
        ) : (
          <button className="btn accent block" onClick={post_}>
            {mode === 'before_after' ? 'Post before & after' : 'Post'}
          </button>
        )}
      </div>}

      {dropping && (
        <div className="up-dropping" aria-hidden="true">
          <ImagePlus size={30} />
          <b>Drop to add photos</b>
        </div>
      )}

      <Sheet open={discarding} onClose={() => setDiscarding(false)} title="Discard this post?">
        <p className="muted small">The photos and details you’ve added won’t be saved.</p>
        <div className="sheet-actions">
          <button className="btn danger-solid block" onClick={() => { setDiscarding(false); photos.reset(); leave() }}>Discard</button>
          <button className="btn ghost block" onClick={() => setDiscarding(false)}>Keep editing</button>
        </div>
      </Sheet>
    </div>
  )
}
