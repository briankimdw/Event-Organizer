import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Check, Layers, X } from 'lucide-react'
import useDialog from '../useDialog.js'
import './studio.css'

// Where the Studio page lives (frontend/public/studio/, built by tools/studio/build.mjs).
export const STUDIO_URL = `${import.meta.env.BASE_URL || '/'}studio/index.html`
const READY_TIMEOUT = 30000

/**
 * Studio: a Photoshop-style editor (layers, brushes, clone, selections, text, shapes, effects),
 * miniPaint running in a same-origin iframe. Pixel editing: what comes back is a flattened image.
 *
 * <Studio
 *   source={File | Blob | url}     the image to open (a URL must be same-origin or CORS-enabled)
 *   name="photo.jpg"               layer name (optional)
 *   onDone={({ blob, width, height, changed }) => …}   flattened JPEG, long edge ≤ maxEdge; may return
 *       a promise (Studio shows "Saving…" until it settles; a throw shows its message). changed: false
 *       when nothing was edited in Studio.
 *   onCancel={() => …}
 *   doneLabel="Done"               "Save" when it saves straight away
 *   note="…"                       one line under the title (e.g. what saving replaces)
 *   maxEdge={2048} quality={0.9}
 * />
 * Fills the viewport (position: fixed); render it through <StudioLayer> (lazy + portal).
 */
export default function Studio({ source, name = 'Photo', onDone, onCancel, doneLabel = 'Done', note = '', maxEdge = 2048, quality = 0.9 }) {
  const root = useRef(null)
  const frame = useRef(null)
  const bridgeRef = useRef(null)
  const titleId = useId()
  const noteId = useId()
  const [phase, setPhase] = useState('loading') // loading | ready | error
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState('')

  const cancel = useCallback(() => {
    if (busy) return
    if (dirty || bridgeRef.current?.isDirty?.()) setConfirming(true)
    else onCancel?.()
  }, [busy, dirty, onCancel])
  const cancelRef = useRef(cancel)
  cancelRef.current = cancel
  useDialog(root, true, confirming ? null : cancel)

  // Unsaved changes: warn before the tab closes.
  useEffect(() => {
    if (!dirty) return undefined
    const onUnload = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [dirty])

  // Load the image once the Studio page has started.
  const onFrameLoad = useCallback(async () => {
    const win = frame.current?.contentWindow
    const bridge = win?.studioBridge
    if (!bridge) {
      setPhase('error')
      setError('Studio couldn’t start. Check your connection and try again.')
      return
    }
    bridgeRef.current = bridge
    bridge.onChange = (d) => setDirty(!!d)
    bridge.onEscape = () => cancelRef.current()
    try {
      await Promise.race([bridge.ready, new Promise((_, rej) => setTimeout(() => rej(new Error('Studio took too long to start.')), READY_TIMEOUT))])
      await bridge.open(source, { name })
      setPhase('ready')
      setMessage('Studio is open. The image is ready to edit.')
      // Done was disabled while loading, so focus may have landed on the page: put it on Done.
      requestAnimationFrame(() => {
        const node = root.current
        if (node && !node.contains(document.activeElement)) node.querySelector('.st-done')?.focus({ preventScroll: true })
      })
    } catch (e) {
      setPhase('error')
      setError(e.message || 'Couldn’t open this photo in Studio.')
    }
  }, [source, name])

  useEffect(() => () => {
    const b = bridgeRef.current
    if (b) { b.onChange = null; b.onEscape = null }
  }, [])

  const done = async () => {
    const bridge = bridgeRef.current
    if (!bridge || busy || phase !== 'ready') return
    setBusy(true)
    setError('')
    setMessage('Saving…')
    try {
      const changed = !!bridge.isDirty?.()
      const out = await bridge.exportImage({ type: 'image/jpeg', quality, maxEdge })
      // The blob was made in the iframe's realm (instanceof Blob is false here): re-wrap it.
      const blob = new Blob([out.blob], { type: out.blob.type || 'image/jpeg' })
      await onDone?.({ blob, width: out.width, height: out.height, changed })
      setBusy(false)
    } catch (e) {
      setError(e.message || 'Couldn’t save. Try again.')
      setMessage('')
      setBusy(false)
    }
  }

  // Tab out of the iframe lands here: keep focus inside the dialog.
  const wrapFocus = () => root.current?.querySelector('.st-top button:not([disabled])')?.focus()

  return (
    <div className="st" ref={root} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={note ? noteId : undefined}>
      <header className="st-top">
        <button type="button" className="st-icon" onClick={cancel} disabled={busy} aria-label="Cancel and close Studio">
          <X size={22} aria-hidden="true" />
        </button>
        <div className="st-head">
          <h2 className="st-title" id={titleId}><Layers size={16} aria-hidden="true" /> Studio</h2>
          {note && <p className="st-note" id={noteId}>{note}</p>}
        </div>
        <button type="button" className="st-done" onClick={done} disabled={phase !== 'ready' || busy} data-autofocus>
          {busy ? <span className="st-spinner" aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
          {busy ? 'Saving…' : doneLabel}
        </button>
      </header>

      <div className="st-body">
        <iframe
          ref={frame} className="st-frame" src={STUDIO_URL} title="Studio image editor"
          onLoad={onFrameLoad} allow="clipboard-read; clipboard-write" aria-busy={phase === 'loading'}
        />
        {phase === 'loading' && (
          <div className="st-state" role="status"><span className="st-spinner lg" aria-hidden="true" /> Opening Studio…</div>
        )}
        {phase === 'error' && (
          <div className="st-state" role="alert">
            <p>{error}</p>
            <button type="button" className="st-btn" onClick={() => onCancel?.()}>Close</button>
          </div>
        )}
        <span tabIndex={0} className="st-sentinel" onFocus={wrapFocus} aria-hidden="true" />
      </div>

      {phase === 'ready' && error && <p className="st-error" role="alert">{error}</p>}
      <div className="st-sr" role="status" aria-live="polite">{message}</div>

      {confirming && <DiscardConfirm onKeep={() => setConfirming(false)} onDiscard={() => { setConfirming(false); onCancel?.() }} />}
    </div>
  )
}

function DiscardConfirm({ onKeep, onDiscard }) {
  const ref = useRef(null)
  const titleId = useId()
  const textId = useId()
  useDialog(ref, true, onKeep)
  return (
    <div className="st-backdrop" onClick={onKeep}>
      <div className="st-confirm" ref={ref} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={textId} onClick={(e) => e.stopPropagation()}>
        <h3 id={titleId}>Discard your Studio edits?</h3>
        <p id={textId}>Layers, brush strokes and text you added in Studio will be lost. The photo stays as it was.</p>
        <div className="st-confirm-actions">
          <button type="button" className="st-btn danger" onClick={onDiscard}>Discard edits</button>
          <button type="button" className="st-btn" onClick={onKeep} data-autofocus>Keep editing</button>
        </div>
      </div>
    </div>
  )
}

export { Studio }
