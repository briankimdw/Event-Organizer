import { useRef, useState } from 'react'
import {
  AlertCircle, AlertTriangle, ArrowLeftRight, ChevronLeft, ChevronRight, ClipboardPaste, ImagePlus, Plus, Star, Trash2, Undo2, Wand2, X,
} from 'lucide-react'
import { MAX_FILE_BYTES, MAX_PHOTOS, formatBytes } from '../../lib/images.js'
import { PairPreview } from './editorBridge.jsx'

// Step 1 of posting: pick photos, put them in order, choose the cover, edit.
// mode: 'photos' (1 = single, 2+ = album) or 'before_after'. photos: usePhotoItems().
// copy: the vertical's postConfig() (headline and ideas for the empty state).
// onEdit(item, { pair }): open the editor on a photo (pair: make a before & after from it);
// null when the editor isn't available. announce(text): screen reader message.
export default function PhotoPicker({ mode, photos, copy = null, onEdit = null, announce = () => {}, pickerRef = null }) {
  const { items, rejected, notice, add, dismissRejected } = photos
  const pickAny = useRef()
  const pickSlot = useRef()
  const [slot, setSlot] = useState(null) // before/after slot being replaced
  const max = mode === 'before_after' ? 2 : MAX_PHOTOS

  const openPicker = () => pickAny.current.click()
  if (pickerRef) pickerRef.current = openPicker
  const openSlot = (i) => {
    setSlot(i)
    pickSlot.current.click()
  }

  return (
    <div className="pp">
      <input ref={pickAny} type="file" accept="image/*,.heic,.heif" multiple hidden data-testid="pick-photos"
        onChange={(e) => { add(e.target.files, { max }); e.target.value = '' }} />
      <input ref={pickSlot} type="file" accept="image/*,.heic,.heif" hidden data-testid="pick-slot"
        onChange={(e) => { add(e.target.files, { max, at: slot }); e.target.value = '' }} />

      {(notice || rejected.length > 0) && (
        <div className="pp-alerts">
          {notice && <div className="pp-notice" role="status">{notice}</div>}
          {rejected.length > 0 && (
            <div className="pp-rejected" role="alert">
              {rejected.map((r) => (
                <div key={r.id} className="pp-rejected-row">
                  <AlertCircle size={16} aria-hidden="true" />
                  <div className="grow">
                    <div className="pp-rejected-name">{r.name}</div>
                    <div className="tiny">{r.reason}</div>
                  </div>
                  <button className="icon-btn" onClick={() => dismissRejected(r.id)} aria-label={`Dismiss ${r.name}`}><X size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <DropZone mode={mode} onPick={openPicker} copy={copy} />
      ) : mode === 'before_after' ? (
        <BeforeAfterSlots photos={photos} onPick={openSlot} onEdit={onEdit} />
      ) : (
        <PhotoGrid photos={photos} onAdd={openPicker} onEdit={onEdit} announce={announce} />
      )}
    </div>
  )
}

function DropZone({ mode, onPick, copy }) {
  const ba = mode === 'before_after'
  const ideas = !ba && copy?.prompts?.length ? copy.prompts : null
  return (
    <>
      <button type="button" className="pp-drop" onClick={onPick}>
        <span className="pp-drop-icon" aria-hidden="true">{ba ? <ArrowLeftRight size={26} /> : <ImagePlus size={26} />}</span>
        <b className="pp-drop-title">{ba ? 'Add a before & after' : copy?.headline || 'Add photos'}</b>
        <span className="muted small pp-drop-text">
          {ba ? 'Pick the before and the after, or just one photo and edit it.' : `One photo, or up to ${MAX_PHOTOS} from the same shoot.`}
        </span>
        <span className="btn accent pp-drop-btn">{ba ? 'Choose photos' : 'Choose photos'}</span>
        <span className="muted tiny pp-drop-hint">
          or drag them anywhere here · <ClipboardPaste size={12} aria-hidden="true" /> paste with {/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'}+V
        </span>
        <span className="muted tiny pp-drop-formats">JPEG, PNG, WebP or HEIC · up to {formatBytes(MAX_FILE_BYTES)} each</span>
      </button>
      {ideas && (
        <div className="pp-ideas">
          <span className="muted tiny">Ideas</span>
          <div className="chips">{ideas.map((t) => <span key={t} className="chip">{t}</span>)}</div>
        </div>
      )}
    </>
  )
}

// Gentle notes about a photo (low resolution, large file, duplicate). Never blocking.
function Hints({ hints }) {
  if (!hints.length) return null
  return (
    <ul className="pp-hints" aria-label="Notes about this photo">
      {hints.map((h) => (
        <li key={h.kind} className={`pp-hint ${h.kind}`}><AlertTriangle size={13} aria-hidden="true" /> {h.text}</li>
      ))}
    </ul>
  )
}

// The selected photo, large, exactly as clients will see it, with Edit on top.
function Hero({ item, label, onEdit, onRevert }) {
  const src = item.processed?.url || item.thumbUrl
  return (
    <div className="pp-hero">
      {src ? <img src={src} alt="" draggable={false} />
        : <div className="pp-hero-loading"><span className="spinner" aria-hidden="true" />{item.note && <span className="muted tiny">{item.note}</span>}</div>}
      {label && <span className="pp-hero-badge">{label}</span>}
      {(onEdit || item.edited) && (
        <span className="pp-hero-actions">
          {item.edited && onRevert && (
            <button type="button" className="pp-hero-btn" onClick={onRevert}><Undo2 size={15} aria-hidden="true" /> Original</button>
          )}
          {onEdit && (
            <button type="button" className="pp-hero-btn solid" onClick={onEdit} disabled={item.status !== 'ready'}>
              <Wand2 size={15} aria-hidden="true" /> {item.edited ? 'Edit again' : 'Edit'}
            </button>
          )}
        </span>
      )}
    </div>
  )
}

function ProcessedLine({ item }) {
  if (item.status === 'loading') return <div className="pp-info muted tiny">{item.note || 'Reading photo…'}</div>
  if (!item.processed) return <div className="pp-info muted tiny">Preparing the version clients will see…</div>
  const { width, height, size } = item.processed
  const extra = [item.edited && 'edited', item.heic && 'converted from HEIC'].filter(Boolean)
  return (
    <div className="pp-info muted tiny">
      Clients see {width} × {height} · {formatBytes(size)} · location data removed{extra.length ? ` · ${extra.join(' · ')}` : ''}
    </div>
  )
}

function PhotoGrid({ photos, onAdd, onEdit, announce }) {
  const { items, remove, move, clearEdit, hintsFor } = photos
  const [selId, setSelId] = useState(null)
  const dragFrom = useRef(null)
  const [dragId, setDragId] = useState(null)
  const grid = useRef()

  const selIndex = Math.max(0, items.findIndex((i) => i.id === selId))
  const sel = items[selIndex]
  const last = items.length - 1
  const kindLine = items.length === 1 ? 'Single photo · add more to make an album' : `Album · ${items.length} of ${MAX_PHOTOS} photos`

  const moveTo = (from, to, { focus = false } = {}) => {
    if (to < 0 || to > last || from === to) return
    move(from, to)
    setSelId(items[from].id)
    announce(`Photo moved to position ${to + 1} of ${items.length}${to === 0 ? ', now the cover' : ''}.`)
    if (focus) requestAnimationFrame(() => grid.current?.querySelectorAll('.pp-thumb')[to]?.focus())
  }

  const removeSel = () => {
    const next = items[selIndex + 1] || items[selIndex - 1]
    remove(sel.id)
    setSelId(next?.id ?? null)
    announce('Photo removed.')
  }

  // Desktop: drag thumbnails to reorder (live, as you drag over others).
  const onDragStart = (e, i, id) => {
    dragFrom.current = i
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/x-pm-photo', id)
  }
  const onDragEnter = (e, i) => {
    if (dragFrom.current == null || dragFrom.current === i) return
    move(dragFrom.current, i)
    dragFrom.current = i
  }
  const onDragEnd = () => {
    dragFrom.current = null
    setDragId(null)
  }
  // Keyboard: Alt + ← / → moves the focused photo.
  const onKeyDown = (e, i) => {
    if (!e.altKey || !['ArrowLeft', 'ArrowRight', 'Home'].includes(e.key)) return
    e.preventDefault()
    moveTo(i, e.key === 'Home' ? 0 : e.key === 'ArrowLeft' ? i - 1 : i + 1, { focus: true })
  }

  const hints = hintsFor(sel)
  return (
    <>
      <Hero item={sel} label={items.length === 1 ? null : selIndex === 0 ? 'Cover' : `${selIndex + 1} of ${items.length}`}
        onEdit={onEdit ? () => onEdit(sel) : null} onRevert={() => { clearEdit(sel.id); announce('Back to the original photo.') }} />
      <div className="pp-tools">
        {items.length > 1 && (
          <>
            <button type="button" className="pp-tool" onClick={() => moveTo(selIndex, selIndex - 1)} disabled={selIndex === 0} aria-label="Move earlier">
              <ChevronLeft size={18} />
            </button>
            <button type="button" className="pp-tool" onClick={() => moveTo(selIndex, selIndex + 1)} disabled={selIndex === last} aria-label="Move later">
              <ChevronRight size={18} />
            </button>
            <button type="button" className="pp-tool wide" onClick={() => moveTo(selIndex, 0)} disabled={selIndex === 0}>
              <Star size={15} fill={selIndex === 0 ? 'currentColor' : 'none'} aria-hidden="true" /> {selIndex === 0 ? 'Cover photo' : 'Make cover'}
            </button>
          </>
        )}
        <span className="grow" />
        <button type="button" className="pp-tool danger" onClick={removeSel} aria-label={`Remove photo ${selIndex + 1}`}>
          <Trash2 size={16} aria-hidden="true" /> <span className="pp-tool-text">Remove</span>
        </button>
      </div>
      <ProcessedLine item={sel} />
      <Hints hints={hints} />

      <p id="pp-reorder-help" className="sr-only">Alt plus arrow keys moves the photo. The first photo is the cover.</p>
      <div className="pp-grid mt-sm" ref={grid} onDragOver={(e) => dragFrom.current != null && e.preventDefault()}>
        {items.map((it, i) => {
          const warn = hintsFor(it).length > 0
          return (
            <button
              type="button"
              key={it.id}
              className={`pp-thumb ${it.id === sel.id ? 'on' : ''} ${it.id === dragId ? 'dragging' : ''}`}
              onClick={() => setSelId(it.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              draggable={items.length > 1}
              onDragStart={(e) => onDragStart(e, i, it.id)}
              onDragEnter={(e) => onDragEnter(e, i)}
              onDragOver={(e) => dragFrom.current != null && e.preventDefault()}
              onDragEnd={onDragEnd}
              onDrop={(e) => e.preventDefault()}
              aria-label={`Photo ${i + 1}${i === 0 ? ', cover' : ''}${it.edited ? ', edited' : ''}${warn ? ', has a note' : ''}`}
              aria-pressed={it.id === sel.id}
              aria-describedby={items.length > 1 ? 'pp-reorder-help' : undefined}
            >
              {it.thumbUrl ? <img src={it.thumbUrl} alt="" draggable={false} /> : <span className="pp-thumb-loading" />}
              {items.length > 1 && <span className="pp-num" aria-hidden="true">{i === 0 ? <Star size={10} fill="currentColor" /> : i + 1}</span>}
              {it.edited && <span className="pp-edited" aria-hidden="true"><Wand2 size={10} /></span>}
              {warn && <span className="pp-dot-warn" aria-hidden="true" />}
            </button>
          )
        })}
        {items.length < MAX_PHOTOS && (
          <button type="button" className="pp-add" onClick={onAdd} aria-label="Add more photos">
            <Plus size={20} />
          </button>
        )}
      </div>
      <div className="row between mt-xs pp-foot">
        <span className="muted tiny">{kindLine}</span>
        {items.length > 1 && <span className="muted tiny pp-drag-tip">Drag to reorder</span>}
      </div>
    </>
  )
}

function BeforeAfterSlots({ photos, onPick, onEdit }) {
  const { items, remove, swapFirstTwo, hintsFor } = photos
  const [before, after] = items
  const extra = items.length - 2
  const aspect = (after || before)?.width ? `${(after || before).width} / ${(after || before).height}` : '4 / 5'
  const src = (it) => it?.processed?.url || it?.thumbUrl

  const slotTile = (it, i, label) => (
    <div className="pp-slot">
      <span className="pp-slot-label">{label}</span>
      {it ? (
        <>
          <button type="button" className="pp-slot-img" onClick={() => onPick(i)} aria-label={`Replace the ${label.toLowerCase()} photo`}>
            {src(it) ? <img src={src(it)} alt="" draggable={false} /> : <span className="spinner" aria-hidden="true" />}
          </button>
          <button type="button" className="pp-slot-remove" onClick={() => remove(it.id)} aria-label={`Remove the ${label.toLowerCase()} photo`}><X size={14} /></button>
          {onEdit && it.status === 'ready' && (
            <button type="button" className="pp-slot-edit" onClick={() => onEdit(it)} aria-label={`Edit the ${label.toLowerCase()} photo`}>
              <Wand2 size={13} aria-hidden="true" /> Edit
            </button>
          )}
        </>
      ) : (
        <button type="button" className="pp-slot-empty" onClick={() => onPick(i)}>
          <Plus size={20} aria-hidden="true" />
          <span className="small">Add {label.toLowerCase()}</span>
        </button>
      )}
    </div>
  )

  const hints = [...(before ? hintsFor(before) : []), ...(after ? hintsFor(after) : [])].filter((h) => h.kind !== 'duplicate' || !before?.pairOf)
  return (
    <>
      <div className="pp-slots">
        {slotTile(before, 0, 'Before')}
        <button type="button" className="pp-swap" onClick={swapFirstTwo} disabled={!after} aria-label="Swap before and after">
          <ArrowLeftRight size={16} />
        </button>
        {slotTile(after, 1, 'After')}
      </div>
      {before && !after && onEdit && before.status === 'ready' && (
        <div className="pp-oneshot">
          <div className="grow">
            <b className="small">Only have one photo?</b>
            <div className="muted tiny">Edit it: the original becomes the before, your edit the after.</div>
          </div>
          <button type="button" className="btn sm accent" onClick={() => onEdit(before, { pair: true })}><Wand2 size={14} aria-hidden="true" /> Edit to make the after</button>
        </div>
      )}
      {extra > 0 && (
        <div className="pp-notice mt-sm">
          Before & after uses the first 2 photos. Switch to Photos to post all {items.length}.
        </div>
      )}
      <Hints hints={hints.slice(0, 2)} />
      {before && after && src(before) && src(after) ? (
        <>
          <div className="pp-ba-preview mt">
            <PairPreview before={src(before)} after={src(after)} alt="Preview of your before and after" aspect={aspect} />
          </div>
          <div className="pp-info muted tiny">Drag the slider to check the pair lines up. Tap a photo above to replace it.</div>
        </>
      ) : (
        <div className="pp-info muted tiny mt-sm">Tap a photo to replace it. Use ⇆ to swap them.</div>
      )}
    </>
  )
}
