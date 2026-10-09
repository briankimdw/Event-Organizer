import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Camera, ChevronLeft, ImagePlus, Lock, MapPinOff, X } from 'lucide-react'
import Segmented from '../components/Segmented.jsx'
import Sheet from '../components/Sheet.jsx'
import { ErrorState, Loading, SignInPrompt } from '../components/States.jsx'
import PhotoPicker from '../components/upload/PhotoPicker.jsx'
import usePhotoItems from '../components/upload/usePhotoItems.js'
import CameraSettings, { readFields, settingsSummary } from '../components/upload/CameraSettings.jsx'
import { CaptionField, CategoryField, Disclosure, PlaceDateFields, TitleField, prettyDay, validatePost } from '../components/upload/PostFields.jsx'
import { Posted, PostFailed, Posting } from '../components/upload/PostingStatus.jsx'
import { useAuth } from '../auth.jsx'
import { useStore } from '../store.jsx'
import { invalidate } from '../api/catalog.js'
import { becomeProvider, getMyProvider, getPhotographyServices, getProviderServiceIds, postAlbum, slugify } from '../api/portfolio.js'

const lastCategoryKey = (providerId) => `pm:last-category:${providerId}`
const readLast = (key) => {
  try { return localStorage.getItem(key) } catch { return null }
}
const writeLast = (key, value) => {
  try { localStorage.setItem(key, value) } catch { /* private mode */ }
}

const friendlyError = (err) => {
  const msg = err?.message || ''
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return 'Network problem. Check your connection and try again.'
  if (/jwt|not authenticated|row-level security/i.test(msg)) return 'Your session expired. Sign in again, then retry.'
  return msg || 'Something went wrong.'
}

// Post work to your portfolio. Signed-in users only; the first time, it sets up
// the photographer listing that albums belong to.
export default function Upload() {
  const { user, profile, loading } = useAuth()
  const [provider, setProvider] = useState(undefined) // undefined = loading, null = none yet
  const [loadError, setLoadError] = useState(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!user) return
    let live = true
    setLoadError(null)
    getMyProvider(user.id)
      .then((p) => live && setProvider(p))
      .catch((e) => live && setLoadError(e))
    return () => { live = false }
  }, [user, tick])

  if (!loading && !user) {
    return (
      <div className="up-screen">
        <Header title="New post" />
        <SignInPrompt title="Sign in to post your work" text="Share your shoots on your photographer profile so clients can find and book you." />
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
  if (loading || provider === undefined) {
    return (
      <div className="up-screen">
        <Header title="New post" />
        <Loading />
      </div>
    )
  }
  if (provider === null) return <BecomePhotographer profile={profile} onDone={setProvider} />
  return <Composer provider={provider} userId={user.id} />
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

// ---------------------------------------------------------------------------
// First time only: create the photographer listing
// ---------------------------------------------------------------------------
function BecomePhotographer({ profile, onDone }) {
  const { refreshProvider, toast } = useStore()
  const [name, setName] = useState(profile?.display_name || '')
  const [slug, setSlug] = useState(slugify(profile?.display_name || profile?.username || ''))
  const [slugTouched, setSlugTouched] = useState(false)
  const [editLink, setEditLink] = useState(false)
  const [city, setCity] = useState(profile?.city || '')
  const [services, setServices] = useState(null)
  const [picked, setPicked] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getPhotographyServices().then(setServices).catch(() => setServices([]))
  }, [])

  const slugOk = /^[a-z0-9-]{3,40}$/.test(slug)
  const ready = name.trim().length > 0 && slugOk

  const save = async (e) => {
    e.preventDefault()
    if (!ready) {
      setError(!name.trim() ? 'Add the name clients will see.' : 'Your profile link needs 3–40 letters, numbers or dashes.')
      if (!slugOk) setEditLink(true)
      return
    }
    setBusy(true)
    setError('')
    try {
      const provider = await becomeProvider({ displayName: name.trim(), slug, city: city.trim(), serviceIds: [...picked] })
      await refreshProvider()
      invalidate('providers')
      toast('You’re set up. Now add your first photos.')
      onDone(provider)
    } catch (err) {
      if (err.code === '23505') {
        setEditLink(true)
        setError('That profile link is taken. Try another.')
      } else {
        setError(friendlyError(err))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="up-screen" onSubmit={save} noValidate>
      <Header title="Become a photographer" />
      <div className="pad bp">
        <div className="bp-hero">
          <span className="bp-icon"><Camera size={26} /></span>
          <h2>Show clients your work</h2>
          <p className="muted small">Set up your photographer profile once, then post your shoots. You can change any of this later.</p>
        </div>

        <label className="field pf-field">
          <span className="pf-label">Name clients will see</span>
          <input className="input" maxLength={80} placeholder="Alex Rivera Photography" value={name} autoComplete="organization"
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

        <div className="field pf-field">
          <span className="pf-label">What do you shoot? <span className="pf-optional">optional</span></span>
          <div className="chips">
            {services === null ? <span className="muted tiny">Loading…</span> : services.map((s) => (
              <button type="button" key={s.id} className={`chip toggle ${picked.has(s.id) ? 'on' : ''}`} aria-pressed={picked.has(s.id)}
                onClick={() => setPicked((prev) => { const n = new Set(prev); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n })}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
      </div>
      <div className="up-footer">
        <button className="btn accent block" disabled={busy}>{busy ? 'Setting up…' : 'Continue'}</button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// The composer: 1) photos, 2) details, then posting
// ---------------------------------------------------------------------------
function Composer({ provider, userId }) {
  const navigate = useNavigate()
  const location = useLocation()
  const photos = usePhotoItems()
  const { items } = photos

  const [step, setStep] = useState(1)
  const [phase, setPhase] = useState('edit') // edit | posting | done | failed
  const [mode, setMode] = useState('photos') // photos | before_after
  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState(null)
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

  // Categories, and a sensible default: the last one used, or the only one offered.
  useEffect(() => {
    let live = true
    Promise.all([getPhotographyServices(), getProviderServiceIds(provider.id).catch(() => [])])
      .then(([all, mine]) => {
        if (!live) return
        // The photographer's own services first.
        setServices([...all.filter((s) => mine.includes(s.id)), ...all.filter((s) => !mine.includes(s.id))])
        const last = readLast(lastCategoryKey(provider.id))
        const pick = all.some((s) => s.id === last) ? last : mine.length === 1 ? mine[0] : null
        if (pick) setCategoryId((c) => c ?? pick)
      })
      .catch(() => live && setServices([]))
    return () => { live = false }
  }, [provider.id])

  // The photos in this post (before/after uses the first two).
  const used = mode === 'before_after' ? items.slice(0, 2) : items
  const ready = used.length > 0 && used.every((i) => i.status === 'ready')
  const canContinue = ready && (mode === 'before_after' ? used.length === 2 : true)
  const kindLabel = mode === 'before_after' ? 'before & after' : used.length === 1 ? 'photo' : 'album'

  // Shoot date from the photos (earliest), unless you've set it yourself.
  const exifDate = useMemo(() => used.map((i) => i.settings?.taken_on).filter(Boolean).sort()[0] || '', [used])
  useEffect(() => {
    if (!dateTouched) setShotOn(exifDate)
  }, [exifDate, dateTouched])

  const fields = useMemo(() => readFields(used), [used])

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

  const post = async () => {
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
        title: title.trim(),
        caption: caption.trim(),
        location: place.trim(),
        shotOn,
        categoryId,
        files,
        hiddenFields: [...hidden],
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
        {phase === 'failed' && <PostFailed error={posting.error} onRetry={post} onEdit={() => setPhase('edit')} />}
      </div>
    )
  }

  const subtitle = used.length
    ? mode === 'before_after' ? 'Before & after' : used.length === 1 ? 'Single photo' : `Album · ${used.length} photos`
    : null
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

      {step === 1 ? (
        <div className="pad up-body">
          <Segmented
            className="up-mode"
            options={[{ value: 'photos', label: 'Photos' }, { value: 'before_after', label: 'Before / After' }]}
            value={mode}
            onChange={(m) => { setMode(m); photos.clearNotice() }}
          />
          <div className="mt">
            <PhotoPicker mode={mode} photos={photos} />
          </div>
        </div>
      ) : (
        <div className="pad up-body up-details">
          <button type="button" className="up-summary" onClick={() => goStep(1)}>
            <span className="up-summary-thumbs">
              {used.slice(0, 3).map((it, i) => <img key={it.id} src={it.thumbUrl} alt="" style={{ zIndex: 3 - i }} />)}
            </span>
            <span className="grow">
              <b className="small">{mode === 'before_after' ? 'Before & after' : used.length === 1 ? 'Single photo' : `Album · ${used.length} photos`}</b>
              <span className="muted tiny block">{mode === 'before_after' ? 'Before first, then after' : used.length > 1 ? 'First photo is the cover' : 'Ready to post'}</span>
            </span>
            <span className="link-btn accent small">Edit</span>
          </button>

          <TitleField value={title} onChange={(v) => { setTitle(v); errors.title && setErrors((e) => ({ ...e, title: undefined })) }} error={errors.title}
            placeholder={used.length > 1 ? 'e.g. Nguyen–Park wedding' : 'e.g. Golden hour portrait'} />
          <CategoryField value={categoryId} services={services} error={errors.category}
            onChange={(v) => { setCategoryId(v); errors.category && setErrors((e) => ({ ...e, category: undefined })) }} />

          <Disclosure title="More details" badge={<span className="pf-optional">optional</span>} summary={moreSummary || 'Caption, location, shoot date'}
            open={openMore} onToggle={() => setOpenMore((o) => !o)}>
            <CaptionField value={caption} onChange={setCaption} />
            <PlaceDateFields location={place} onLocation={setPlace} shotOn={shotOn}
              onShotOn={(v) => { setShotOn(v); setDateTouched(true); errors.shotOn && setErrors((e) => ({ ...e, shotOn: undefined })) }}
              dateError={errors.shotOn} dateHint={!dateTouched && exifDate ? 'Date read from your photos.' : null} />
          </Disclosure>

          <Disclosure title="Camera settings"
            badge={fields.length ? <span className="pf-optional">{shownCount} of {fields.length} shown</span> : null}
            summary={fields.length ? settingsSummary(fields, hidden) || 'All hidden' : 'None found in these photos'}
            open={openCamera} onToggle={() => setOpenCamera((o) => !o)}>
            <CameraSettings fields={fields} hidden={hidden} onToggle={toggleHidden} />
          </Disclosure>

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
          <button className="btn accent block" onClick={post}>
            Post {kindLabel === 'before & after' ? 'before & after' : kindLabel}
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
