import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Camera, Eye, EyeOff, ImagePlus, Lock, MapPinOff, X } from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import Segmented from '../components/Segmented.jsx'
import { BeforeAfter } from '../components/Media.jsx'
import { useAuth } from '../auth.jsx'
import { useStore } from '../store.jsx'
import { readCameraSettings } from '../lib/images.js'
import { becomeProvider, getMyProvider, getPhotographyServices, postAlbum, slugify } from '../api/portfolio.js'

const KINDS = {
  single: { label: 'Single', max: 1, db: 'album' },
  album: { label: 'Album', max: 10, db: 'album' },
  before_after: { label: 'Before / After', max: 2, db: 'before_after' },
}

const SETTING_FIELDS = [
  ['body', 'Camera'], ['lens', 'Lens'], ['focal', 'Focal length'], ['aperture', 'Aperture'],
  ['shutter', 'Shutter'], ['iso', 'ISO'], ['flash', 'Flash'], ['taken_on', 'Date taken'],
]

// Post work to your portfolio. Signed-in users only; the first time, it sets up
// the photographer listing that albums belong to.
export default function Upload() {
  const { user, profile, loading } = useAuth()
  const [provider, setProvider] = useState(undefined) // undefined = loading, null = none yet
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    if (!user) return
    getMyProvider(user.id)
      .then(setProvider)
      .catch((e) => {
        setLoadError(e.message)
        setProvider(null)
      })
  }, [user])

  if (!loading && !user) return <Navigate to="/sign-in?next=/upload" replace />

  return (
    <div>
      <TopBar title={provider === null ? 'Set up your profile' : 'New post'} />
      {loading || provider === undefined ? (
        <div className="center-col pad"><div className="spinner" /></div>
      ) : provider === null ? (
        <BecomePhotographer profile={profile} onDone={setProvider} loadError={loadError} />
      ) : (
        <PostForm provider={provider} userId={user.id} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// First time only: create the photographer listing
// ---------------------------------------------------------------------------
function BecomePhotographer({ profile, onDone, loadError }) {
  const [name, setName] = useState(profile?.display_name || '')
  const [slug, setSlug] = useState(slugify(profile?.display_name || profile?.username || ''))
  const [slugTouched, setSlugTouched] = useState(false)
  const [city, setCity] = useState(profile?.city || '')
  const [services, setServices] = useState([])
  const [picked, setPicked] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(loadError)

  useEffect(() => {
    getPhotographyServices().then(setServices).catch((e) => setError(e.message))
  }, [])

  const slugOk = /^[a-z0-9-]{3,40}$/.test(slug)

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      onDone(await becomeProvider({ displayName: name.trim(), slug, city: city.trim(), serviceIds: [...picked] }))
    } catch (err) {
      setError(err.code === '23505' ? 'That profile link is taken. Try another.' : err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="pad" onSubmit={save} noValidate>
      <div className="note">
        <Camera size={16} />
        Photos are posted to a photographer profile that clients can find and book. Set yours up once; you can change it later.
      </div>
      <label className="field mt">
        <span>Name clients will see</span>
        <input className="input" maxLength={80} placeholder="Alex Rivera Photography" value={name}
          onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)) }} />
      </label>
      <label className="field mt-sm">
        <span>Profile link</span>
        <div className="input-prefix">
          <span>photomatch.app/</span>
          <input value={slug} maxLength={40} autoCapitalize="none"
            onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)) }} />
        </div>
        {slug && !slugOk && <small className="field-hint">3–40 characters: letters, numbers and dashes.</small>}
      </label>
      <label className="field mt-sm">
        <span>City</span>
        <input className="input" maxLength={80} placeholder="Los Angeles, CA" value={city} onChange={(e) => setCity(e.target.value)} />
      </label>
      <div className="field mt-sm">
        <span>What do you shoot?</span>
        <div className="chips mt-xs">
          {services.map((s) => (
            <button type="button" key={s.id} className={`chip toggle ${picked.has(s.id) ? 'on' : ''}`}
              onClick={() => setPicked((prev) => { const n = new Set(prev); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n })}>
              {s.name}
            </button>
          ))}
        </div>
      </div>
      {error && <div className="form-error mt" role="alert">{error}</div>}
      <button className="btn accent block mt-lg" disabled={busy || !name.trim() || !slugOk}>
        {busy ? 'Setting up…' : 'Create photographer profile'}
      </button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// The post form
// ---------------------------------------------------------------------------
function PostForm({ provider, userId }) {
  const navigate = useNavigate()
  const { toast } = useStore()
  const fileInput = useRef()
  const [kind, setKind] = useState('album')
  const [items, setItems] = useState([]) // [{ id, file, url }]
  const [settings, setSettings] = useState(null) // camera settings of the first photo
  const [hidden, setHidden] = useState(new Set())
  const [title, setTitle] = useState('')
  const [caption, setCaption] = useState('')
  const [location, setLocation] = useState(provider.city || '')
  const [shotOn, setShotOn] = useState('')
  const [categoryId, setCategoryId] = useState(null)
  const [services, setServices] = useState([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null) // { done, total }
  const [error, setError] = useState('')

  const max = KINDS[kind].max
  const ready = kind === 'before_after' ? items.length === 2 : items.length > 0

  useEffect(() => {
    getPhotographyServices().then(setServices).catch(() => {})
  }, [])

  // Free the preview URLs when photos are removed or the screen closes.
  const urls = useRef(new Set())
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), [])

  // Read camera settings from the first photo (and use its date as the shoot date).
  const firstFile = items[0]?.file
  useEffect(() => {
    if (!firstFile) {
      setSettings(null)
      return
    }
    let alive = true
    readCameraSettings(firstFile).then((s) => {
      if (!alive) return
      setSettings(s)
      if (s.taken_on) setShotOn((d) => d || s.taken_on)
    })
    return () => { alive = false }
  }, [firstFile])

  const addFiles = (fileList) => {
    const incoming = [...fileList].filter((f) => f.type.startsWith('image/'))
    const base = max === 1 ? [] : items  // a single photo is replaced, not added to
    const room = max - base.length
    const added = incoming.slice(0, room).map((file) => {
      const url = URL.createObjectURL(file)
      urls.current.add(url)
      return { id: crypto.randomUUID(), file, url }
    })
    setError(incoming.length > room ? `You can add up to ${max} photo${max > 1 ? 's' : ''} here.` : '')
    setItems([...base, ...added])
  }

  const remove = (id) => {
    const gone = items.find((i) => i.id === id)
    if (gone) {
      URL.revokeObjectURL(gone.url)
      urls.current.delete(gone.url)
    }
    setItems(items.filter((i) => i.id !== id))
  }

  const changeKind = (k) => {
    setKind(k)
    setItems((prev) => prev.slice(0, KINDS[k].max))
    setError('')
  }

  const toggleHidden = (key) =>
    setHidden((prev) => {
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })

  const post = async () => {
    if (!title.trim()) {
      setError('Give your post a title.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const albumId = await postAlbum({
        userId,
        providerId: provider.id,
        kind: KINDS[kind].db,
        title: title.trim(),
        caption: caption.trim(),
        location: location.trim(),
        shotOn,
        categoryId,
        files: items.map((i) => i.file),
        hiddenFields: [...hidden],
        onProgress: (done, total) => setProgress({ done, total }),
      })
      toast('Posted to your portfolio')
      navigate(`/my-work?post=${albumId}`, { replace: true })
    } catch (err) {
      setError(`Couldn’t post: ${err.message}`)
      setBusy(false)
      setProgress(null)
    }
  }

  const settingRows = useMemo(() => SETTING_FIELDS.filter(([k]) => settings?.[k]), [settings])

  return (
    <div className="pad upload">
      <Segmented
        options={Object.entries(KINDS).map(([value, k]) => ({ value, label: k.label }))}
        value={kind}
        onChange={changeKind}
      />

      <input ref={fileInput} type="file" accept="image/*" multiple={max > 1} hidden
        onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />

      {/* Preview */}
      <div className="mt">
        {kind === 'before_after' && items.length === 2 ? (
          <BeforeAfter src={items[1].url} beforeSrc={items[0].url} aspect="1 / 1" />
        ) : items.length === 0 ? (
          <button className="upload-drop" onClick={() => fileInput.current.click()}>
            <ImagePlus size={32} />
            <b>{kind === 'before_after' ? 'Add the before photo, then the after' : kind === 'album' ? 'Add photos from one shoot' : 'Add a photo'}</b>
            <span className="muted tiny">JPEG, PNG or WebP · {kind === 'album' ? 'up to 10' : kind === 'before_after' ? '2 photos' : '1 photo'}</span>
          </button>
        ) : (
          <div className={`upload-grid ${items.length === 1 ? 'one' : ''}`}>
            {items.map((it, i) => (
              <div key={it.id} className="upload-thumb">
                <img src={it.url} alt="" />
                <span className="upload-num">{kind === 'before_after' ? (i === 0 ? 'Before' : 'After') : i + 1}</span>
                <button className="upload-remove" onClick={() => remove(it.id)} aria-label="Remove photo"><X size={14} /></button>
              </div>
            ))}
            {items.length < max && (
              <button className="upload-add" onClick={() => fileInput.current.click()} aria-label="Add photos">
                <ImagePlus size={22} />
              </button>
            )}
          </div>
        )}
        {items.length > 0 && (
          <div className="row between mt-xs">
            <span className="muted tiny">{kind === 'before_after' ? 'First photo = before, second = after' : `${items.length} of ${max}`}</span>
            {items.length < max && kind !== 'single' && (
              <button className="link-btn tiny" onClick={() => fileInput.current.click()}>Add more</button>
            )}
          </div>
        )}
      </div>

      <label className="field mt">
        <span>Title</span>
        <input className="input" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === 'album' ? 'e.g. Nguyen–Park wedding' : 'e.g. Golden hour portrait'} />
      </label>

      <div className="field mt-sm">
        <span>Category</span>
        <div className="chips mt-xs">
          {services.map((s) => (
            <button type="button" key={s.id} className={`chip toggle ${categoryId === s.id ? 'on' : ''}`}
              onClick={() => setCategoryId(categoryId === s.id ? null : s.id)}>
              {s.name}
            </button>
          ))}
        </div>
      </div>

      <label className="field mt-sm">
        <span>Caption</span>
        <textarea className="input" rows={3} maxLength={2200} value={caption} onChange={(e) => setCaption(e.target.value)}
          placeholder="Tell clients about this shoot" />
      </label>

      <div className="row gap-xs mt-sm">
        <label className="field grow">
          <span>Location</span>
          <input className="input" maxLength={120} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City or venue" />
        </label>
        <label className="field">
          <span>Date</span>
          <input className="input" type="date" value={shotOn} onChange={(e) => setShotOn(e.target.value)} />
        </label>
      </div>

      {items.length > 0 && (
        <>
          <h4 className="section-title">Camera settings</h4>
          {settingRows.length === 0 ? (
            <div className="muted small">No camera settings found in this photo.</div>
          ) : (
            <>
              <div className="muted tiny">Read from your photos. Tap the eye to hide anything you’d rather not show.</div>
              <div className="exif-edit">
                {settingRows.map(([key, label]) => (
                  <div key={key} className={`exif-edit-row ${hidden.has(key) ? 'hidden' : ''}`}>
                    <label>{label}</label>
                    <input value={settings[key]} readOnly />
                    <button className="icon-btn" onClick={() => toggleHidden(key)} aria-label={hidden.has(key) ? `Show ${label}` : `Hide ${label}`}>
                      {hidden.has(key) ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="note mt-sm"><MapPinOff size={16} /> GPS location is removed from the photos clients see.</div>
          <div className="note mt-xs"><Lock size={16} /> Your full-size originals are stored privately and never shown.</div>
        </>
      )}

      {error && <div className="form-error mt" role="alert">{error}</div>}

      <button className="btn accent block mt-lg" disabled={busy || !ready || !title.trim()} onClick={post}>
        {busy
          ? progress ? `Uploading ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…` : 'Posting…'
          : 'Post to portfolio'}
      </button>
      {busy && progress && (
        <div className="progress mt-sm"><div style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
      )}
    </div>
  )
}
