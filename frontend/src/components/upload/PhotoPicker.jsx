import { useRef, useState } from 'react'
import { AlertCircle, ArrowLeftRight, ChevronLeft, ChevronRight, ImagePlus, Plus, Star, Trash2, X } from 'lucide-react'
import { BeforeAfter } from '../Media.jsx'
import { MAX_FILE_BYTES, MAX_PHOTOS, formatBytes } from '../../lib/images.js'

// Step 1 of posting: pick photos, put them in order, choose the cover.
// mode: 'photos' (1 = single, 2+ = album) or 'before_after'. photos: usePhotoItems().
// copy: the vertical's postConfig() (headline and ideas for the empty state).
export default function PhotoPicker({ mode, photos, copy = null }) {
  const { items, rejected, notice, add, dismissRejected } = photos
  const pickAny = useRef()
  const pickSlot = useRef()
  const [slot, setSlot] = useState(null) // before/after slot being replaced
  const max = mode === 'before_after' ? 2 : MAX_PHOTOS

  const openPicker = () => pickAny.current.click()
  const openSlot = (i) => {
    setSlot(i)
    pickSlot.current.click()
  }

  return (
    <div className="pp">
      <input ref={pickAny} type="file" accept="image/*" multiple hidden data-testid="pick-photos"
        onChange={(e) => { add(e.target.files, { max }); e.target.value = '' }} />
      <input ref={pickSlot} type="file" accept="image/*" hidden data-testid="pick-slot"
        onChange={(e) => { add(e.target.files, { max, at: slot }); e.target.value = '' }} />

      {(notice || rejected.length > 0) && (
        <div className="pp-alerts">
          {notice && <div className="pp-notice" role="status">{notice}</div>}
          {rejected.length > 0 && (
            <div className="pp-rejected" role="alert">
              {rejected.map((r) => (
                <div key={r.id} className="pp-rejected-row">
                  <AlertCircle size={16} />
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
        <BeforeAfterSlots photos={photos} onPick={openSlot} />
      ) : (
        <PhotoGrid photos={photos} onAdd={openPicker} />
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
        <span className="pp-drop-icon">{ba ? <ArrowLeftRight size={26} /> : <ImagePlus size={26} />}</span>
        <b className="pp-drop-title">{ba ? 'Add a before & after' : copy?.headline || 'Add photos'}</b>
        <span className="muted small pp-drop-text">
          {ba ? 'Pick 2 photos: the before, then the after. You can swap them next.' : `One photo, or up to ${MAX_PHOTOS} from the same event.`}
        </span>
        <span className="btn accent pp-drop-btn">{ba ? 'Choose 2 photos' : 'Choose photos'}</span>
        <span className="muted tiny pp-drop-hint">or drag them here</span>
        <span className="muted tiny pp-drop-formats">JPEG, PNG or WebP · up to {formatBytes(MAX_FILE_BYTES)} each</span>
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

// The selected photo, large, exactly as clients will see it.
function Hero({ item, label }) {
  const src = item.processed?.url || item.thumbUrl
  return (
    <div className="pp-hero">
      {src ? <img src={src} alt="" draggable={false} /> : <div className="pp-hero-loading"><span className="spinner" /></div>}
      {label && <span className="pp-hero-badge">{label}</span>}
      {item.lowRes && <span className="pp-hero-warn">Low resolution · may look soft</span>}
    </div>
  )
}

function ProcessedLine({ item }) {
  if (item.status === 'loading') return <div className="pp-info muted tiny">Reading photo…</div>
  if (!item.processed) return <div className="pp-info muted tiny">Preparing the version clients will see…</div>
  const { width, height, size } = item.processed
  return (
    <div className="pp-info muted tiny">
      Clients see {width} × {height} · {formatBytes(size)} · location data removed
    </div>
  )
}

function PhotoGrid({ photos, onAdd }) {
  const { items, remove, move } = photos
  const [selId, setSelId] = useState(null)
  const dragFrom = useRef(null)
  const [dragId, setDragId] = useState(null)

  const selIndex = Math.max(0, items.findIndex((i) => i.id === selId))
  const sel = items[selIndex]
  const last = items.length - 1
  const kindLine = items.length === 1 ? 'Single photo · add more to make an album' : `Album · ${items.length} of ${MAX_PHOTOS} photos`

  const removeSel = () => {
    const next = items[selIndex + 1] || items[selIndex - 1]
    remove(sel.id)
    setSelId(next?.id ?? null)
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

  return (
    <>
      <Hero item={sel} label={items.length === 1 ? null : selIndex === 0 ? 'Cover' : `${selIndex + 1} of ${items.length}`} />
      <div className="pp-tools">
        {items.length > 1 && (
          <>
            <button type="button" className="pp-tool" onClick={() => move(selIndex, selIndex - 1)} disabled={selIndex === 0} aria-label="Move earlier">
              <ChevronLeft size={18} />
            </button>
            <button type="button" className="pp-tool" onClick={() => move(selIndex, selIndex + 1)} disabled={selIndex === last} aria-label="Move later">
              <ChevronRight size={18} />
            </button>
          </>
        )}
        {items.length > 1 && (
          <button type="button" className="pp-tool wide" onClick={() => move(selIndex, 0)} disabled={selIndex === 0}>
            <Star size={15} fill={selIndex === 0 ? 'currentColor' : 'none'} /> {selIndex === 0 ? 'Cover photo' : 'Make cover'}
          </button>
        )}
        <span className="grow" />
        <button type="button" className="pp-tool danger" onClick={removeSel} aria-label="Remove this photo">
          <Trash2 size={16} /> Remove
        </button>
      </div>
      <ProcessedLine item={sel} />

      <div className="pp-grid mt-sm" onDragOver={(e) => dragFrom.current != null && e.preventDefault()}>
        {items.map((it, i) => (
          <button
            type="button"
            key={it.id}
            className={`pp-thumb ${it.id === sel.id ? 'on' : ''} ${it.id === dragId ? 'dragging' : ''}`}
            onClick={() => setSelId(it.id)}
            draggable={items.length > 1}
            onDragStart={(e) => onDragStart(e, i, it.id)}
            onDragEnter={(e) => onDragEnter(e, i)}
            onDragOver={(e) => dragFrom.current != null && e.preventDefault()}
            onDragEnd={onDragEnd}
            onDrop={(e) => e.preventDefault()}
            aria-label={`Photo ${i + 1}${i === 0 ? ', cover' : ''}`}
            aria-pressed={it.id === sel.id}
          >
            {it.thumbUrl ? <img src={it.thumbUrl} alt="" draggable={false} /> : <span className="pp-thumb-loading" />}
            {items.length > 1 && <span className="pp-num">{i === 0 ? <Star size={10} fill="currentColor" /> : i + 1}</span>}
            {it.lowRes && <span className="pp-dot-warn" title="Low resolution" />}
          </button>
        ))}
        {items.length < MAX_PHOTOS && (
          <button type="button" className="pp-add" onClick={onAdd} aria-label="Add more photos">
            <Plus size={20} />
          </button>
        )}
      </div>
      <div className="row between mt-xs">
        <span className="muted tiny">{kindLine}</span>
        {items.length > 1 && <span className="muted tiny pp-drag-tip">Drag to reorder</span>}
      </div>
    </>
  )
}

function BeforeAfterSlots({ photos, onPick }) {
  const { items, remove, swapFirstTwo } = photos
  const [before, after] = items
  const extra = items.length - 2
  const aspect = after?.width ? `${after.width} / ${after.height}` : '4 / 5'
  const src = (it) => it?.processed?.url || it?.thumbUrl

  const slotTile = (it, i, label) => (
    <div className="pp-slot">
      <span className="pp-slot-label">{label}</span>
      {it ? (
        <>
          <button type="button" className="pp-slot-img" onClick={() => onPick(i)} aria-label={`Replace the ${label.toLowerCase()} photo`}>
            {src(it) ? <img src={src(it)} alt="" draggable={false} /> : <span className="spinner" />}
          </button>
          <button type="button" className="pp-slot-remove" onClick={() => remove(it.id)} aria-label={`Remove the ${label.toLowerCase()} photo`}><X size={14} /></button>
        </>
      ) : (
        <button type="button" className="pp-slot-empty" onClick={() => onPick(i)}>
          <Plus size={20} />
          <span className="small">Add {label.toLowerCase()}</span>
        </button>
      )}
    </div>
  )

  return (
    <>
      <div className="pp-slots">
        {slotTile(before, 0, 'Before')}
        <button type="button" className="pp-swap" onClick={swapFirstTwo} disabled={!after} aria-label="Swap before and after">
          <ArrowLeftRight size={16} />
        </button>
        {slotTile(after, 1, 'After')}
      </div>
      {extra > 0 && (
        <div className="pp-notice mt-sm">
          Before / after uses the first 2 photos. Switch to Photos to post all {items.length}.
        </div>
      )}
      {before && after && src(before) && src(after) ? (
        <>
          <div className="pp-ba-preview mt">
            <BeforeAfter src={src(after)} beforeSrc={src(before)} aspect={aspect} />
          </div>
          <div className="pp-info muted tiny">Drag the slider to check the pair lines up. Tap a photo above to replace it.</div>
        </>
      ) : (
        <div className="pp-info muted tiny mt-sm">Tap a photo to replace it. Use ⇆ to swap them.</div>
      )}
    </>
  )
}
