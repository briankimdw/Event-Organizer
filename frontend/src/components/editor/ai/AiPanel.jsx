import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Brush, Download, Eraser, Expand, Scissors, SquareDashed, Undo2, WandSparkles, X } from 'lucide-react'
import { aiCapabilities, eraseObject, isCancel, removeBackground, upscale, UPSCALE_MAX_INPUT_EDGE } from '../../../api/ai.js'
import { DISPLAY_EDGE } from '../../../lib/editor/renderWeb.js'
import { blobToCanvas, canvasToBlob, compositeCutout, downloadBlob, maskBlob, maskCoverage } from './aiImage.js'
import MaskPainter from './MaskPainter.jsx'

const TOOLS = [
  { id: 'auto', label: 'Auto', icon: WandSparkles },
  { id: 'background', label: 'Background', icon: Scissors },
  { id: 'erase', label: 'Erase', icon: Eraser },
  { id: 'upscale', label: 'Upscale', icon: Expand },
]
const SWATCHES = [
  { color: '#ffffff', name: 'White' }, { color: '#f1ece4', name: 'Cream' }, { color: '#d9dde3', name: 'Light grey' },
  { color: '#1d1d1f', name: 'Black' }, { color: '#c9dff2', name: 'Sky blue' }, { color: '#f6d5cc', name: 'Blush' },
]
const BRUSH = { min: 1, max: 12, initial: 5 } // % of the long edge

/**
 * The editor's AI tab. AI results are pixel edits: each one becomes the editor's new working base
 * (PhotoEditor keeps the stack, so it can be undone), and the recipe keeps applying on top.
 *
 * props:
 *   active          the AI tab is showing (the panel stays mounted so a running job survives tab switches)
 *   work            the current working image (renderWeb loadWorkingImage(): { canvas, width, height, fullWidth, fullHeight })
 *   layer           element over the preview to portal overlays into (mask brush, cut-out preview)
 *   steps           labels of the AI edits applied so far
 *   applyBase(blob, label) -> Promise   make an AI result the new base
 *   undoBase(), clearBase()
 *   runAuto() -> adjust | null           auto-enhance (sets the sliders); autoText: what it did
 *   setFlat(bool)   show the whole photo, uncropped (painting a mask / previewing a cut-out)
 *   setJobBusy(bool), saving (Done is running), say(text)
 */
export default function AiPanel({ active, work, layer, steps, applyBase, undoBase, clearBase, runAuto, autoText, setFlat, setJobBusy, saving, say }) {
  const uid = useId()
  const [tool, setTool] = useState('auto')
  const [caps, setCaps] = useState(null)
  const [job, setJob] = useState(null) // { tool, label, ctrl, t0 }
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [cut, setCut] = useState(null) // { canvas, blob, bg: 'transparent' | 'color' | 'blur', color, blur }
  const [strokes, setStrokes] = useState([])
  const [brushMode, setBrushMode] = useState('brush')
  const [brushSize, setBrushSize] = useState(BRUSH.initial)
  const [rect, setRect] = useState(null)
  const [scale, setScale] = useState(2)
  const toolRefs = useRef({})
  const jobRef = useRef(null)

  // ---- capabilities: when the tab is first opened ----
  const loadCaps = useCallback(async (force = false) => {
    setCaps((c) => (c ? { ...c, loading: true } : { loading: true }))
    const c = await aiCapabilities({ force })
    setCaps(c)
  }, [])
  const asked = useRef(false)
  useEffect(() => {
    if (active && !asked.current) { asked.current = true; loadCaps() }
  }, [active, loadCaps])

  // ---- the overlay modes ----
  const painting = active && tool === 'erase' && !cut
  const previewingCut = active && !!cut
  useEffect(() => { setFlat(painting || previewingCut) }, [painting, previewingCut, setFlat])
  useEffect(() => () => setFlat(false), [setFlat])

  // ---- jobs: one at a time, cancellable, with elapsed time ----
  useEffect(() => {
    if (!job) return undefined
    const t = setInterval(() => setElapsed(Math.round((Date.now() - job.t0) / 1000)), 500)
    return () => clearInterval(t)
  }, [job])
  useEffect(() => () => jobRef.current?.ctrl.abort(), [])
  useEffect(() => { setJobBusy(!!job) }, [job, setJobBusy])

  const run = async (toolId, label, fn) => {
    if (jobRef.current || !work) return
    const ctrl = new AbortController()
    const j = { tool: toolId, label, ctrl, t0: Date.now() }
    jobRef.current = j
    setJob(j); setElapsed(0); setError(''); setNotice('')
    say(`${label}…`)
    try {
      await fn(ctrl.signal)
    } catch (e) {
      if (isCancel(e) || ctrl.signal.aborted) { setNotice('Cancelled. Nothing changed.'); say('Cancelled') }
      else {
        setError(e.message || 'The AI tool failed. Try again.')
        if (['offline', 'unavailable', 'signed_out', 'not_configured'].includes(e.code)) loadCaps(true)
      }
    } finally {
      jobRef.current = null
      setJob(null)
    }
  }
  const cancelJob = () => jobRef.current?.ctrl.abort()

  // The base image as the service gets it: the upright working copy (at most 2048 px, like the post).
  const inputBlob = (type = 'image/jpeg') => canvasToBlob(work.canvas, type, 0.95)

  // ---- tools ----
  const doRemoveBg = () => run('background', 'Removing the background', async (signal) => {
    const res = await removeBackground(await inputBlob(), { signal })
    const canvas = await blobToCanvas(res.blob)
    if (signal.aborted) return
    setCut({ canvas, blob: res.blob, bg: 'transparent', color: SWATCHES[0].color, blur: 0.5 })
    setNotice('AI result: background removed. Choose what goes behind the subject.')
    say('Background removed. Choose a new background.')
  })
  const cutBg = cut && (cut.bg === 'color' ? { kind: 'color', color: cut.color } : cut.bg === 'blur' ? { kind: 'blur', original: work?.canvas, amount: cut.blur } : { kind: 'transparent' })
  const applyCut = () => run('background', 'Applying the new background', async () => {
    const out = compositeCutout(cut.canvas, cutBg)
    await applyBase(await canvasToBlob(out, 'image/jpeg', 0.95), cut.bg === 'blur' ? 'Background blurred' : 'Background replaced')
    setCut(null)
    setNotice('AI result applied: new background.')
    say('New background applied')
  })
  const downloadCut = () => {
    downloadBlob(cut.blob, 'cutout.png')
    say('Transparent PNG downloaded')
  }

  const addRect = () => {
    if (!rect || rect.w < 0.01 || rect.h < 0.01) return
    setStrokes((s) => [...s, { kind: 'rect', ...rect }])
    say('Area added to the selection')
  }
  const coverage = maskCoverage(strokes)
  const doErase = () => run('erase', 'Erasing', async (signal) => {
    const mask = await maskBlob(strokes, work.width, work.height)
    const res = await eraseObject(await inputBlob(), mask, { signal })
    if (signal.aborted) return
    await applyBase(res.blob, 'Object erased')
    setStrokes([])
    setNotice('AI result: erased. Paint again to erase more.')
    say('Erased. The photo now shows the AI result.')
  })

  const longEdge = work ? Math.max(work.fullWidth || work.width, work.fullHeight || work.height) : 0
  const upMax = caps?.tools?.upscale?.maxInputEdge || UPSCALE_MAX_INPUT_EDGE
  const fullW = work ? work.fullWidth || work.width : 0
  const fullH = work ? work.fullHeight || work.height : 0
  const upTooBig = longEdge > upMax
  const doUpscale = () => run('upscale', `Upscaling ×${scale}`, async (signal) => {
    const res = await upscale(await inputBlob('image/png'), scale, { signal })
    if (signal.aborted) return
    await applyBase(res.blob, `Upscaled ×${scale}`)
    setNotice(`AI result: upscaled to ${res.width || fullW * scale} × ${res.height || fullH * scale}.`)
    say(`Upscaled ${scale} times`)
  })

  const doAuto = () => {
    const a = runAuto()
    if (a) setNotice('')
  }

  // ---- keyboard for the tool strip (radiogroup, roving focus) ----
  const onToolKey = (e) => {
    const i = TOOLS.findIndex((t) => t.id === tool)
    const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? Math.min(TOOLS.length - 1, i + 1)
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? Math.max(0, i - 1) : -1
    if (next < 0) return
    e.preventDefault()
    setTool(TOOLS[next].id)
    toolRefs.current[TOOLS[next].id]?.focus()
  }

  const capsLoading = !caps || caps.loading
  const toolCaps = (id) => (id === 'background' ? caps?.tools?.removeBackground : caps?.tools?.[id])
  const offline = caps && !caps.loading && !caps.ok
  const disabledAll = !!job || saving || !work
  const reasonId = `${uid}-reason`
  const tc = toolCaps(tool)
  const toolOff = tool !== 'auto' && (!capsLoading && !tc?.available)

  return (
    <div className="pe-ai">
      <div className="pe-strip compact pe-ai-tools" role="radiogroup" aria-label="AI tool" onKeyDown={onToolKey}>
        {TOOLS.map(({ id, label, icon: Icon }) => {
          const off = id !== 'auto' && caps && !caps.loading && !toolCaps(id)?.available
          return (
            <button
              key={id} type="button" role="radio" aria-checked={tool === id} tabIndex={tool === id ? 0 : -1}
              className={`pe-aspect pe-ai-tool${tool === id ? ' on' : ''}${off ? ' off' : ''}`}
              onClick={() => setTool(id)} ref={(el) => { toolRefs.current[id] = el }}
            >
              <Icon size={15} aria-hidden="true" /> {label}
            </button>
          )
        })}
      </div>

      <div className="pe-ai-body">
        {job ? (
          <div className="pe-ai-job" role="status">
            <span className="pe-spinner" aria-hidden="true" />
            <span className="pe-ai-job-text">{job.label}… <span className="pe-ai-time">{elapsed}s</span></span>
            <button type="button" className="pe-chip" onClick={cancelJob}><X size={15} aria-hidden="true" /> Cancel</button>
          </div>
        ) : null}

        {tool !== 'auto' && toolOff && (
          <p className="pe-note pe-ai-reason" id={reasonId}>
            {offline ? caps.error?.message : tc?.reason || 'Not available on this server.'}
            {offline && caps.error?.code !== 'not_configured' && (
              <> <button type="button" className="pe-link" onClick={() => loadCaps(true)}>Try again</button></>
            )}
          </p>
        )}
        {tool !== 'auto' && capsLoading && <p className="pe-note" role="status">Checking which AI tools are available…</p>}

        {tool === 'auto' && (
          <div className="pe-ai-tool-body">
            <p className="pe-note">Balances exposure, contrast, highlights, shadows, white balance and vibrance, on this device. The sliders show what it set.</p>
            <button type="button" className="pe-btn wide" onClick={doAuto} disabled={disabledAll}>
              <WandSparkles size={18} aria-hidden="true" /> Auto-enhance
            </button>
            {autoText && <p className="pe-note pe-ai-done">Auto: {autoText}</p>}
          </div>
        )}

        {tool === 'background' && !cut && (
          <div className="pe-ai-tool-body">
            <p className="pe-note">Finds the subject and removes everything behind it. Then pick a colour, a blurred background, or download a transparent PNG.</p>
            <button
              type="button" className="pe-btn wide" onClick={doRemoveBg} disabled={disabledAll || toolOff || capsLoading}
              aria-describedby={toolOff ? reasonId : undefined}
            >
              <Scissors size={18} aria-hidden="true" /> Remove background
            </button>
          </div>
        )}
        {tool === 'background' && cut && (
          <div className="pe-ai-tool-body">
            <div className="pe-strip compact" role="radiogroup" aria-label="New background">
              {[['transparent', 'Transparent'], ['color', 'Colour'], ['blur', 'Blurred']].map(([id, label]) => (
                <button
                  key={id} type="button" role="radio" aria-checked={cut.bg === id} tabIndex={cut.bg === id ? 0 : -1}
                  className={`pe-aspect${cut.bg === id ? ' on' : ''}`} onClick={() => setCut((c) => ({ ...c, bg: id }))}
                  onKeyDown={(e) => {
                    const ids = ['transparent', 'color', 'blur']
                    const i = ids.indexOf(cut.bg)
                    const n = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? Math.min(2, i + 1) : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? Math.max(0, i - 1) : -1
                    if (n < 0) return
                    e.preventDefault()
                    setCut((c) => ({ ...c, bg: ids[n] }))
                    e.currentTarget.parentElement.children[n]?.focus()
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {cut.bg === 'color' && (
              <div className="pe-ai-swatches" role="group" aria-label="Background colour">
                {SWATCHES.map((s) => (
                  <button
                    key={s.color} type="button" className="pe-swatch" style={{ background: s.color }} aria-label={s.name}
                    aria-pressed={cut.color === s.color} onClick={() => setCut((c) => ({ ...c, color: s.color }))}
                  />
                ))}
                <label className="pe-swatch pe-swatch-pick" title="Pick any colour">
                  <span className="pe-sr">Any colour</span>
                  <input type="color" value={cut.color} onChange={(e) => setCut((c) => ({ ...c, color: e.target.value }))} />
                </label>
              </div>
            )}
            {cut.bg === 'blur' && (
              <div className="pe-ai-row">
                <label htmlFor={`${uid}-blur`} className="pe-ai-label">Blur</label>
                <input
                  id={`${uid}-blur`} type="range" className="pe-ai-range" min={0} max={100} value={Math.round(cut.blur * 100)}
                  aria-valuetext={`${Math.round(cut.blur * 100)}%`} onChange={(e) => setCut((c) => ({ ...c, blur: Number(e.target.value) / 100 }))}
                />
              </div>
            )}
            {cut.bg === 'transparent' && (
              <p className="pe-note">Posts are JPEGs, so they can’t be transparent: download the PNG, or pick a colour or blur to use it here.</p>
            )}
            <div className="pe-ai-actions">
              <button type="button" className="pe-btn" onClick={() => { setCut(null); say('Background result discarded') }} disabled={!!job}>Discard</button>
              {cut.bg === 'transparent' ? (
                <button type="button" className="pe-btn primary" onClick={downloadCut}><Download size={17} aria-hidden="true" /> Download PNG</button>
              ) : (
                <button type="button" className="pe-btn primary" onClick={applyCut} disabled={disabledAll}>Use this background</button>
              )}
            </div>
          </div>
        )}

        {tool === 'erase' && (
          <div className="pe-ai-tool-body">
            <div className="pe-ai-row">
              <div className="pe-strip compact" role="radiogroup" aria-label="Select with">
                {[['brush', 'Brush', Brush], ['area', 'Area', SquareDashed]].map(([id, label, Icon]) => (
                  <button
                    key={id} type="button" role="radio" aria-checked={brushMode === id} tabIndex={brushMode === id ? 0 : -1}
                    className={`pe-aspect${brushMode === id ? ' on' : ''}`}
                    onClick={() => { setBrushMode(id); if (id === 'area' && !rect) setRect({ x: 0.35, y: 0.35, w: 0.3, h: 0.3 }) }}
                    onKeyDown={(e) => {
                      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
                      e.preventDefault()
                      const next = brushMode === 'brush' ? 'area' : 'brush'
                      setBrushMode(next)
                      if (next === 'area' && !rect) setRect({ x: 0.35, y: 0.35, w: 0.3, h: 0.3 })
                      e.currentTarget.parentElement.querySelector(`[data-mode=${next}]`)?.focus()
                    }}
                    data-mode={id}
                  >
                    <Icon size={15} aria-hidden="true" /> {label}
                  </button>
                ))}
              </div>
              <button type="button" className="pe-icon sm" onClick={() => setStrokes((s) => s.slice(0, -1))} disabled={!strokes.length || !!job} aria-label="Undo last stroke" title="Undo last stroke">
                <Undo2 size={17} aria-hidden="true" />
              </button>
              <button type="button" className="pe-chip" onClick={() => setStrokes([])} disabled={!strokes.length || !!job}>Clear</button>
            </div>
            {brushMode === 'brush' ? (
              <div className="pe-ai-row">
                <label htmlFor={`${uid}-brush`} className="pe-ai-label">Brush size</label>
                <input
                  id={`${uid}-brush`} type="range" className="pe-ai-range" min={BRUSH.min} max={BRUSH.max} value={brushSize}
                  aria-valuetext={`${brushSize}% of the photo`} onChange={(e) => setBrushSize(Number(e.target.value))}
                />
              </div>
            ) : (
              <div className="pe-ai-row">
                <p className="pe-note pe-ai-hint" id={`${uid}-areahint`}>Drag on the photo, or focus the box: arrows move, Shift + arrows resize, Enter adds.</p>
                <button type="button" className="pe-chip" onClick={addRect} disabled={!rect || !!job}>Add area</button>
              </div>
            )}
            <div className="pe-ai-row">
              <p className="pe-note pe-ai-hint">
                {strokes.length
                  ? `${strokes.length} ${strokes.length === 1 ? 'mark' : 'marks'} · ${Math.max(1, Math.round(coverage * 100))}% of the photo.`
                  : brushMode === 'brush' ? 'Paint loosely over what to remove (people, wires, litter).' : 'Add a box around what to remove.'}
                {coverage > 0.25 ? ' Large areas come out soft.' : ''}
              </p>
              <button
                type="button" className="pe-btn primary" onClick={doErase} disabled={disabledAll || toolOff || capsLoading || !strokes.length}
                aria-describedby={toolOff ? reasonId : undefined}
              >
                <Eraser size={18} aria-hidden="true" /> Erase
              </button>
            </div>
          </div>
        )}

        {tool === 'upscale' && (
          <div className="pe-ai-tool-body">
            <div className="pe-strip compact" role="radiogroup" aria-label="Upscale by">
              {(caps?.tools?.upscale?.scales || [2, 4]).map((s) => (
                <button
                  key={s} type="button" role="radio" aria-checked={scale === s} tabIndex={scale === s ? 0 : -1}
                  className={`pe-aspect${scale === s ? ' on' : ''}`} onClick={() => setScale(s)}
                  onKeyDown={(e) => {
                    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
                    e.preventDefault()
                    const next = s === 2 ? 4 : 2
                    setScale(next)
                    e.currentTarget.parentElement.querySelector(`[data-scale="${next}"]`)?.focus()
                  }}
                  data-scale={s} disabled={upTooBig}
                >
                  ×{s}{!upTooBig && work ? ` · ${fullW * s} × ${fullH * s}` : ''}
                </button>
              ))}
            </div>
            <p className="pe-note" id={`${uid}-upnote`}>
              {upTooBig
                ? `Upscaling is for small photos, up to ${upMax} px on the long edge. This one is ${longEdge} px: already enough for a post (shown at up to ${DISPLAY_EDGE} px).`
                : `Now ${fullW} × ${fullH}. Adds detail with AI. Posts are shown at up to ${DISPLAY_EDGE} px.`}
            </p>
            <button
              type="button" className="pe-btn wide primary" onClick={doUpscale} disabled={disabledAll || toolOff || capsLoading || upTooBig}
              aria-describedby={toolOff ? reasonId : `${uid}-upnote`}
            >
              <Expand size={18} aria-hidden="true" /> Upscale ×{scale}
            </button>
          </div>
        )}

        {error && <p className="pe-error" role="alert">{error}</p>}
        {notice && !error && <p className="pe-note pe-ai-done" role="status">{notice}</p>}

        {steps.length > 0 && (
          <div className="pe-ai-steps">
            <p className="pe-note">
              <strong>AI edits:</strong> {steps.join(' → ')}. These change pixels, so the saved photo keeps no slider settings
              to reopen later. Your original stays untouched, and Revert brings it back.
            </p>
            <div className="pe-ai-actions">
              <button type="button" className="pe-btn" onClick={() => { setNotice(''); setError(''); undoBase() }} disabled={!!job || saving}><Undo2 size={16} aria-hidden="true" /> Undo AI edit</button>
              <button type="button" className="pe-btn" onClick={() => { setNotice(''); setError(''); clearBase() }} disabled={!!job || saving}>Remove all</button>
            </div>
          </div>
        )}
      </div>

      {layer && active && painting && createPortal(
        <MaskPainter
          strokes={strokes} onStroke={(s) => setStrokes((all) => [...all, s])} mode={brushMode} brushSize={brushSize / 100}
          rect={rect} setRect={setRect} onAddRect={addRect} describedBy={`${uid}-areahint`}
        />,
        layer,
      )}
      {layer && previewingCut && createPortal(<CutPreview cut={cut} bg={cutBg} />, layer)}
    </div>
  )
}

// The cut-out over its new background, drawn over the preview (checkerboard = transparent).
function CutPreview({ cut, bg }) {
  const ref = useRef(null)
  const key = `${bg.kind}|${bg.color || ''}|${bg.amount ?? ''}`
  useEffect(() => {
    const c = ref.current
    if (!c) return undefined
    const t = setTimeout(() => {
      const out = compositeCutout(cut.canvas, bg)
      c.width = out.width; c.height = out.height
      c.getContext('2d').drawImage(out, 0, 0)
    }, bg.kind === 'blur' ? 60 : 0)
    return () => clearTimeout(t)
  }, [cut, key]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={`pe-cut${bg.kind === 'transparent' ? ' checker' : ''}`}>
      <canvas ref={ref} role="img" aria-label={bg.kind === 'transparent' ? 'AI result: subject with a transparent background' : 'AI result: subject on the new background'} />
      <span className="pe-badge">AI result</span>
    </div>
  )
}
