import { useEffect, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import Sheet from '../Sheet.jsx'
import { useStore } from '../../store.jsx'
import { invalidate } from '../../api/catalog.js'
import { deleteAlbum, getPhotographyServices, toViewerAlbum, updateAlbum } from '../../api/portfolio.js'
import { CaptionField, CategoryField, PlaceDateFields, TitleField, validatePost } from './PostFields.jsx'

// Owner-only sheets for a post in the viewer: a small menu, the edit form and the
// delete confirmation. sheet: null | 'menu' | 'edit' | 'delete'.
// album: a viewer album (toViewerAlbum). onUpdated(viewerAlbum), onDeleted(albumId).
export default function ManagePostSheets({ album, sheet, setSheet, onUpdated, onDeleted }) {
  const close = () => setSheet(null)
  return (
    <>
      <Sheet open={sheet === 'menu'} onClose={close} title="Your post">
        <button className="list-row" onClick={() => setSheet('edit')}>
          <span className="round-icon"><Pencil size={16} /></span>
          <div className="grow">
            <div className="small"><b>Edit details</b></div>
            <div className="muted tiny">Title, category, caption, location, date</div>
          </div>
        </button>
        <button className="list-row danger" onClick={() => setSheet('delete')}>
          <span className="round-icon"><Trash2 size={16} /></span>
          <div className="grow small"><b>Delete post</b></div>
        </button>
      </Sheet>
      {sheet === 'edit' && <EditSheet album={album} onClose={close} onSaved={(a) => { onUpdated(a); close() }} />}
      {sheet === 'delete' && <DeleteSheet album={album} onClose={close} onDeleted={(id) => { close(); onDeleted(id) }} />}
    </>
  )
}

function EditSheet({ album, onClose, onSaved }) {
  const { toast } = useStore()
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
    getPhotographyServices().then(setServices).catch(() => setServices([]))
  }, [])

  const save = async () => {
    const errs = validatePost({ title, categoryId, shotOn })
    if (!album.categoryId) delete errs.category // older posts may have none; don't block a quick fix
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    setError('')
    try {
      const row = await updateAlbum(album.id, { title, caption, location: place, shotOn, categoryId })
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
        <TitleField value={title} onChange={setTitle} error={errors.title} />
        <CategoryField value={categoryId} onChange={setCategoryId} services={services} error={errors.category} />
        <CaptionField value={caption} onChange={setCaption} />
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
