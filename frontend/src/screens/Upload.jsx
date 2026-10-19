import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft, ImagePlus, Lock, MapPinOff, RotateCcw, Wand2, X } from 'lucide-react'
import Segmented from '../components/Segmented.jsx'
import useDocumentTitle from '../components/useDocumentTitle.js'
import Sheet from '../components/Sheet.jsx'
import { ErrorState, Loading, SignInPrompt } from '../components/States.jsx'
import VerticalIcon from '../components/verticals/VerticalIcon.jsx'
import PhotoPicker from '../components/upload/PhotoPicker.jsx'
import usePhotoItems from '../components/upload/usePhotoItems.js'
import usePostQueue from '../components/upload/usePostQueue.js'
import { loadQueue } from '../components/upload/uploadQueue.js'
import { EditorLayer, editorAvailable } from '../components/upload/editorBridge.jsx'
import EditAllSheet from '../components/upload/EditAllSheet.jsx'
import CameraSettings, { SETTING_FIELDS, readFields, settingsSummary } from '../components/upload/CameraSettings.jsx'
import { CaptionField, CategoryField, Disclosure, PlaceDateFields, TitleField, prettyDay, validatePost } from '../components/upload/PostFields.jsx'
import ListingPicker from '../components/upload/ListingPicker.jsx'
import { PostFailed, Posted, Posting } from '../components/upload/PostingStatus.jsx'
import { useAuth } from '../auth.jsx'
import { useStore } from '../store.jsx'
import { invalidate } from '../api/catalog.js'
import { getMyProviders, getProviderServiceIds, getServicesOf, suggestPostTitle } from '../api/portfolio.js'
import { isHeic } from '../lib/images.js'
import { postConfig } from '../verticals/index.js'
import '../components/upload/upload.css'

const lastCategoryKey = (providerId) => `pm:last-category:${providerId}`
const readLast = (key) => {
  try { return localStorage.getItem(key) } catch { return null }
}
const writeLast = (key, value) => {
  try { localStorage.setItem(key, value) } catch { /* private mode */ }
}

// Every camera setting (for a config that turns camera settings off: none are kept).
const ALL_SETTINGS = SETTING_FIELDS.map(([key]) => key)

// Post photo & video work to your listing. Signed-in photographers only: people without a
// listing get a short explanation and a way to set one up. Camera settings (EXIF) are always
// offered. Accounts with two listings (from the multi-vendor days) pick which one it's for.
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
        <SignInPrompt title="Sign in to post your work" text="Share your photos and stills on your listing so clients can find and book you." />
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
  if (!providers.length) return <NotAPhotographer />
  const initial = providers.find((p) => p.id === selectedId) || providers[0]
  return <Composer providers={providers} initialId={initial.id} userId={user.id} />
}

// Same look as TopBar, with a custom back action (and an optional close icon).
function Header({ title, subtitle, onBack, close = false, right }) {
  useDocumentTitle(title)
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
      <h1 className="topbar-title">
        <span className="topbar-name">{title}</span>
        {subtitle && <small>{subtitle}</small>}
      </h1>
      <div className="topbar-side right">{right}</div>
    </header>
  )
}

// Signed in, but no listing: posting is for photographers.
function NotAPhotographer() {
  const navigate = useNavigate()
  const location = useLocation()
  const back = () => (location.key === 'default' ? navigate('/', { replace: true }) : navigate(-1))
  return (
    <div className="up-screen">
      <Header title="New post" close onBack={back} />
      <div className="pad uv">
        <div className="uv-icon"><VerticalIcon name="Camera" size={28} /></div>
        <h2 className="uv-title">Posting is for photographers</h2>
        <p className="muted small uv-text">
          Posts show off a photographer’s or videographer’s work on their listing, so clients can see it and book them.
        </p>
        <p className="small uv-text">Shoot photo or video? Set up a free listing in about a minute, then post your work.</p>
        <div className="uv-actions">
          <Link to="/new-listing" className="btn accent block">Set up your listing</Link>
          <button type="button" className="btn ghost block" onClick={back}>Not now</button>
        </div>
        <div className="muted tiny uv-foot">Looking to book someone? <Link to="/search" className="accent-text">Find a photographer</Link></div>
      </div>
    </div>
  )
}

const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files')
const photoWord = (n) => (n === 1 ? '1 photo' : `${n} photos`)

// ---------------------------------------------------------------------------
// The composer: 1) photos (+ editing), 2) details, then posting
// ---------------------------------------------------------------------------
function Composer({ providers, initialId, userId }) {
  const navigate = useNavigate()
  const location = useLocation()
  const photos = usePhotoItems()
  const queue = usePostQueue(userId)
  const { job } = queue
  const { items } = photos

  const [providerId, setProviderId] = useState(initialId)
  const provider = providers.find((p) => p.id === providerId) || providers[0]
  const vertical = provider.vertical || 'photography'
  const post = postConfig(vertical)

  const [step, setStep] = useState(1)
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
  const [preparing, setPreparing] = useState(false)
  const [editing, setEditing] = useState(null) // { id, pair }
  const [editAll, setEditAll] = useState(false)
  const [saved, setSaved] = useState(null) // an unfinished upload from before (IndexedDB)
  const [said, setSaid] = useState('') // screen reader announcements
  const body = useRef()
  const openPicker = useRef(null)
  const announce = useCallback((text) => {
    setSaid('')
    requestAnimationFrame(() => setSaid(text))
  }, [])

  // An upload that didn't finish last time (tab closed, connection lost)?
  useEffect(() => {
    let live = true
    loadQueue(userId).then((rec) => live && setSaved(rec && rec.items.some((it) => it.state !== 'done') ? rec : null))
    return () => { live = false }
  }, [userId])

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

  // Switching listing (accounts with two listings).
  const switchListing = (id) => {
    const next = providers.find((p) => p.id === id)
    if (!next || id === providerId) return
    setProviderId(id)
    setErrors({})
    if (!postConfig(next.vertical).beforeAfter && mode === 'before_after') setMode('photos')
    if (!place.trim() || place === provider.city) setPlace(next.city || '')
  }

  const switchMode = (m) => {
    if (m === mode) return
    setMode(m)
    photos.clearNotice()
    if (m === 'photos') photos.dropPairs() // a before made from an edit isn't a photo of its own
  }

  // The photos in this post (before/after uses the first two).
  const used = mode === 'before_after' ? items.slice(0, 2) : items
  const ready = used.length > 0 && used.every((i) => i.status === 'ready')
  const canContinue = ready && (mode === 'before_after' ? used.length === 2 : true)
  const kindLabel = mode === 'before_after' ? 'before & after' : 'post'
  const editedCount = used.filter((i) => i.edited).length

  // Event date from the photos (earliest), unless you've set it yourself.
  const exifDate = useMemo(() => used.map((i) => i.settings?.taken_on).filter(Boolean).sort()[0] || '', [used])
  useEffect(() => {
    if (!dateTouched) setShotOn(exifDate)
  }, [exifDate, dateTouched])

  const fields = useMemo(() => (post.showCamera ? readFields(used) : []), [used, post.showCamera])
  const serviceName = services?.find((s) => s.id === categoryId)?.name
  const suggestion = suggestPostTitle({ service: serviceName, shotOn, location: place })

  // Warn before closing the tab with unposted photos (or mid-upload).
  const dirty = (items.length > 0 && job?.phase !== 'done') || (job && !['done', 'failed'].includes(job.phase))
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

  const addFiles = useCallback((files) => {
    const ids = photos.add(files, { max: mode === 'before_after' ? 2 : undefined })
    if (ids.length) {
      announce(`${photoWord(ids.length)} added.`)
      if (step !== 1) goStep(1)
    }
  }, [photos, mode, step, announce])

  // Drop files anywhere in the window, or paste them (while composing).
  const composing = !job && !editing
  useEffect(() => {
    if (!composing) return
    let depth = 0
    const enter = (e) => { if (hasFiles(e)) { depth++; setDropping(true) } }
    const over = (e) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
    const leaveWin = (e) => { if (hasFiles(e) && --depth <= 0) { depth = 0; setDropping(false) } }
    const drop = (e) => {
      depth = 0
      setDropping(false)
      if (!hasFiles(e)) return
      e.preventDefault()
      addFiles(e.dataTransfer.files)
    }
    const paste = (e) => {
      const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/') || isHeic(f))
      if (!files.length) return
      e.preventDefault()
      addFiles(files)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leaveWin)
    window.addEventListener('drop', drop)
    window.addEventListener('paste', paste)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leaveWin)
      window.removeEventListener('drop', drop)
      window.removeEventListener('paste', paste)
    }
  }, [composing, addFiles])

  // ---- editing ----
  const editingItem = editing && items.find((i) => i.id === editing.id)
  const openEditor = editorAvailable ? (item, { pair = false } = {}) => setEditing({ id: item.id, pair }) : null
  const finishEdit = async (res) => {
    const { id, pair } = editing
    setEditing(null)
    if (!res?.blob) return
    try {
      if (pair || res.makeBeforeAfter) {
        await photos.makePair(id, res)
        setMode('before_after')
        announce('Before & after made: the original is the before, your edit the after.')
      } else if (!res.recipe) {
        photos.clearEdit(id) // nothing changed (or everything reset): the original
      } else {
        await photos.setEdit(id, res)
        announce('Edit saved.')
      }
    } catch (err) {
      announce(`Couldn’t use that edit: ${err.message}`)
    }
  }

  // ---- posting ----
  const startPosting = async () => {
    const errs = validatePost({ title, categoryId, shotOn })
    setErrors(errs)
    if (Object.keys(errs).length) {
      if (errs.shotOn) setOpenMore(true)
      setTimeout(() => body.current?.querySelector('[aria-invalid=true], .field-hint')?.closest('.field')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0)
      return
    }
    setPreparing(true)
    try {
      const files = await photos.forUpload(used)
      await queue.start({
        providerId: provider.id,
        kind: mode === 'before_after' ? 'before_after' : 'album',
        meta: { title: title.trim() || suggestion, caption: caption.trim(), location: place.trim(), shotOn, categoryId },
        hiddenFields: post.showCamera ? [...hidden] : ALL_SETTINGS,
        items: used.map((it, i) => ({
          key: it.id, name: it.name, thumbUrl: it.thumbUrl, ...files[i],
          pairRole: mode === 'before_after' ? (i === 0 ? 'before' : 'after') : null,
        })),
      })
    } finally {
      setPreparing(false)
    }
    scrollTop()
  }

  // Remember the category; refresh lists once posted.
  useEffect(() => {
    if (job?.phase !== 'done') return
    if (categoryId) writeLast(lastCategoryKey(job.providerId || provider.id), categoryId)
    invalidate('providers')
  }, [job?.phase]) // eslint-disable-line react-hooks/exhaustive-deps

  const postAnother = () => {
    photos.reset()
    queue.reset()
    setTitle('')
    setCaption('')
    setDateTouched(false)
    setHidden(new Set())
    setErrors({})
    setOpenMore(false)
    setOpenCamera(false)
    setMode('photos')
    goStep(1)
  }

  const cancelPosting = async () => {
    await queue.cancel()
    announce('Posting cancelled. Nothing was published; your photos are still here.')
  }

  const resumeSaved = () => {
    const rec = saved
    setSaved(null)
    queue.resume(rec)
  }
  const discardSaved = () => {
    const rec = saved
    setSaved(null)
    queue.discardSaved(rec)
    announce('Unfinished post discarded.')
  }

  const live = <div className="sr-only" role="status" aria-live="polite">{said}</div>

  // ---- posting / done / failed ----
  if (job) {
    const jobKind = job.kind === 'before_after' ? 'before & after' : 'post'
    const coverItem = job.list[job.kind === 'before_after' ? 1 : 0] || job.list[0]
    const busy = ['creating', 'posting', 'publishing', 'cancelling'].includes(job.phase)
    return (
      <div className="up-screen" ref={body}>
        <Header title="New post" onBack={busy ? false : job.phase === 'done' ? leave : job.phase === 'failed' ? queue.reset : false}
          close={job.phase === 'done'} />
        {['creating', 'posting', 'publishing', 'partial', 'cancelling'].includes(job.phase) && (
          <Posting job={job} kindLabel={jobKind} onRetry={queue.retry} onCancel={cancelPosting} onPublishPartial={queue.publishPartial} />
        )}
        {job.phase === 'done' && (
          <Posted cover={coverItem?.thumbUrl} kindLabel={jobKind} partial={job.partial} viewTo={`/gallery/${job.providerId}?post=${job.albumId}`} onAnother={postAnother}
            share={{ kind: 'post', id: job.albumId, providerId: job.providerId, title: job.title, subtitle: provider.display_name, image: coverItem?.thumbUrl }} />
        )}
        {job.phase === 'failed' && (
          <PostFailed error={job.error} onRetry={job.gone || job.resumed ? null : startPosting} onEdit={queue.reset} />
        )}
        {live}
      </div>
    )
  }

  const countLine = (n) => photoWord(n)
  const subtitle = used.length ? (mode === 'before_after' ? 'Before & after' : countLine(used.length)) : providers.length > 1 ? null : provider.display_name
  const moreSummary = [place.trim(), prettyDay(shotOn), caption.trim() && 'caption added'].filter(Boolean).join(' · ')
  const shownCount = fields.filter((f) => !hidden.has(f.key)).length
  const savedDone = saved ? saved.items.filter((it) => it.state === 'done').length : 0

  return (
    <>
      <div className="up-screen" ref={body} inert={editing ? '' : undefined}>
        <Header title="New post" subtitle={subtitle} onBack={onBack} close={step === 1} />
        <div className="up-steps" role="group" aria-label={`Step ${step} of 2`}>
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
            {saved && (
              <section className="up-resume" aria-label="Unfinished post">
                {saved.items[0]?.thumb && <ResumeThumb blob={saved.items[saved.kind === 'before_after' ? 1 : 0]?.thumb || saved.items[0].thumb} />}
                <div className="grow">
                  <b className="small">Finish posting “{saved.meta?.title || 'your post'}”?</b>
                  <div className="muted tiny">
                    {savedDone ? `${savedDone} of ${saved.items.length} photos went up before it stopped.` : `${photoWord(saved.items.length)} didn’t finish uploading.`}
                  </div>
                  <div className="up-resume-actions">
                    <button type="button" className="btn sm accent" onClick={resumeSaved}><RotateCcw size={14} aria-hidden="true" /> Resume</button>
                    <button type="button" className="btn sm ghost" onClick={discardSaved}>Discard</button>
                  </div>
                </div>
              </section>
            )}
            {post.beforeAfter && (
              <Segmented
                className="up-mode"
                label="Post type"
                options={[{ value: 'photos', label: 'Photos' }, { value: 'before_after', label: 'Before & after' }]}
                value={mode}
                onChange={switchMode}
              />
            )}
            <div className={post.beforeAfter ? 'mt' : ''}>
              <PhotoPicker mode={mode} photos={photos} copy={post} onEdit={openEditor} announce={announce} pickerRef={openPicker} />
            </div>
            {mode === 'photos' && used.length > 1 && editorAvailable && (
              <button type="button" className="link-btn small up-editall" onClick={() => setEditAll(true)} disabled={!ready} aria-haspopup="dialog">
                <Wand2 size={14} aria-hidden="true" /> Edit all: apply one look to every photo
              </button>
            )}
          </div>
        ) : (
          <div className="pad up-body up-details">
            <button type="button" className="up-summary" onClick={() => goStep(1)}>
              <span className="up-summary-thumbs">
                {used.slice(0, 3).map((it, i) => <img key={it.id} src={it.thumbUrl} alt="" style={{ zIndex: 3 - i }} />)}
              </span>
              <span className="grow">
                <b className="small">{mode === 'before_after' ? 'Before & after' : countLine(used.length)}</b>
                <span className="muted tiny block">
                  {mode === 'before_after' ? 'Before first, then after' : used.length > 1 ? 'First photo is the cover' : 'Ready to post'}
                  {editedCount ? ` · ${editedCount} edited` : ''}
                </span>
              </span>
              <span className="link-btn accent small">Change</span>
            </button>

            <CategoryField label="What is it?" value={categoryId} services={services} error={errors.category}
              onChange={(v) => { setCategoryId(v); errors.category && setErrors((e) => ({ ...e, category: undefined })) }} />
            <TitleField value={title} onChange={(v) => { setTitle(v); errors.title && setErrors((e) => ({ ...e, title: undefined })) }} error={errors.title}
              placeholder={post.title} fallback={suggestion} onUseFallback={() => setTitle(suggestion)} />

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
              <div><MapPinOff size={14} aria-hidden="true" /> GPS location is never read, and it’s stripped from what clients see.</div>
              <div><Lock size={14} aria-hidden="true" /> Your full-size originals are stored privately{editedCount ? ', so you can re-edit later' : ''}.</div>
            </div>
          </div>
        )}

        {(step === 2 || items.length > 0) && <div className="up-footer">
          {step === 1 ? (
            <button className="btn accent block" disabled={!canContinue} onClick={() => goStep(2)}>
              {items.some((i) => i.status === 'loading') ? 'Reading photos…' : mode === 'before_after' && used.length === 1 ? 'Add the after photo' : 'Next'}
            </button>
          ) : (
            <button className="btn accent block" onClick={startPosting} disabled={preparing}>
              {preparing ? 'Getting photos ready…' : mode === 'before_after' ? 'Post before & after' : `Post${used.length > 1 ? ` ${used.length} photos` : ''}`}
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
          <p className="muted small">The photos{editedCount ? ', edits' : ''} and details you’ve added won’t be saved.</p>
          <div className="sheet-actions">
            <button className="btn danger-solid block" onClick={() => { setDiscarding(false); photos.reset(); leave() }}>Discard</button>
            <button className="btn ghost block" onClick={() => setDiscarding(false)}>Keep editing</button>
          </div>
        </Sheet>
        {editAll && <EditAllSheet photos={photos} items={used} onClose={() => setEditAll(false)} announce={announce} />}
        {live}
      </div>

      {editing && editingItem && createPortal(
        <EditorLayer
          source={editingItem.source || editingItem.file}
          initialRecipe={editingItem.recipe}
          mode="post"
          allowBeforeAfter={mode === 'photos' || editing.pair}
          onDone={finishEdit}
          onCancel={() => setEditing(null)}
        />,
        document.getElementById('phone') || document.body,
      )}
    </>
  )
}

function ResumeThumb({ blob }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url ? <img className="up-resume-thumb" src={url} alt="" /> : null
}
