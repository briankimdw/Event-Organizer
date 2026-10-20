import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeftRight, Check, Crop, FlipHorizontal2, Layers, Palette, Redo2, RotateCcw, RotateCw, Sparkles, SplitSquareHorizontal, Sun, Undo2, Wand2, WandSparkles, X,
} from 'lucide-react'
import AiPanel from './ai/AiPanel.jsx'
import { StudioLayer } from '../studio/StudioLayer.jsx'
import { autoPixels, cropRegion } from './ai/aiImage.js'
import { applyAuto, autoEnhance, describeAuto } from '../../lib/editor/auto.js'
import useDialog from '../useDialog.js'
import Sheet from '../Sheet.jsx'
import CropOverlay from './CropOverlay.jsx'
import useRecipeHistory from './useRecipeHistory.js'
import {
  ADJUSTMENTS, ASPECTS, PRESETS, aspectRatio, bakeFilter, defaultRecipe, describe, effectiveAdjust, formatAdjust,
  getPreset, isIdentity, normalize, sameRecipe, toStorable,
} from '../../lib/editor/recipe.js'
import { cropForAspect, fitCrop, flipRecipe, orientedSize, outputSize, rotateRecipe, swappedAspect } from '../../lib/editor/geometry.js'
import { createRenderer, drawScaled, exportEdit, loadWorkingImage, renderAspect, DISPLAY_EDGE } from '../../lib/editor/renderWeb.js'
import './editor.css'

const TABS = [
  { id: 'presets', label: 'Presets', icon: Sparkles },
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'color', label: 'Color', icon: Palette },
  { id: 'effects', label: 'Effects', icon: Wand2 },
  { id: 'crop', label: 'Crop', icon: Crop },
  { id: 'ai', label: 'AI', icon: WandSparkles },
]
// AI edits (components/editor/ai) are pixel edits: each result becomes the new working base and
// the recipe keeps applying on top (AI tools work on the upright, uncropped photo, so crop and
// sliders stay meaningful). onDone then returns recipe: null, pixelEdited: true (a recipe can't
// describe the result alone); the private original is never touched, so Revert still works.
const flatRecipe = (r) => ({ ...r, crop: { x: 0, y: 0, w: 1, h: 1 }, aspect: 'original', rotate: 0, straighten: 0, flipH: false })
const PREVIEW_EDGE = 2048 // working copy for the live preview
const THUMB_EDGE = 200

const isTyping = (el) => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(el.type)))

/**
 * Full-screen photo editor (non-destructive).
 *
 * <PhotoEditor
 *   source={File | Blob | url}          the untouched original
 *   initialRecipe={recipe | null}       re-editing: the saved recipe
 *   onDone={({ blob, recipe, width, height, makeBeforeAfter? }) => …}
 *       blob: JPEG display copy (≤ 2048px long edge, metadata stripped); recipe: compact form for
 *       photos.edit_recipe (null when nothing is changed); makeBeforeAfter only with allowBeforeAfter.
 *       pixelEdited: true when an AI tool or Studio changed the pixels: then recipe is null although the
 *       photo changed, and pixelBase { blob, recipe } is the pixel-edited image plus the (compact)
 *       recipe on top of it: reopen with source={pixelBase.blob} initialRecipe={pixelBase.recipe}
 *       pixelEdited to carry on where you left off (components/upload/editorBridge.jsx editorPropsFor).
 *   onCancel={() => …}
 *   mode="post" | "new" | "reedit"      only changes the wording ("Done" / "Save")
 *   allowBeforeAfter                     shows "Post as before & after"
 *   pixelEdited                          source is already a pixel edit (not the original): Done
 *                                        always returns recipe null + pixelEdited.
 * />
 * Render it inside the phone frame (#phone); it fills its positioned container.
 * "Studio" (components/studio, docs/STUDIO.md) opens the current render in a layers editor; its
 * result becomes the new working base (like an AI result) and the sliders start again from zero.
 */
export default function PhotoEditor({ source, initialRecipe = null, onDone, onCancel, mode = 'post', allowBeforeAfter = false, pixelEdited: pixelSource = false }) {
  const root = useRef(null)
  const titleId = useId()
  const hintId = useId()
  const [work, setWork] = useState(null) // working image (loadWorkingImage)
  const [loadError, setLoadError] = useState('')
  const startRecipe = useMemo(() => normalize(initialRecipe), []) // eslint-disable-line react-hooks/exhaustive-deps
  const hist = useRecipeHistory(startRecipe)
  const { recipe, change, commit } = hist
  const [tab, setTab] = useState(initialRecipe ? 'light' : 'presets')
  const [holding, setHolding] = useState(false) // press-and-hold on the photo, or the \ key
  const [comparing, setComparing] = useState(false) // the Compare button
  const [pair, setPair] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [message, setMessage] = useState('') // live region
  const say = useCallback((m) => setMessage((prev) => (prev === m ? `${m} ` : m)), [])

  // ---- AI base (see TABS): a stack of { blob, work, label }; empty = the original ----
  const [aiStack, setAiStack] = useState([])
  const origWork = useRef(null)
  const [aiLayer, setAiLayer] = useState(null) // overlay element over the preview (mask brush, cut-out)
  const [flat, setFlat] = useState(false) // AI tab shows the whole, uncropped photo
  const [aiBusy, setAiBusy] = useState(false)
  const [autoText, setAutoText] = useState('')

  const dirty = !sameRecipe(recipe, startRecipe) || aiStack.length > 0
  const cancel = () => (dirty && !busy ? setConfirmCancel(true) : onCancel?.())
  useDialog(root, true, confirmCancel ? null : cancel)

  // ---- load the photo ----
  useEffect(() => {
    let live = true
    setWork(null)
    setAiStack([])
    setLoadError('')
    loadWorkingImage(source, { maxEdge: PREVIEW_EDGE })
      .then((w) => { if (live) { origWork.current = w; setWork(w) } })
      .catch((e) => live && setLoadError(e.message || 'Couldn’t open this photo.'))
    return () => { live = false }
  }, [source])

  // extra: { kind: 'studio', restore: recipe } for Studio results (the recipe they replaced).
  const applyBase = useCallback(async (blob, label, extra = null) => {
    const w = await loadWorkingImage(blob, { maxEdge: PREVIEW_EDGE })
    setAiStack((s) => [...s, { blob, work: w, label, ...extra }])
    setWork(w)
    say(extra?.kind === 'studio' ? 'Studio edits applied' : `AI result: ${label}`)
  }, [say])
  const undoBase = () => {
    const next = aiStack.slice(0, -1)
    const last = aiStack[aiStack.length - 1]
    if (last?.restore) change(() => last.restore, { commit: true }) // Studio baked the sliders in: bring them back
    setAiStack(next)
    setWork(next.length ? next[next.length - 1].work : origWork.current)
    say(next.length ? 'AI edit undone' : 'Back to the original photo')
  }
  const clearBase = () => {
    const first = aiStack.find((s) => s.restore)
    if (first) change(() => first.restore, { commit: true })
    setAiStack([])
    setWork(origWork.current)
    say('AI edits removed')
  }
  // Auto-enhance: judge the part of the (current) photo the crop shows; only its sliders change.
  const runAuto = () => {
    if (!work) return null
    const { adjust } = autoEnhance(autoPixels(work.canvas), { region: cropRegion(recipe, work.width, work.height) })
    change((r) => applyAuto(r, adjust), { commit: true })
    const text = describeAuto(adjust)
    setAutoText(text)
    say(`Auto-enhance: ${text}`)
    return adjust
  }

  // ---- preview ----
  const stageRef = useRef(null)
  const canvasRef = useRef(null)
  const [stage, setStage] = useState({ w: 0, h: 0 })
  const [renderer, setRenderer] = useState(null)
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return undefined
    const ro = new ResizeObserver(([e]) => setStage({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // One renderer per preview canvas, kept while the editor is open: destroy() loses the WebGL
  // context, and a lost context can't be reused on the same canvas. So a new base image (an AI
  // result) only swaps the image, and the destroy is deferred a tick so React StrictMode's
  // unmount/remount in development doesn't kill it.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    let r = canvas.__peRenderer
    if (r) clearTimeout(r.__destroyTimer)
    else { r = createRenderer(canvas); canvas.__peRenderer = r }
    setRenderer(r)
    return () => { r.__destroyTimer = setTimeout(() => { r.destroy(); canvas.__peRenderer = null }, 0) }
  }, [])
  const [imageOf, setImageOf] = useState(null) // the work whose image the renderer holds
  useEffect(() => {
    if (!renderer || !work) return
    renderer.setImage(work.canvas)
    setImageOf(work)
  }, [renderer, work])

  const cropping = tab === 'crop'
  const flatView = flat && tab === 'ai'
  const shown = useMemo(() => (flatView ? flatRecipe(recipe) : recipe), [flatView, recipe]) // what the preview renders
  const showOriginal = (holding || comparing) && !cropping && !flatView
  const viewMode = showOriginal ? 'original' : cropping ? 'crop' : 'final'
  const frame = work ? orientedSize(work.width, work.height, recipe.rotate) : { w: 1, h: 1 }

  const view = useMemo(() => {
    if (!work || !stage.w) return null
    const aspect = renderAspect(shown, viewMode, work.width, work.height)
    const pad = cropping ? 28 : 12
    const maxW = Math.max(40, stage.w - pad * 2), maxH = Math.max(40, stage.h - pad * 2)
    const cssW = Math.min(maxW, maxH * aspect)
    const cssH = cssW / aspect
    const src = viewMode === 'original' ? { width: work.width, height: work.height }
      : viewMode === 'crop' ? { width: frame.w, height: frame.h } : outputSize(shown, work.width, work.height)
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    const scale = Math.min(dpr, src.width / cssW, PREVIEW_EDGE / Math.max(cssW, cssH))
    return { cssW, cssH, pxW: Math.max(1, Math.round(cssW * Math.max(scale, 0.25))), pxH: Math.max(1, Math.round(cssH * Math.max(scale, 0.25))) }
  }, [work, stage.w, stage.h, shown, viewMode, cropping, frame.w, frame.h])

  useEffect(() => {
    if (!renderer || !view || imageOf !== work) return undefined
    const id = requestAnimationFrame(() => renderer.render(shown, { width: view.pxW, height: view.pxH, mode: viewMode }))
    return () => cancelAnimationFrame(id)
  }, [renderer, shown, view, viewMode, imageOf, work])

  // Comparing after an AI edit: the renderer only has the AI base, so draw the real original on top.
  const origRef = useRef(null)
  const showAiOriginal = showOriginal && aiStack.length > 0 && !!origWork.current
  useEffect(() => {
    const c = origRef.current
    if (!showAiOriginal || !c || !view) return
    c.width = view.pxW; c.height = view.pxH
    c.getContext('2d').drawImage(origWork.current.canvas, 0, 0, c.width, c.height)
  }, [showAiOriginal, view])

  // ---- press and hold to see the original ----
  const holdStart = (e) => {
    if (cropping || flatView || (e.button !== undefined && e.button !== 0)) return
    setHolding(true)
  }
  const holdEnd = () => setHolding(false)
  useEffect(() => { if (holding) say('Showing the original') }, [holding, say])

  // ---- editing helpers ----
  const setAdjust = (key, value, opts) => change((r) => ({ ...r, adjust: { ...r.adjust, [key]: value } }), opts)
  const resetAll = () => {
    change(defaultRecipe(), { commit: true })
    say('All edits reset')
  }
  const doUndo = () => { if (hist.undo()) say('Undone') }
  const doRedo = () => { if (hist.redo()) say('Redone') }

  // Straighten shrinks the crop to keep the corners filled; the crop from before the gesture
  // is the reference, so going back to the old angle restores it.
  const cropBase = useRef(null)
  const setStraighten = (deg) => {
    if (!cropBase.current) cropBase.current = { crop: recipe.crop, angle: recipe.straighten }
    change((r) => ({ ...r, straighten: deg, crop: fitCrop(cropBase.current.crop, frame.w, frame.h, deg) }))
  }
  const endStraighten = () => { cropBase.current = null; commit() }
  const setAspect = (aspect) => {
    cropBase.current = null
    change((r) => ({ ...r, aspect, crop: aspect === 'free' ? r.crop : cropForAspect(aspect, frame.w, frame.h, r.straighten) }), { commit: true })
  }
  const rotate = () => {
    cropBase.current = null
    change((r) => {
      const next = rotateRecipe(r)
      const f = orientedSize(work.width, work.height, next.rotate)
      return { ...next, crop: fitCrop(next.crop, f.w, f.h, next.straighten) }
    }, { commit: true })
    say('Rotated 90 degrees')
  }
  const flip = () => {
    cropBase.current = null
    change((r) => flipRecipe(r), { commit: true })
    say('Flipped')
  }
  const resetCrop = () => {
    cropBase.current = null
    change((r) => ({ ...r, rotate: 0, straighten: 0, flipH: false, aspect: 'original', crop: { x: 0, y: 0, w: 1, h: 1 } }), { commit: true })
    say('Crop reset')
  }

  // ---- keyboard: undo / redo / hold \ to compare ----
  useEffect(() => {
    const down = (e) => {
      if (!root.current?.contains(document.activeElement) && document.activeElement !== document.body) return
      if (isTyping(document.activeElement)) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo() }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo() }
      else if (e.key === '\\' && !e.repeat) setHolding(true)
    }
    const up = (e) => { if (e.key === '\\') setHolding(false) }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  })

  // ---- done ----
  const done = async () => {
    if (busy || aiBusy || !work) return
    commit()
    setBusy(true)
    setError('')
    try {
      const ai = aiStack.length > 0 || pixelSource
      const baseBlob = aiStack.length ? aiStack[aiStack.length - 1].blob : work.blob
      const out = await exportEdit(baseBlob, recipe, { maxEdge: DISPLAY_EDGE })
      // After an AI / Studio edit the recipe alone can't reproduce the photo: recipe null + pixelEdited.
      const res = { blob: out.blob, width: out.width, height: out.height, recipe: ai ? null : toStorable(recipe) }
      if (ai) {
        res.pixelEdited = true
        res.pixelBase = { blob: baseBlob, recipe: toStorable(recipe) }
      }
      if (allowBeforeAfter && pair && (ai || !isIdentity(recipe))) res.makeBeforeAfter = true
      await onDone?.(res)
    } catch (e) {
      setError(e.message || 'Couldn’t save the edit. Try again.')
    } finally {
      setBusy(false)
    }
  }

  // ---- Studio (docs/STUDIO.md): the current render goes in; what comes back is the new base ----
  const [studio, setStudio] = useState(null) // { blob } while Studio is open
  const [studioBusy, setStudioBusy] = useState(false)
  const openStudio = async () => {
    if (busy || aiBusy || studioBusy || !work) return
    commit()
    setStudioBusy(true)
    setError('')
    try {
      const baseBlob = aiStack.length ? aiStack[aiStack.length - 1].blob : work.blob
      const out = await exportEdit(baseBlob, recipe, { maxEdge: DISPLAY_EDGE, quality: 0.95 })
      setStudio({ blob: out.blob })
    } catch (e) {
      setError(e.message || 'Couldn’t open Studio. Try again.')
    } finally {
      setStudioBusy(false)
    }
  }
  const studioDone = async ({ blob, changed }) => {
    if (changed) {
      const before = recipe
      await applyBase(blob, 'Studio', { kind: 'studio', restore: before })
      change(() => defaultRecipe(), { commit: true }) // the render already has the sliders and crop in it
    }
    setStudio(null)
  }
  const pixelText = aiStack.length
    ? aiStack.every((s) => s.kind === 'studio') ? 'Edited in Studio' : aiStack.some((s) => s.kind === 'studio') ? 'AI + Studio edits' : 'AI edited'
    : ''

  const doneLabel = mode === 'reedit' ? 'Save' : 'Done'
  const summary = describe(recipe)
  const ratio = aspectRatio(recipe.aspect, frame.w, frame.h)

  return (
    <div className="pe" ref={root} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="pe-top">
        <button type="button" className="pe-icon" onClick={cancel} aria-label="Cancel editing" disabled={busy}>
          <X size={22} aria-hidden="true" />
        </button>
        <h2 className="pe-title" id={titleId}>Edit photo</h2>
        <div className="pe-top-actions">
          <button type="button" className="pe-icon" onClick={doUndo} disabled={!hist.canUndo || busy} aria-label="Undo" title="Undo (Ctrl+Z)">
            <Undo2 size={20} aria-hidden="true" />
          </button>
          <button type="button" className="pe-icon" onClick={doRedo} disabled={!hist.canRedo || busy} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
            <Redo2 size={20} aria-hidden="true" />
          </button>
          <button type="button" className="pe-done" onClick={done} disabled={!work || busy || aiBusy} data-autofocus>
            {busy ? <span className="pe-spinner" aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
            {busy ? 'Saving…' : doneLabel}
          </button>
        </div>
      </header>

      <div
        className={`pe-stage${cropping ? ' cropping' : ''}`} ref={stageRef}
        onPointerDown={holdStart} onPointerUp={holdEnd} onPointerCancel={holdEnd} onPointerLeave={holdEnd}
        onContextMenu={(e) => e.preventDefault()}
      >
        {loadError ? (
          <div className="pe-state" role="alert">
            <p>{loadError}</p>
            <button type="button" className="pe-btn" onClick={() => onCancel?.()}>Close</button>
          </div>
        ) : !work ? (
          <div className="pe-state" role="status"><span className="pe-spinner lg" aria-hidden="true" /> Opening photo…</div>
        ) : null}
        <div className="pe-canvas-wrap" style={view ? { width: view.cssW, height: view.cssH } : { display: 'none' }}>
          <canvas
            ref={canvasRef} className="pe-canvas" role="img"
            aria-label={showOriginal ? 'Original photo' : cropping ? 'Photo with crop area' : `Edited photo${aiStack.length ? ` (${pixelText})` : ''}: ${summary}`}
          />
          {cropping && view && (
            <CropOverlay
              crop={recipe.crop} ratio={ratio} frameW={frame.w} frameH={frame.h} straighten={recipe.straighten}
              onChange={(c) => { cropBase.current = null; change((r) => ({ ...r, crop: c })) }} onCommit={commit} describedBy={hintId}
            />
          )}
          {showAiOriginal && <canvas ref={origRef} className="pe-canvas pe-orig" aria-hidden="true" />}
          <div className="pe-ai-layer" ref={setAiLayer} />
          {showOriginal && <span className="pe-badge" aria-hidden="true">Original</span>}
        </div>
      </div>

      <div className="pe-under">
        <button
          type="button" className="pe-chip" aria-pressed={comparing} onClick={() => { setComparing((c) => !c); say(comparing ? 'Showing your edit' : 'Showing the original') }}
          disabled={cropping || !work}
        >
          <SplitSquareHorizontal size={16} aria-hidden="true" /> Compare
        </button>
        <span className="pe-summary" id={hintId}>
          {cropping ? 'Drag the box or its corners. Arrow keys move it, Shift + arrows resize.'
            : flatView ? 'Whole photo shown'
            : aiStack.length ? (isIdentity(recipe) ? pixelText : `${pixelText} · ${summary}`)
            : dirty || !isIdentity(recipe) ? summary : 'Hold the photo to see the original'}
        </span>
        <button
          type="button" className="pe-chip" onClick={openStudio} disabled={!work || busy || aiBusy || studioBusy}
          aria-label="Advanced editing in Studio" title="Advanced (Studio): layers, brushes, clone, text, shapes"
        >
          {studioBusy ? <span className="pe-spinner" aria-hidden="true" /> : <Layers size={16} aria-hidden="true" />} Studio
        </button>
        <button type="button" className="pe-chip" onClick={resetAll} disabled={isIdentity(recipe) || busy}>
          <RotateCcw size={16} aria-hidden="true" /> Reset all
        </button>
      </div>

      {/* The AI panel stays mounted (hidden) so a running AI job survives switching tabs. */}
      <div className="pe-panel" role="tabpanel" id="pe-panel-ai" aria-labelledby="pe-tab-ai" hidden={tab !== 'ai'}>
        <AiPanel
          active={tab === 'ai'} work={work} layer={aiLayer} steps={aiStack.map((s) => s.label)}
          applyBase={applyBase} undoBase={undoBase} clearBase={clearBase} runAuto={runAuto} autoText={autoText}
          setFlat={setFlat} setJobBusy={setAiBusy} saving={busy} say={say}
        />
      </div>
      {tab !== 'ai' && <div className="pe-panel" role="tabpanel" id={`pe-panel-${tab}`} aria-labelledby={`pe-tab-${tab}`}>
        {tab === 'presets' && <PresetsPanel recipe={recipe} work={work} change={change} commit={commit} say={say} />}
        {(tab === 'light' || tab === 'color' || tab === 'effects') && (
          <AdjustPanel group={tab} recipe={recipe} setAdjust={setAdjust} commit={commit} onAuto={tab === 'light' && work ? runAuto : null} />
        )}
        {tab === 'crop' && (
          <CropPanel
            recipe={recipe} setAspect={setAspect} setStraighten={setStraighten} endStraighten={endStraighten}
            rotate={rotate} flip={flip} resetCrop={resetCrop}
          />
        )}
      </div>}

      {(error || allowBeforeAfter) && (
        <div className="pe-foot">
          {error && <p className="pe-error" role="alert">{error}</p>}
          {allowBeforeAfter && (
            <label className="pe-pair">
              <input type="checkbox" checked={pair} onChange={(e) => setPair(e.target.checked)} disabled={busy} />
              <span>
                Post as before &amp; after
                <small>{isIdentity(recipe) && !aiStack.length ? 'Make an edit first. ' : ''}The original becomes the “before”{aiStack.length ? `, the ${aiStack.every((s) => s.kind === 'studio') ? 'Studio' : 'AI'} edit the “after”` : ''}.</small>
              </span>
            </label>
          )}
        </div>
      )}

      <Tabs tab={tab} setTab={setTab} />
      <div className="pe-sr" aria-live="polite" role="status">{message}</div>

      {studio && (
        <StudioLayer
          source={studio.blob} name="Photo" onDone={studioDone} onCancel={() => setStudio(null)}
          doneLabel="Apply" note="Your edit so far opens here. Apply brings it back to the editor."
        />
      )}

      <Sheet open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Discard your edits?">
        <p className="muted small">The photo stays as it was.</p>
        <div className="sheet-actions">
          <button className="btn danger-solid block" onClick={() => { setConfirmCancel(false); onCancel?.() }}>Discard edits</button>
          <button className="btn ghost block" onClick={() => setConfirmCancel(false)}>Keep editing</button>
        </div>
      </Sheet>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bottom tabs
// ---------------------------------------------------------------------------
function Tabs({ tab, setTab }) {
  const refs = useRef({})
  const onKey = (e) => {
    const i = TABS.findIndex((t) => t.id === tab)
    const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i - 1 + TABS.length) % TABS.length
      : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1
    if (next < 0) return
    e.preventDefault()
    setTab(TABS[next].id)
    refs.current[TABS[next].id]?.focus()
  }
  return (
    <nav className="pe-tabs" role="tablist" aria-label="Editing tools" onKeyDown={onKey}>
      {TABS.map(({ id, label, icon: Icon }) => (
        <button
          key={id} type="button" role="tab" id={`pe-tab-${id}`} aria-selected={tab === id} aria-controls={`pe-panel-${id}`}
          tabIndex={tab === id ? 0 : -1} className={`pe-tab${tab === id ? ' on' : ''}`} onClick={() => setTab(id)}
          ref={(el) => { refs.current[id] = el }}
        >
          <Icon size={20} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}

// ---------------------------------------------------------------------------
// Sliders
// ---------------------------------------------------------------------------
function Slider({ id, label, value, min, max, step = 1, format, onInput, onCommit, onReset, mark = null }) {
  const lastTap = useRef(0)
  const zeroAt = min < 0 ? ((0 - min) / (max - min)) * 100 : 0
  const at = ((value - min) / (max - min)) * 100
  const from = Math.min(zeroAt, at), to = Math.max(zeroAt, at)
  // Double-tap (touch) or double-click resets.
  const onPointerUp = (e) => {
    const now = e.timeStamp
    if (e.pointerType === 'touch' && now - lastTap.current < 320) { onReset(); lastTap.current = 0 } else lastTap.current = now
    onCommit?.()
  }
  return (
    <div className="pe-slider">
      <div className="pe-slider-head">
        <label htmlFor={id}>{label}</label>
        <button type="button" className="pe-value" onClick={onReset} disabled={value === 0} aria-label={`Reset ${label}`} title="Reset (or double-tap the slider)">
          {format(value)}
        </button>
      </div>
      <div className="pe-range-wrap" style={{ '--from': `${from}%`, '--to': `${to}%`, '--zero': zeroAt / 100 }}>
        {mark !== null && <span className="pe-mark" style={{ left: `calc(11px + (100% - 22px) * ${(mark - min) / (max - min)})` }} aria-hidden="true" />}
        <input
          id={id} type="range" min={min} max={max} step={step} value={value} aria-valuetext={format(value)}
          onChange={(e) => onInput(Number(e.target.value))} onPointerUp={onPointerUp} onKeyUp={onCommit}
          onDoubleClick={onReset}
        />
      </div>
    </div>
  )
}

function AdjustPanel({ group, recipe, setAdjust, commit, onAuto = null }) {
  const preset = recipe.filter && getPreset(recipe.filter.id)
  const uid = useId()
  return (
    <div className="pe-sliders">
      {onAuto && (
        <div className="pe-auto-row">
          <button type="button" className="pe-chip" onClick={onAuto}><WandSparkles size={15} aria-hidden="true" /> Auto</button>
          <span className="pe-note">Sets these and the white balance for you.</span>
        </div>
      )}
      {preset && (
        <p className="pe-note">On top of the {preset.name} look{recipe.filter.strength < 100 ? ` (${recipe.filter.strength}%)` : ''}. Dots show what the look adds.</p>
      )}
      {ADJUSTMENTS.filter((a) => a.group === group).map((a) => {
        const lookAdds = preset?.adjust[a.key] ? Math.round(preset.adjust[a.key] * (recipe.filter.strength / 100)) : null
        return (
          <Slider
            key={a.key} id={`${uid}-${a.key}`} label={a.label} value={recipe.adjust[a.key]} min={a.min} max={a.max}
            format={(v) => formatAdjust(a.key, v)} mark={lookAdds}
            onInput={(v) => setAdjust(a.key, v)} onCommit={commit} onReset={() => setAdjust(a.key, 0, { commit: true })}
          />
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------
function usePresetThumbs(work, recipe) {
  const [thumbs, setThumbs] = useState({})
  const small = useMemo(() => {
    if (!work) return null
    const s = Math.min(1, THUMB_EDGE / Math.max(work.width, work.height))
    return drawScaled(work.canvas, Math.max(1, Math.round(work.width * s)), Math.max(1, Math.round(work.height * s)))
  }, [work])
  // Thumbnails follow the crop and the user's own sliders, not the current look.
  const key = JSON.stringify({ ...recipe, filter: null })
  useEffect(() => {
    if (!small) return undefined
    let live = true
    const t = setTimeout(() => {
      const canvas = document.createElement('canvas')
      const r = createRenderer(canvas)
      try {
        r.setImage(small)
        const base = normalize(JSON.parse(key))
        const size = outputSize(base, small.width, small.height)
        const s = Math.min(1, 140 / Math.max(size.width, size.height))
        const w = Math.max(1, Math.round(size.width * s)), h = Math.max(1, Math.round(size.height * s))
        const out = {}
        for (const p of [{ id: null }, ...PRESETS]) {
          r.render({ ...base, filter: p.id ? { id: p.id, strength: 100 } : null }, { width: w, height: h })
          out[p.id ?? 'none'] = canvas.toDataURL('image/jpeg', 0.82)
        }
        if (live) setThumbs(out)
      } finally {
        r.destroy()
      }
    }, 250)
    return () => { live = false; clearTimeout(t) }
  }, [small, key])
  return thumbs
}

function PresetsPanel({ recipe, work, change, commit, say }) {
  const thumbs = usePresetThumbs(work, recipe)
  const uid = useId()
  const list = [{ id: null, name: 'None' }, ...PRESETS]
  const current = recipe.filter?.id ?? null
  const refs = useRef({})
  const pick = (id) => {
    change((r) => ({ ...r, filter: id ? { id, strength: r.filter?.id === id ? r.filter.strength : 100 } : null }), { commit: true })
  }
  const onKey = (e) => {
    const i = list.findIndex((p) => p.id === current)
    const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? Math.min(list.length - 1, i + 1)
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? Math.max(0, i - 1) : -1
    if (next < 0) return
    e.preventDefault()
    pick(list[next].id)
    refs.current[list[next].id ?? 'none']?.focus()
  }
  const preset = current && getPreset(current)
  return (
    <div className="pe-presets">
      <div className="pe-strip" role="radiogroup" aria-label="Looks" onKeyDown={onKey}>
        {list.map((p) => {
          const k = p.id ?? 'none'
          const on = p.id === current
          return (
            <button
              key={k} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} className={`pe-look${on ? ' on' : ''}`}
              onClick={() => pick(p.id)} ref={(el) => { refs.current[k] = el }}
            >
              <span className="pe-look-img">{thumbs[k] ? <img src={thumbs[k]} alt="" draggable={false} /> : null}</span>
              <span className="pe-look-name">{p.name}</span>
            </button>
          )
        })}
      </div>
      {preset ? (
        <div className="pe-strength">
          <Slider
            id={`${uid}-strength`} label={`${preset.name} strength`} value={recipe.filter.strength} min={0} max={100}
            format={(v) => `${v}%`} onCommit={commit}
            onInput={(v) => change((r) => ({ ...r, filter: { id: preset.id, strength: Math.max(1, v) } }))}
            onReset={() => change((r) => ({ ...r, filter: { id: preset.id, strength: 100 } }), { commit: true })}
          />
          <button
            type="button" className="pe-link"
            onClick={() => { change((r) => bakeFilter(r), { commit: true }); say(`${preset.name} moved into the sliders`) }}
          >
            Fine-tune this look in the sliders
          </button>
        </div>
      ) : (
        <p className="pe-note">Pick a look, then fine-tune it in Light, Color and Effects.</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Crop
// ---------------------------------------------------------------------------
function CropPanel({ recipe, setAspect, setStraighten, endStraighten, rotate, flip, resetCrop }) {
  const uid = useId()
  const visible = ASPECTS.filter((a) => !a.hidden)
  const base = ASPECTS.find((a) => a.id === recipe.aspect)
  const selected = base?.hidden ? ASPECTS.find((a) => a.swap === recipe.aspect)?.id : recipe.aspect
  const swappable = base && base.swap && base.swap !== base.id
  const refs = useRef({})
  const onKey = (e) => {
    const i = visible.findIndex((a) => a.id === selected)
    const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? Math.min(visible.length - 1, i + 1)
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? Math.max(0, i - 1) : -1
    if (next < 0) return
    e.preventDefault()
    setAspect(visible[next].id)
    refs.current[visible[next].id]?.focus()
  }
  const portrait = ['4:5', '2:3', '9:16'].includes(recipe.aspect)
  const geometryChanged = recipe.rotate || recipe.straighten || recipe.flipH || recipe.aspect !== 'original' ||
    recipe.crop.x > 0 || recipe.crop.y > 0 || recipe.crop.w < 1 || recipe.crop.h < 1
  return (
    <div className="pe-cropbar">
      <div className="pe-aspects">
        <div className="pe-strip compact" role="radiogroup" aria-label="Aspect ratio" onKeyDown={onKey}>
          {visible.map((a) => (
            <button
              key={a.id} type="button" role="radio" aria-checked={selected === a.id} tabIndex={selected === a.id ? 0 : -1}
              className={`pe-aspect${selected === a.id ? ' on' : ''}`} onClick={() => setAspect(a.id)} ref={(el) => { refs.current[a.id] = el }}
            >
              {a.id === selected && base?.hidden ? base.label : a.label}
            </button>
          ))}
        </div>
        <button
          type="button" className="pe-icon sm" onClick={() => setAspect(swappedAspect(recipe.aspect))} disabled={!swappable}
          aria-label={portrait ? 'Make the crop landscape' : 'Make the crop portrait'} title="Swap orientation"
        >
          <ArrowLeftRight size={18} aria-hidden="true" />
        </button>
      </div>
      <Slider
        id={`${uid}-straighten`} label="Straighten" value={recipe.straighten} min={-45} max={45} step={0.1}
        format={(v) => (v === 0 ? '0°' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}°`)}
        onInput={setStraighten} onCommit={endStraighten} onReset={() => { setStraighten(0); endStraighten() }}
      />
      <div className="pe-crop-actions">
        <button type="button" className="pe-btn" onClick={rotate}><RotateCw size={18} aria-hidden="true" /> Rotate</button>
        <button type="button" className="pe-btn" onClick={flip} aria-pressed={recipe.flipH}><FlipHorizontal2 size={18} aria-hidden="true" /> Flip</button>
        <button type="button" className="pe-btn" onClick={resetCrop} disabled={!geometryChanged}><RotateCcw size={18} aria-hidden="true" /> Reset</button>
      </div>
    </div>
  )
}

export { PhotoEditor }
