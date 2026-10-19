import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeftRight, ChevronDown, ChevronUp, Images, Pencil, Plus, RefreshCw, Star, Trash2, Undo2, Wand2 } from 'lucide-react'
import Sheet from '../Sheet.jsx'
import { useAuth } from '../../auth.jsx'
import { useStore } from '../../store.jsx'
import { invalidate } from '../../api/catalog.js'
import {
  convertPost, deleteAlbum, editRecipeSupported, getAlbum, getPostPhotos, getServicesOf, removePostPhoto, reorderPostPhotos,
  replacePostPhoto, setPostCover, toViewerAlbum, updateAlbum, uploadPostPhoto,
} from '../../api/portfolio.js'
import { isHeic, makeDisplayCopy, quickCheck, toDecodable } from '../../lib/images.js'
import { autoPostTitle, postConfig } from '../../verticals/index.js'
import { CaptionField, CategoryField, PlaceDateFields, TitleField, validatePost } from './PostFields.jsx'
import { EditorLayer, editorAvailable, loadEditsApi } from './editorBridge.jsx'

// Owner-only sheets for a post in the viewer: a small menu, the details form, the photos
// manager (re-edit, back to original, replace, reorder, cover, before & after) and the delete
// confirmation. sheet: null | 'menu' | 'edit' | 'photos' | 'delete'.
// album: a viewer album (toViewerAlbum). onUpdated(viewerAlbum), onDeleted(albumId).
// vertical: the listing's vertical slug (else looked up in your listings; photography by default).
export default function ManagePostSheets({ album, sheet, setSheet, onUpdated, onDeleted, vertical = null }) {
  const { myProviders } = useStore()
  const slug = vertical || myProviders?.find((p) => p.id === album.providerId)?.vertical || 'photography'
  const close = () => setSheet(null)
  const count = album.photoCount ?? album.photos?.length ?? 0
  return (
    <>
      <Sheet open={sheet === 'menu'} onClose={close} title="Your post">
        <button className="list-row" onClick={() => setSheet('photos')}>
          <span className="round-icon"><Images size={16} /></span>
          <div className="grow">
            <div className="small"><b>Edit photos</b></div>
            <div className="muted tiny">
              {album.type === 'beforeafter' ? 'Re-edit, swap, or turn back into photos' : count === 1 ? 'Re-edit, replace, or make a before & after' : 'Re-edit, replace, reorder, change the cover'}
            </div>
          </div>
        </button>
        <button className="list-row" onClick={() => setSheet('edit')}>
          <span className="round-icon"><Pencil size={16} /></span>
          <div className="grow">
            <div className="small"><b>Edit details</b></div>
            <div className="muted tiny">Category, title, caption, place and date…</div>
          </div>
        </button>
        <button className="list-row danger" onClick={() => setSheet('delete')}>
          <span className="round-icon"><Trash2 size={16} /></span>
          <div className="grow small"><b>Delete post</b></div>
        </button>
      </Sheet>
      {sheet === 'edit' && <EditSheet album={album} vertical={slug} onClose={close} onSaved={(a) => { onUpdated(a); close() }} />}
      {sheet === 'photos' && <PhotosManager album={album} onClose={close} onUpdated={onUpdated} />}
      {sheet === 'delete' && <DeleteSheet album={album} onClose={close} onDeleted={(id) => { close(); onDeleted(id) }} />}
    </>
  )
}

function EditSheet({ album, vertical, onClose, onSaved }) {
  const { toast } = useStore()
  const post = postConfig(vertical)
  const [title, setTitle] = useState(album.title || '')
  const [categoryId, setCategoryId] = useState(album.categoryId ?? null)
  const [caption, setCaption] = useState(album.caption || '')
  const [place, setPlace] = useState(album.location || '')
  const [shotOn, setShotOn] = useState(album.shotOn || '')
  const [services, setServices] = useState(null)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getServicesOf(vertical).then(setServices).catch(() => setServices([]))
  }, [vertical])

  const fallbackTitle = autoPostTitle({ service: services?.find((s) => s.id === categoryId)?.name })

  const save = async () => {
    const errs = validatePost({ title, categoryId, shotOn })
    if (!album.categoryId) delete errs.category // older posts may have none; don't block a quick fix
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    setError('')
    try {
      const row = await updateAlbum(album.id, {
        title: title.trim() || fallbackTitle, caption, location: place, shotOn, categoryId,
      })
      invalidate('providers')
      toast('Changes saved')
      onSaved(toViewerAlbum(row))
    } catch (err) {
      setError(err.message || 'Couldn’t save. Try again.')
      setBusy(false)
    }
  }

  return (
    <Sheet open onClose={busy ? () => {} : onClose} title="Edit post">
      <div className="mp-form">
        <CategoryField label="What is it?" value={categoryId} onChange={setCategoryId} services={services} error={errors.category} />
        <TitleField value={title} onChange={setTitle} error={errors.title} placeholder={post.title} fallback={categoryId ? fallbackTitle : null} />
        <CaptionField value={caption} onChange={setCaption} placeholder={post.caption} />
        <PlaceDateFields location={place} onLocation={setPlace} shotOn={shotOn} onShotOn={setShotOn} dateError={errors.shotOn} />
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="sheet-actions">
          <button className="btn accent block" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
          <button className="btn ghost block" onClick={onClose} disabled={busy}>Cancel</button>
        </div>
      </div>
    </Sheet>
  )
}

// The original of a posted photo, ready for the editor (HEIC converted when the browser can't read it).
async function originalSource(photo, edits) {
  const src = await edits.loadEditSource(photo.id)
  const res = await fetch(src.url)
  if (!res.ok) throw new Error('Couldn’t load the original. Check your connection and try again.')
  const blob = await res.blob()
  const name = (photo.original_path || photo.display_path || 'photo.jpg').split('/').pop()
  const file = new File([blob], name, { type: blob.type || (isHeic({ name }) ? 'image/heic' : 'image/jpeg') })
  const { file: decodable } = await toDecodable(file)
  return { source: decodable, recipe: src.recipe, fromOriginal: src.fromOriginal }
}

// "Edit photos": every photo of the post with its own actions.
function PhotosManager({ album, onClose, onUpdated }) {
  const { user } = useAuth()
  const { toast } = useStore()
  const [photos, setPhotos] = useState(null)
  const [kind, setKind] = useState(album.kind || (album.type === 'beforeafter' ? 'before_after' : 'album'))
  const [recipes, setRecipes] = useState(true)
  const [busy, setBusy] = useState(null) // { id, what }
  const [error, setError] = useState('')
  const [said, setSaid] = useState('')
  const [editing, setEditing] = useState(null) // { photo, source, recipe, allowPair }
  const [tick, setTick] = useState(0)
  const replaceInput = useRef()
  const beforeInput = useRef()
  const replacing = useRef(null)

  useEffect(() => {
    let live = true
    setError('')
    Promise.all([getPostPhotos(album.id), editRecipeSupported()])
      .then(([rows, ok]) => { if (live) { setPhotos(rows); setRecipes(ok) } })
      .catch((e) => live && setError(e.message || 'Couldn’t load the photos.'))
    return () => { live = false }
  }, [album.id, tick])

  // Run a change, then refresh this list and the viewer.
  const change = async (id, what, fn, done) => {
    setBusy({ id, what })
    setError('')
    try {
      await fn()
      const row = await getAlbum(album.id)
      if (row) {
        setKind(row.kind)
        onUpdated(toViewerAlbum(row))
      }
      invalidate('providers')
      setTick((t) => t + 1)
      if (done) { toast(done); setSaid(done) }
    } catch (err) {
      setError(err.message || 'Couldn’t save that. Try again.')
    } finally {
      setBusy(null)
    }
  }

  const ids = photos?.map((p) => p.id) || []
  const isPair = kind === 'before_after'
  const before = isPair ? photos?.find((p) => p.pair_role === 'before') || photos?.[0] : null
  const after = isPair ? photos?.find((p) => p.pair_role === 'after') || photos?.[1] : null

  const openEditor = async (photo, { allowPair = false } = {}) => {
    setBusy({ id: photo.id, what: 'opening' })
    setError('')
    try {
      const edits = await loadEditsApi()
      if (!edits) throw new Error('Editing isn’t available right now.')
      const src = await originalSource(photo, edits)
      setEditing({ photo, ...src, allowPair })
    } catch (err) {
      setError(err.code === 'no_original' ? 'This photo was posted without its original, so it can’t be re-edited. Replace it instead.' : err.message || 'Couldn’t open the editor.')
    } finally {
      setBusy(null)
    }
  }

  const finishEdit = async (res) => {
    const { photo, source, allowPair } = editing
    setEditing(null)
    if (!res?.blob) return
    const edits = await loadEditsApi()
    if (allowPair && res.makeBeforeAfter) {
      // One photo → before & after: the original (shared, not uploaded again) is the before.
      return change(photo.id, 'saving', async () => {
        await edits.saveEdit(photo.id, { recipe: res.recipe, blob: res.blob, width: res.width, height: res.height })
        const added = await uploadPostPhoto({
          userId: user.id, albumId: album.id, position: 0, originalPath: photo.original_path,
          hiddenFields: photo.exif_hidden || [], item: { file: source, display: await makeDisplayCopy(source), settings: photo.exif || {}, pairRole: 'before' },
        })
        await convertPost(album.id, 'before_after', { beforeId: added.photoId, afterId: photo.id })
      }, 'Now a before & after')
    }
    return change(photo.id, 'saving', () => edits.saveEdit(photo.id, { recipe: res.recipe, blob: res.blob, width: res.width, height: res.height }), 'Edit saved')
  }

  const revert = (photo) => change(photo.id, 'reverting', async () => {
    const edits = await loadEditsApi()
    if (!edits) throw new Error('Editing isn’t available right now.')
    // Render the original here (it may be a HEIC the shared renderer can't read).
    const { source } = await originalSource(photo, edits)
    const copy = await makeDisplayCopy(source)
    await edits.revertEdit(photo.id, { blob: copy.blob, width: copy.width, height: copy.height })
  }, 'Back to the original')

  const pickReplacement = (photo) => {
    replacing.current = photo
    replaceInput.current.click()
  }
  const onReplaceFile = (file) => {
    const photo = replacing.current
    if (!file || !photo) return
    const bad = quickCheck(file)
    if (bad) return setError(bad)
    change(photo.id, 'replacing', () => replacePostPhoto({ userId: user.id, albumId: album.id, photo, photos, item: { file } }), 'Photo replaced')
  }
  const onBeforeFile = (file) => {
    const after = photos?.[0]
    if (!file || !after) return
    const bad = quickCheck(file)
    if (bad) return setError(bad)
    change(after.id, 'saving', async () => {
      const added = await uploadPostPhoto({ userId: user.id, albumId: album.id, position: 0, item: { file, pairRole: 'before' }, hiddenFields: after.exif_hidden || [] })
      await convertPost(album.id, 'before_after', { beforeId: added.photoId, afterId: after.id })
    }, 'Now a before & after')
  }

  const move = (i, to) => {
    const next = [...ids]
    const [x] = next.splice(i, 1)
    next.splice(to, 0, x)
    change(ids[i], 'moving', () => reorderPostPhotos(album.id, next), `Moved to position ${to + 1}${to === 0 ? ', now the cover' : ''}`)
  }

  const label = (p, i) => (isPair ? (p.pair_role === 'before' ? 'Before' : 'After') : i === 0 ? (photos.length > 1 ? 'Cover' : 'Photo') : `Photo ${i + 1}`)
  const disabled = !!busy

  if (editing) {
    return createPortal(
      <EditorLayer source={editing.source} initialRecipe={editing.recipe} mode="reedit" allowBeforeAfter={editing.allowPair}
        onDone={finishEdit} onCancel={() => setEditing(null)} />,
      document.getElementById('phone') || document.body,
    )
  }

  return (
    <Sheet open onClose={busy ? () => {} : onClose} title="Edit photos">
      <input ref={replaceInput} type="file" accept="image/*,.heic,.heif" hidden onChange={(e) => { onReplaceFile(e.target.files[0]); e.target.value = '' }} />
      <input ref={beforeInput} type="file" accept="image/*,.heic,.heif" hidden onChange={(e) => { onBeforeFile(e.target.files[0]); e.target.value = '' }} />
      <div className="sr-only" role="status" aria-live="polite">{said}</div>
      {error && <div className="form-error mb-sm" role="alert">{error}</div>}
      {!photos ? (
        !error && <div className="muted small" role="status">Loading photos…</div>
      ) : (
        <div className="mpp">
          {isPair && photos.length === 2 && (
            <div className="mpp-kind">
              <span className="muted tiny grow">Before & after: the slider compares the two.</span>
              <button type="button" className="link-btn small" disabled={disabled}
                onClick={() => change(before.id, 'saving', () => convertPost(album.id, 'before_after', { beforeId: after.id, afterId: before.id }), 'Before and after swapped')}>
                <ArrowLeftRight size={14} aria-hidden="true" /> Swap
              </button>
              <button type="button" className="link-btn small" disabled={disabled}
                onClick={() => change(before.id, 'saving', () => convertPost(album.id, 'album', { beforeId: before.id, afterId: after.id }), 'Now a post with 2 photos')}>
                Make 2 photos
              </button>
            </div>
          )}
          {!isPair && photos.length === 2 && (
            <div className="mpp-kind">
              <span className="muted tiny grow">Two shots of the same scene?</span>
              <button type="button" className="link-btn small accent" disabled={disabled}
                onClick={() => change(photos[0].id, 'saving', () => convertPost(album.id, 'before_after', { beforeId: photos[1].id, afterId: photos[0].id }), 'Now a before & after')}>
                <ArrowLeftRight size={14} aria-hidden="true" /> Make a before & after
              </button>
            </div>
          )}
          <ul className="mpp-list">
            {photos.map((p, i) => {
              const rowBusy = busy?.id === p.id
              const edited = !!p.edit_recipe
              return (
                <li key={p.id} className="mpp-row" aria-busy={rowBusy || undefined}>
                  <img className="mpp-thumb" src={p.src} alt="" />
                  <div className="grow mpp-main">
                    <div className="small"><b>{label(p, i)}</b>{edited && <span className="mpp-tag">Edited</span>}</div>
                    <div className="muted tiny">{rowBusy ? `${busy.what[0].toUpperCase()}${busy.what.slice(1)}…` : `${p.width || '?'} × ${p.height || '?'}`}</div>
                    <div className="mpp-actions">
                      {editorAvailable && (
                        <button type="button" className="mpp-btn" disabled={disabled} onClick={() => openEditor(p, { allowPair: !isPair && photos.length === 1 })} aria-label={`Edit ${label(p, i).toLowerCase()}`}>
                          <Wand2 size={14} aria-hidden="true" /> Edit
                        </button>
                      )}
                      {p.original_path && (edited || !recipes) && (
                        <button type="button" className="mpp-btn" disabled={disabled} onClick={() => revert(p)} aria-label={`Restore the original of ${label(p, i).toLowerCase()}`}>
                          <Undo2 size={14} aria-hidden="true" /> Original
                        </button>
                      )}
                      <button type="button" className="mpp-btn" disabled={disabled} onClick={() => pickReplacement(p)} aria-label={`Replace ${label(p, i).toLowerCase()}`}>
                        <RefreshCw size={14} aria-hidden="true" /> Replace
                      </button>
                      {!isPair && i > 0 && (
                        <button type="button" className="mpp-btn" disabled={disabled} onClick={() => change(p.id, 'moving', () => setPostCover(album.id, ids, p.id), 'Cover changed')} aria-label={`Make photo ${i + 1} the cover`}>
                          <Star size={14} aria-hidden="true" /> Cover
                        </button>
                      )}
                      {!isPair && photos.length > 1 && (
                        <button type="button" className="mpp-btn danger" disabled={disabled}
                          onClick={() => change(p.id, 'removing', () => removePostPhoto(album.id, p, photos), 'Photo removed')} aria-label={`Remove ${label(p, i).toLowerCase()}`}>
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                  {!isPair && photos.length > 1 && (
                    <div className="mpp-order">
                      <button type="button" className="icon-btn" disabled={disabled || i === 0} onClick={() => move(i, i - 1)} aria-label={`Move ${label(p, i).toLowerCase()} earlier`}><ChevronUp size={18} /></button>
                      <button type="button" className="icon-btn" disabled={disabled || i === photos.length - 1} onClick={() => move(i, i + 1)} aria-label={`Move ${label(p, i).toLowerCase()} later`}><ChevronDown size={18} /></button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {!isPair && photos.length === 1 && (
            <button type="button" className="list-row mpp-add" disabled={disabled} onClick={() => beforeInput.current.click()}>
              <span className="round-icon"><Plus size={16} /></span>
              <div className="grow">
                <div className="small"><b>Add a before photo</b></div>
                <div className="muted tiny">Turns this post into a before & after{editorAvailable ? '. Or use Edit → “Post as before & after”.' : '.'}</div>
              </div>
            </button>
          )}
          {!recipes && <p className="muted tiny mt-sm">Edits are applied, but can’t be reopened step by step until the database update for edits is in.</p>}
        </div>
      )}
      <div className="sheet-actions">
        <button className="btn ghost block" onClick={onClose} disabled={disabled}>Done</button>
      </div>
    </Sheet>
  )
}

function DeleteSheet({ album, onClose, onDeleted }) {
  const { toast } = useStore()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const count = album.photoCount ?? album.photos?.length ?? 0
  const what = album.type === 'beforeafter' ? 'before & after pair' : count === 1 ? 'photo' : `${count} photos`

  const remove = async () => {
    setBusy(true)
    setError('')
    try {
      await deleteAlbum(album.id)
      invalidate('providers')
      toast('Post deleted')
      onDeleted(album.id)
    } catch (err) {
      setError(err.message || 'Couldn’t delete. Try again.')
      setBusy(false)
    }
  }

  return (
    <Sheet open onClose={busy ? () => {} : onClose} title="Delete this post?">
      <div className="mp-delete">
        {album.cover && <img src={album.cover} alt="" />}
        <div className="grow">
          <div className="small"><b>{album.title}</b></div>
          <div className="muted tiny">The {what} will be removed from your portfolio for good. This can’t be undone.</div>
        </div>
      </div>
      {error && <div className="form-error mt-sm" role="alert">{error}</div>}
      <div className="sheet-actions">
        <button className="btn danger-solid block" onClick={remove} disabled={busy}>{busy ? 'Deleting…' : 'Delete post'}</button>
        <button className="btn ghost block" onClick={onClose} disabled={busy}>Cancel</button>
      </div>
    </Sheet>
  )
}
