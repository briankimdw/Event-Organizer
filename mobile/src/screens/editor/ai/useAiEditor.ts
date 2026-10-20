// State of the editor's AI tab: capabilities, the running request (one at a time, cancellable),
// errors, and each tool's options. EditorScreen owns the history; this hook commits into it.
import type { SkImage } from '@shopify/react-native-skia'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Platform, Share } from 'react-native'

import { announce } from '@/lib/a11y'
import type { EditRecipe } from '../contract'
import { applyAuto, autoFor, describeAuto, isAutoApplied } from './auto'
import {
  aiCapabilities, eraseObject, isCancel, makeAiError, removeBackground, upscale, UPSCALE_MAX_INPUT_EDGE,
  type AiCaps, type AiError, type ToolKey,
} from './client'
import { backdropLabel, flatten, type Backdrop } from './composite'
import { decodeImage, discard, writeImage } from './files'
import { AREAS, coverage, type Stroke } from './mask'
import { makeBase, maskForInput, workingEdge, workingInput, type Base } from './work'

export type AiTool = 'auto' | 'background' | 'erase' | 'upscale'
export type Work = { recipe: EditRecipe; base: number }

const TOOL_KEY: Record<Exclude<AiTool, 'auto'>, ToolKey> = { background: 'removeBackground', erase: 'erase', upscale: 'upscale' }
const DEFAULT_EDGE = 2048

type Job = { tool: AiTool; label: string; stage: string; started: number }
type Cutout = { cutout: SkImage; photo: SkImage; steps: string[] }

type Deps = {
  source: { uri: string; width?: number; height?: number }
  /** The original's preview (the working photo when no AI step is in). */
  original: { preview: SkImage | null; blur: SkImage | null }
  /** The committed work (recipe + base), read when a tool starts. */
  committed: () => Work
  /** What's on screen (for auto-enhance and the "already applied" state). */
  work: Work
  commit: (w: Work) => void
}

export function useAiEditor({ source, original, committed, work, commit }: Deps) {
  const [bases, setBases] = useState<Record<number, Base>>({})
  const basesRef = useRef(bases)
  useLayoutEffect(() => {
    basesRef.current = bases
  })
  const baseOf = useCallback((id: number): Base | null => (id ? basesRef.current[id] ?? null : null), [])

  // ---- capabilities ----------------------------------------------------------------
  const [caps, setCaps] = useState<AiCaps | null>(null)
  const loadCaps = useCallback(async (force = false) => {
    setCaps(null)
    const c = await aiCapabilities({ force })
    setCaps(c)
    return c
  }, [])
  useEffect(() => {
    let on = true
    aiCapabilities().then((c) => on && setCaps(c)).catch(() => {})
    return () => { on = false }
  }, [])

  /** Why a server tool can't be used right now (null = it can). */
  const reasonFor = useCallback((t: Exclude<AiTool, 'auto'>): string | null => {
    if (!caps) return 'Checking the AI tools…'
    if (!caps.ok) return caps.error?.message ?? 'AI tools are offline right now.'
    const tc = caps.tools[TOOL_KEY[t]]
    if (!tc?.available) return tc?.reason ?? 'Not available on this server.'
    return null
  }, [caps])

  // ---- the running request -----------------------------------------------------------
  const [tool, setTool] = useState<AiTool>('auto')
  const [job, setJob] = useState<Job | null>(null)
  const [error, setError] = useState<{ tool: AiTool; message: string; code: string } | null>(null)
  const ctrl = useRef<AbortController | null>(null)
  const alive = useRef(true)
  useEffect(() => () => {
    alive.current = false
    ctrl.current?.abort()
  }, [])

  const run = useCallback(async <T,>(t: AiTool, label: string, fn: (signal: AbortSignal, stage: (s: string) => void) => Promise<T>): Promise<T | null> => {
    if (ctrl.current) return null // one request at a time
    const c = new AbortController()
    ctrl.current = c
    setError(null)
    setJob({ tool: t, label, stage: 'Preparing the photo…', started: Date.now() })
    announce(`${label}. This can take a little while.`)
    try {
      const out = await fn(c.signal, (stage) => alive.current && setJob((j) => (j ? { ...j, stage } : j)))
      if (c.signal.aborted) throw makeAiError('cancelled')
      return out
    } catch (e: any) {
      if (!alive.current) return null
      if (isCancel(e) || c.signal.aborted) {
        announce('Cancelled')
        return null
      }
      const err = e as AiError
      const message = err?.message || 'The AI tool failed. Try again.'
      setError({ tool: t, message, code: err?.code || 'server' })
      announce(message)
      if (err?.code === 'signed_out' || err?.code === 'offline' || err?.code === 'unavailable') loadCaps(true).catch(() => {})
      return null
    } finally {
      if (ctrl.current === c) ctrl.current = null
      if (alive.current) setJob(null)
    }
  }, [loadCaps])

  const cancel = useCallback(() => ctrl.current?.abort(), [])
  const clearError = useCallback(() => setError(null), [])

  const edgeFor = (t: Exclude<AiTool, 'auto'>) => caps?.tools?.[TOOL_KEY[t]]?.maxInputEdge || DEFAULT_EDGE

  const addBase = useCallback((b: Base, from: Work, announceText: string) => {
    setBases((m) => ({ ...m, [b.id]: b }))
    basesRef.current = { ...basesRef.current, [b.id]: b }
    commit({ recipe: from.recipe, base: b.id })
    announce(announceText)
  }, [commit])

  // Free the result files when the editor closes (except one handed back as a result's pixelBase).
  const kept = useRef(new Set<number>())
  const keepBase = useCallback((id: number) => { kept.current.add(id) }, [])
  useEffect(() => () => {
    for (const b of Object.values(basesRef.current)) if (!kept.current.has(b.id)) discard(b.uri)
  }, [])
  /** Drop every AI step (back to the original photo); the sliders / crop stay. One undo step. */
  const removeAll = useCallback(() => {
    const w = committed()
    if (!w.base) return
    commit({ ...w, base: 0 })
    announce('AI edits removed. Undo brings them back.')
  }, [committed, commit])

  // ---- Auto-enhance (on the phone, no server) -------------------------------------------
  const [lastAuto, setLastAuto] = useState<{ adjust: Parameters<typeof isAutoApplied>[1]; text: string } | null>(null)
  const autoApplied = !!lastAuto && isAutoApplied(work.recipe, lastAuto.adjust)
  const runAuto = useCallback(() => {
    const w = committed()
    const b = baseOf(w.base)
    const img = b?.preview ?? original.preview
    const blur = b?.blur ?? original.blur
    if (!img || !blur) return
    try {
      const res = autoFor(img, blur, w.recipe)
      const text = describeAuto(res.adjust)
      setLastAuto({ adjust: res.adjust, text })
      commit({ ...w, recipe: applyAuto(w.recipe, res.adjust) })
      announce(`Auto-enhance: ${text}`)
    } catch (e: any) {
      setError({ tool: 'auto', message: e?.message || 'Auto-enhance couldn’t read this photo.', code: 'bad_input' })
    }
  }, [committed, baseOf, original.preview, original.blur, commit])

  // ---- Remove background ------------------------------------------------------------------
  const [cut, setCut] = useState<Cutout | null>(null)
  const [backdrop, setBackdrop] = useState<Backdrop>({ kind: 'transparent' })
  const runBackground = useCallback(async () => {
    const w = committed()
    const b = baseOf(w.base)
    const res = await run('background', 'Removing the background', async (signal, stage) => {
      const input = await workingInput({ uri: source.uri, base: b }, edgeFor('background'))
      stage('Removing the background…')
      const out = await removeBackground(input.file, signal)
      stage('Finishing…')
      return { cutout: await decodeImage(out.bytes), photo: input.image }
    })
    if (!res) return
    setCut({ ...res, steps: [...(b?.steps ?? []), 'Background removed'] })
    setBackdrop({ kind: 'transparent' })
    announce('Background removed. Choose a background, then Use.')
  }, [committed, baseOf, run, source.uri, caps]) // eslint-disable-line react-hooks/exhaustive-deps

  const applyCutout = useCallback(async () => {
    if (!cut) return
    const w = committed()
    // Posts are JPEGs: a transparent cut-out is posted on white.
    const bd: Backdrop = backdrop.kind === 'transparent' ? { kind: 'color', color: '#ffffff' } : backdrop
    const flat = flatten(cut.cutout, bd, cut.photo)
    const base = await makeBase({ image: flat, type: 'image/jpeg' }, cut.steps)
    setCut(null)
    addBase(base, w, `Background replaced: ${backdropLabel(bd)}`)
  }, [cut, backdrop, committed, addBase])
  const discardCutout = useCallback(() => {
    setCut(null)
    announce('Background removal discarded')
  }, [])

  /** Share the transparent PNG (iOS share sheet: Save Image, Files, AirDrop…; web: download). */
  const canSharePng = Platform.OS === 'ios' || Platform.OS === 'web'
  const sharePng = useCallback(async () => {
    if (!cut) return
    const file = writeImage(cut.cutout, 'image/png')
    if (Platform.OS === 'web') {
      const a = document.createElement('a')
      a.href = file.uri
      a.download = 'cutout.png'
      a.click()
      return
    }
    await Share.share({ url: file.uri }).catch(() => {})
  }, [cut])

  // ---- Erase ------------------------------------------------------------------------------
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [maskMode, setMaskMode] = useState<'brush' | 'area'>('brush')
  const [brushSize, setBrushSize] = useState(36)
  const geoKey = JSON.stringify([work.base, work.recipe.crop, work.recipe.rotate, work.recipe.straighten, work.recipe.flipH])
  const lastGeo = useRef(geoKey)
  useEffect(() => {
    // The mask is painted on the photo as shown: a new crop / turn / photo starts a new mask.
    if (lastGeo.current !== geoKey) {
      lastGeo.current = geoKey
      setStrokes([])
    }
  }, [geoKey])
  const addStroke = useCallback((s: Stroke) => setStrokes((l) => [...l, s]), [])
  const toggleArea = useCallback((id: string) => {
    setStrokes((l) => {
      const has = l.some((s) => s.kind === 'area' && s.id === id)
      const a = AREAS.find((x) => x.id === id)!
      announce(`${a.label} ${has ? 'unmarked' : 'marked'}`)
      return has ? l.filter((s) => !(s.kind === 'area' && s.id === id)) : [...l, { kind: 'area', ...a }]
    })
  }, [])
  const undoStroke = useCallback(() => setStrokes((l) => l.slice(0, -1)), [])
  const clearMask = useCallback(() => setStrokes([]), [])
  const covered = coverage(strokes)

  const runErase = useCallback(async () => {
    if (!strokes.length) return
    const w = committed()
    const b = baseOf(w.base)
    const painted = strokes
    const res = await run('erase', 'Erasing', async (signal, stage) => {
      const input = await workingInput({ uri: source.uri, base: b }, edgeFor('erase'))
      const mask = maskForInput(painted, w.recipe, input.file.width, input.file.height)
      stage('Erasing…')
      try {
        const out = await eraseObject(input.file, mask, signal)
        stage('Finishing…')
        return await makeBase(out, [...(b?.steps ?? []), 'Erased'])
      } finally {
        discard(mask.uri)
      }
    })
    if (!res) return
    setStrokes([])
    addBase(res, w, 'Erased. Undo brings it back.')
  }, [strokes, committed, baseOf, run, source.uri, addBase, caps]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Upscale -----------------------------------------------------------------------------
  const [scale, setScale] = useState(2)
  const current = work.base ? bases[work.base] ?? null : null
  const edge = workingEdge(current, source, current?.preview ?? original.preview)
  const upMax = caps?.tools?.upscale?.maxInputEdge || UPSCALE_MAX_INPUT_EDGE
  const upscaleTooBig = edge != null && edge > upMax
    ? `Upscale is for small photos (up to ${upMax} px on the long side). This one is ${edge} px, already big enough to post.`
    : null
  const runUpscale = useCallback(async () => {
    const w = committed()
    const b = baseOf(w.base)
    const s = scale
    const res = await run('upscale', `Upscaling ${s}×`, async (signal, stage) => {
      const input = await workingInput({ uri: source.uri, base: b }, upMax)
      stage(`Upscaling ${s}×…`)
      const out = await upscale(input.file, s, signal)
      stage('Finishing…')
      return makeBase(out, [...(b?.steps ?? []), `Upscaled ${s}×`])
    })
    if (!res) return
    addBase(res, w, `Upscaled ${s} times: now ${res.width} by ${res.height} pixels.`)
  }, [committed, baseOf, run, source.uri, scale, upMax, addBase])

  return useMemo(() => ({
    caps, loadCaps, reasonFor,
    tool, setTool,
    job, cancel, error, clearError,
    baseOf, keepBase, removeAll,
    /** The AI result being edited (null = the original). */
    base: current,
    auto: { run: runAuto, applied: autoApplied, text: lastAuto?.text ?? null },
    background: { run: runBackground, cut, backdrop, setBackdrop, use: applyCutout, discard: discardCutout, share: canSharePng ? sharePng : null },
    erase: { run: runErase, strokes, addStroke, toggleArea, undo: undoStroke, clear: clearMask, mode: maskMode, setMode: setMaskMode, size: brushSize, setSize: setBrushSize, covered },
    upscale: { run: runUpscale, scale, setScale, scales: caps?.tools?.upscale?.scales ?? [2, 4], tooBig: upscaleTooBig, edge },
  }), [caps, loadCaps, reasonFor, tool, job, cancel, error, clearError, baseOf, keepBase, removeAll, current, runAuto, autoApplied, lastAuto, runBackground, cut, backdrop, applyCutout, discardCutout, canSharePng, sharePng, runErase, strokes, addStroke, toggleArea, undoStroke, clearMask, maskMode, brushSize, covered, runUpscale, scale, upscaleTooBig, edge])
}

export type AiEditor = ReturnType<typeof useAiEditor>
