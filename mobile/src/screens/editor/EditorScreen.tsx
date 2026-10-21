// The editor itself (loaded lazily by PhotoEditor.tsx once Skia is ready).
// Layout: top bar (Cancel · undo / redo / reset · Done), the photo, a one-line summary + Studio
// (studio/StudioSheet.tsx: the layers editor; its result is a new base like an AI step) +
// "Before & after" switch, the active tool's panel, the tool tabs.
// The history holds a Work: the recipe + which photo it applies to (0 = the original, or an AI
// result, see ai/work.ts), so Undo also steps back over AI steps.
import { Canvas, FilterMode, Group, ImageShader, MipmapMode, Rect, Shader, type SkImage } from '@shopify/react-native-skia'
import { Layers, Redo2, RotateCcw, Undo2, X } from 'lucide-react-native'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, PixelRatio, Platform, Pressable, StyleSheet, Switch, View, type LayoutChangeEvent } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { IconButton, Text } from '@/components'
import { announce, useReduceMotion, useScreenReader } from '@/lib/a11y'
import { makeStyles, useTheme } from '@/theme'
import {
  FULL_CROP, aspectRatio, cropForAspect, defaultRecipe, describe, fitCrop, flipRecipe, hasCrop, isIdentity,
  normalize, orientedSize, outputSize, rotateRecipe, sameRecipe, swappedAspect,
  type AdjustKey, type AspectId, type Crop, type EditRecipe,
} from './contract'
import { CropOverlay } from './CropOverlay'
import { renderToImage, saveJpeg } from './exportImage'
import { downscale, loadFull, loadPreview } from './loadImage'
import { AdjustPanel, CropPanel, PresetPanel } from './panels'
import { AiOverlay } from './ai/AiOverlay'
import { AiPanel } from './ai/AiPanel'
import { decodeImage, discard, writeImage } from './ai/files'
import { useAiEditor, type Work } from './ai/useAiEditor'
import { getEffect, makeBlur, uniformsFor, type Frame } from './pipeline'
import { EDITOR_BG, EDITOR_BG_RGB } from './chrome'
import { ToolTabs, type ToolId } from './ToolTabs'
import type { PhotoEditorProps } from './types'
import { useHistory } from './useHistory'
import { STUDIO_MAX_EDGE, studioUnavailableReason } from './studio/config'
import { StudioSheet, type StudioResult } from './studio/StudioSheet'

const PANEL_H = 236
const SAMPLING = { filter: FilterMode.Linear, mipmap: MipmapMode.None }
const PAD = 16
const CROP_PAD = 28 // room for the crop handles

export default function EditorScreen({ source, initialRecipe, mode = 'post', allowBeforeAfter, initialBeforeAfter, pixelEdited, onDone, onCancel }: PhotoEditorProps) {
  const s = useStyles()
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const reduceMotion = useReduceMotion()
  const screenReader = useScreenReader()

  const initial = useMemo(() => normalize(initialRecipe ?? null), []) // eslint-disable-line react-hooks/exhaustive-deps
  const hist = useHistory<Work>({ recipe: initial, base: 0 })
  // Callbacks read the history through a ref so they keep their identity (no slider re-renders
  // or gesture re-creation on every change).
  const hRef = useRef(hist)
  useLayoutEffect(() => {
    hRef.current = hist
  })
  const h = useMemo(() => ({
    get committed() { return hRef.current.committed.recipe },
    preview: (r: EditRecipe) => hRef.current.preview({ recipe: r, base: hRef.current.committed.base }),
    commit: (r: EditRecipe) => hRef.current.commit({ recipe: r, base: hRef.current.committed.base }),
    work: () => hRef.current.committed,
    commitWork: (w: Work) => hRef.current.commit(w),
  }), [])
  const work = hist.value
  const recipe = work.recipe
  const [tool, setTool] = useState<ToolId>('presets')
  const [preview, setPreview] = useState<SkImage | null>(null)
  const [thumb, setThumb] = useState<SkImage | null>(null)
  const [blur, setBlur] = useState<SkImage | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [area, setArea] = useState<{ w: number; h: number } | null>(null)
  const [comparing, setComparing] = useState(false)
  const [beforeAfter, setBeforeAfter] = useState(!!(allowBeforeAfter && initialBeforeAfter))
  const [busy, setBusy] = useState(false)

  // ---- load the photo ----------------------------------------------------------
  useEffect(() => {
    let alive = true
    setPreview(null) // eslint-disable-line react-hooks/set-state-in-effect -- a new photo: clear the old one
    setLoadError(null)
    loadPreview(source.uri)
      .then((img) => {
        if (!alive) return
        setBlur(makeBlur(img))
        setThumb(downscale(img, 220))
        setPreview(img)
      })
      .catch((e) => alive && setLoadError(e?.message || 'This photo couldn’t be opened.'))
    return () => { alive = false }
  }, [source.uri])

  // ---- AI tools (the AI tab) ----------------------------------------------------------
  const ai = useAiEditor({ source, original: { preview, blur }, committed: h.work, work, commit: h.commitWork })
  const base = ai.base
  // The working photo: the original, or the latest AI result. Compare always shows the original.
  const wPreview = base?.preview ?? preview
  const wBlur = base?.blur ?? blur
  const wThumb = base?.thumb ?? thumb
  const shownImg = comparing ? preview : wPreview
  const shownBlur = comparing ? blur : wBlur

  const pw = wPreview?.width() ?? source.width ?? 1
  const ph = wPreview?.height() ?? source.height ?? 1
  const oriented = orientedSize(pw, ph, recipe.rotate)
  const spw = shownImg?.width() ?? pw
  const sph = shownImg?.height() ?? ph

  // ---- recipe changes --------------------------------------------------------
  const setAdjustLive = useCallback((key: AdjustKey, v: number) => {
    const base = h.committed
    h.preview({ ...base, adjust: { ...base.adjust, [key]: v } })
  }, [h])
  const setAdjustCommit = useCallback((key: AdjustKey, v: number) => {
    const base = h.committed
    h.commit({ ...base, adjust: { ...base.adjust, [key]: v } })
  }, [h])

  const pickPreset = useCallback((id: string | null) => {
    const base = h.committed
    if ((base.filter?.id ?? null) === id) return
    h.commit({ ...base, filter: id ? { id, strength: base.filter?.strength ?? 100 } : null })
    announce(id ? `${id} preset applied` : 'Preset removed')
  }, [h])
  const strengthLive = useCallback((v: number) => {
    const base = h.committed
    if (base.filter) h.preview({ ...base, filter: { ...base.filter, strength: Math.round(v) } })
  }, [h])
  const strengthCommit = useCallback((v: number) => {
    const base = h.committed
    if (base.filter) h.commit({ ...base, filter: { ...base.filter, strength: Math.round(v) } })
  }, [h])

  // Crop
  const cropLive = useCallback((c: Crop) => h.preview({ ...h.committed, crop: c }), [h])
  const cropCommit = useCallback((c: Crop) => h.commit({ ...h.committed, crop: c }), [h])
  const setAspect = useCallback((a: AspectId) => {
    const base = h.committed
    const o = orientedSize(pw, ph, base.rotate)
    // Tapping the active aspect again (or its turned twin) keeps the current shape.
    h.commit({ ...base, aspect: a, crop: a === 'free' ? base.crop : cropForAspect(a, o.w, o.h, base.straighten) })
  }, [h, pw, ph])
  const swapAspect = useCallback(() => {
    const base = h.committed
    const a = swappedAspect(base.aspect)
    if (a === base.aspect) return
    const o = orientedSize(pw, ph, base.rotate)
    h.commit({ ...base, aspect: a, crop: cropForAspect(a, o.w, o.h, base.straighten) })
  }, [h, pw, ph])
  // Straighten: the crop shrinks to stay inside the turned picture, from the crop it had when
  // the drag started (so going back to 0 gives the old crop back).
  const straightenBase = useRef<Crop | null>(null)
  const straightenLive = useCallback((v: number) => {
    const base = h.committed
    straightenBase.current ??= base.crop
    const o = orientedSize(pw, ph, base.rotate)
    h.preview({ ...base, straighten: Math.round(v * 10) / 10, crop: fitCrop(straightenBase.current, o.w, o.h, v) })
  }, [h, pw, ph])
  const straightenCommit = useCallback((v: number) => {
    const base = h.committed
    const o = orientedSize(pw, ph, base.rotate)
    const from = straightenBase.current ?? base.crop
    straightenBase.current = null
    h.commit({ ...base, straighten: Math.round(v * 10) / 10, crop: fitCrop(from, o.w, o.h, v) })
  }, [h, pw, ph])
  const rotate = useCallback(() => { h.commit(rotateRecipe(h.committed)); announce('Rotated') }, [h])
  const flip = useCallback(() => { h.commit(flipRecipe(h.committed)); announce('Flipped') }, [h])
  const resetCrop = useCallback(() => {
    h.commit({ ...h.committed, crop: { ...FULL_CROP }, aspect: 'original', rotate: 0, straighten: 0, flipH: false })
  }, [h])
  const resetAll = useCallback(() => {
    h.commitWork({ recipe: defaultRecipe(), base: 0 })
    announce('All edits reset')
  }, [h])

  // ---- Studio (docs/STUDIO.md): the current render goes in, what comes back is the new base ----
  const [studio, setStudio] = useState<{ uri: string; width: number; height: number } | null>(null)
  const [studioPrep, setStudioPrep] = useState(false)
  const openStudio = useCallback(async () => {
    if (busy || !!ai.job || studioPrep || !preview) return
    const reason = Platform.OS === 'web' ? null : studioUnavailableReason()
    if (reason) {
      Alert.alert('Studio isn’t available', reason)
      return
    }
    if (Platform.OS === 'web') return setStudio({ uri: '', width: 0, height: 0 }) // says "use the website"
    setStudioPrep(true)
    announce('Opening Studio')
    try {
      await new Promise((r) => setTimeout(r, 30)) // let the spinner paint before the GPU work
      const w = hRef.current.committed
      const aiBase = ai.baseOf(w.base)
      const full = aiBase ? await decodeImage(aiBase.uri) : await loadFull(source.uri)
      const out = renderToImage(full, normalize(w.recipe), { maxEdge: STUDIO_MAX_EDGE })
      const file = writeImage(out.image, 'image/jpeg', 95)
      full.dispose?.()
      out.image.dispose?.()
      setStudio({ uri: file.uri, width: file.width, height: file.height })
    } catch (e: any) {
      const msg = e?.message || 'Couldn’t open Studio. Try again.'
      Alert.alert('Couldn’t open Studio', msg)
      announce(msg)
    } finally {
      setStudioPrep(false)
    }
  }, [busy, ai, studioPrep, preview, source.uri])
  const closeStudio = useCallback(() => {
    if (studio) discard(studio.uri) // the render we sent in
    setStudio(null)
  }, [studio])
  const studioDone = useCallback(async (res: StudioResult) => {
    if (res.changed) await ai.applyStudio({ uri: res.uri })
    closeStudio()
  }, [ai, closeStudio])

  // ---- frame on screen ---------------------------------------------------------
  const cropMode = tool === 'crop' && !comparing
  const shown: EditRecipe = comparing ? defaultRecipe() : recipe
  const frame: Frame | null = useMemo(() => {
    if (!area || !shownImg) return null
    const pad = cropMode ? CROP_PAD : PAD
    let w0: number, h0: number
    if (cropMode) ({ w: w0, h: h0 } = orientedSize(spw, sph, shown.rotate))
    else ({ width: w0, height: h0 } = outputSize(shown, spw, sph))
    const sc = Math.min((area.w - pad * 2) / w0, (area.h - pad * 2) / h0)
    const w = w0 * sc, hh = h0 * sc
    return { x: (area.w - w) / 2, y: (area.h - hh) / 2, w, h: hh }
  }, [area, shownImg, cropMode, spw, sph, shown])

  const uniforms = useMemo(() => {
    if (!frame || !shownImg) return null
    const density = PixelRatio.get()
    return uniformsFor({
      recipe: shown, imgW: spw, imgH: sph, outW: frame.w, outH: frame.h, density,
      crop: cropMode ? FULL_CROP : undefined,
      bypass: comparing,
      bg: cropMode ? EDITOR_BG_RGB[t.scheme] : null,
      // Grain the same size relative to the photo as in the export (1/1200 of the long edge).
      grainCell: Math.max(Math.max(frame.w, frame.h) / 1200, 1 / density),
    })
  }, [frame, shownImg, shown, spw, sph, cropMode, comparing, t.scheme])

  // ---- compare (press and hold the photo) ------------------------------------
  // Painting the erase mask / previewing a cut-out: the photo isn't press-to-compare then.
  const aiOverPhoto = tool === 'ai' && ((ai.tool === 'erase' && !!wPreview) || (ai.tool === 'background' && !!ai.background.cut))
  const hold = useMemo(() => Gesture.LongPress()
    .runOnJS(true)
    .enabled(!cropMode && !aiOverPhoto)
    .minDuration(180)
    .maxDistance(10000)
    .onStart(() => setComparing(true))
    .onFinalize(() => setComparing(false)), [cropMode, aiOverPhoto])

  // ---- done / cancel -------------------------------------------------------------
  const changed = !sameRecipe(recipe, initial) || work.base !== 0
  const aiBusy = !!ai.job
  const cancel = useCallback(() => {
    if (studioPrep) return
    if (aiBusy) return ai.cancel() // first stop the running AI tool
    if (!changed || busy) return onCancel()
    const title = mode === 'reedit' ? 'Discard changes?' : 'Discard edits?'
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || window.confirm(title)) onCancel()
      return
    }
    Alert.alert(title, 'Your edits to this photo will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onCancel },
    ])
  }, [changed, busy, aiBusy, studioPrep, ai, mode, onCancel])

  const done = useCallback(async () => {
    if (busy || aiBusy || studioPrep) return
    setBusy(true)
    announce('Saving the photo')
    try {
      const w = hRef.current.committed
      const final = normalize(w.recipe)
      const aiBase = ai.baseOf(w.base)
      // Nothing changed and the size is known: hand back the original (no re-encode).
      if (!aiBase && isIdentity(final) && source.width && source.height) {
        await onDone({
          uri: source.uri, recipe: pixelEdited ? null : final, width: source.width, height: source.height, makeBeforeAfter: beforeAfter, aiEdits: [],
          pixelEdited: !!pixelEdited, pixelBase: pixelEdited ? { uri: source.uri, width: source.width, height: source.height, recipe: final } : null,
        })
        return
      }
      // Let the spinner paint before the (synchronous) GPU work.
      await new Promise((r) => setTimeout(r, 30))
      // After an AI step the working photo is that result (the original file is never changed).
      const full = aiBase ? await decodeImage(aiBase.uri) : await loadFull(source.uri)
      const out = renderToImage(full, final)
      const uri = await saveJpeg(out.image)
      full.dispose?.()
      out.image.dispose?.()
      // A recipe describes edits to the original only: with an AI step in, it's baked in (null).
      // pixelBase: the working photo + the recipe on top, to reopen where the user left off.
      const pixels = aiBase
        ? { uri: aiBase.uri, width: aiBase.width, height: aiBase.height, recipe: final }
        : pixelEdited ? { uri: source.uri, width: full.width(), height: full.height(), recipe: final } : null
      if (aiBase) ai.keepBase(aiBase.id)
      await onDone({
        uri, recipe: pixels ? null : final, width: out.width, height: out.height, makeBeforeAfter: beforeAfter,
        aiEdits: aiBase?.steps ?? [], pixelEdited: !!pixels, pixelBase: pixels,
      })
    } catch (e: any) {
      const msg = e?.message || 'Couldn’t save the edited photo.'
      if (Platform.OS === 'web') console.error(msg)
      else Alert.alert('Couldn’t save', msg)
      announce(msg)
    } finally {
      setBusy(false)
    }
  }, [busy, aiBusy, studioPrep, ai, source, pixelEdited, onDone, beforeAfter])

  const onArea = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    setArea((a) => (a && a.w === width && a.h === height ? a : { w: width, h: height }))
  }, [])

  const edited: Partial<Record<ToolId, boolean>> = {
    presets: !!recipe.filter,
    light: ['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks'].some((k) => recipe.adjust[k as AdjustKey] !== 0),
    color: ['temperature', 'tint', 'vibrance', 'saturation'].some((k) => recipe.adjust[k as AdjustKey] !== 0),
    effects: ['clarity', 'sharpen', 'vignette', 'grain', 'fade'].some((k) => recipe.adjust[k as AdjustKey] !== 0),
    crop: hasCrop(recipe) || recipe.rotate !== 0 || recipe.straighten !== 0 || recipe.flipH,
    ai: !!base || ai.auto.applied,
  }
  const recipeSummary = describe(recipe)
  const summary = base ? [...base.steps, ...(recipeSummary === 'Original' ? [] : [recipeSummary])].join(' · ') : recipeSummary
  const ratio = aspectRatio(recipe.aspect, oriented.w, oriented.h)
  const bg = EDITOR_BG[t.scheme]
  const fx = getEffect()

  // The shader's uv starts at its local origin, so the output is drawn in a translated group.
  const photo = shownImg && shownBlur && frame && uniforms ? (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Group transform={[{ translateX: frame.x }, { translateY: frame.y }]}>
        <Rect x={0} y={0} width={frame.w} height={frame.h}>
          <Shader source={fx} uniforms={uniforms}>
            <ImageShader image={shownImg} fit="none" x={0} y={0} width={spw} height={sph} sampling={SAMPLING} />
            <ImageShader image={shownBlur} fit="fill" x={0} y={0} width={spw} height={sph} sampling={SAMPLING} />
          </Shader>
        </Rect>
      </Group>
    </Canvas>
  ) : null

  return (
    <View style={[s.root, { backgroundColor: bg, paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={s.top}>
        <Pressable onPress={cancel} hitSlop={8} style={s.topBtn} accessibilityRole="button" accessibilityLabel="Cancel editing">
          <X size={24} color={t.c.ink} />
        </Pressable>
        <View style={s.topMid}>
          <IconButton icon={Undo2} label="Undo" onPress={hist.undo} disabled={!hist.canUndo || busy || aiBusy} color={hist.canUndo && !aiBusy ? t.c.ink : t.c.faint} />
          <IconButton icon={Redo2} label="Redo" onPress={hist.redo} disabled={!hist.canRedo || busy || aiBusy} color={hist.canRedo && !aiBusy ? t.c.ink : t.c.faint} />
          <IconButton icon={RotateCcw} label="Reset all edits" onPress={resetAll} disabled={(isIdentity(recipe) && !base) || busy || aiBusy} color={(isIdentity(recipe) && !base) || aiBusy ? t.c.faint : t.c.ink} />
        </View>
        <Pressable
          onPress={done}
          disabled={busy || aiBusy || !preview}
          style={({ pressed }) => [s.done, { backgroundColor: t.c.ink }, (pressed || busy) && { opacity: 0.7 }, aiBusy && { opacity: 0.4 }]}
          accessibilityRole="button"
          accessibilityLabel={mode === 'reedit' ? 'Save edits' : 'Done editing'}
          accessibilityState={{ busy, disabled: busy || aiBusy || !preview }}
        >
          {busy ? <ActivityIndicator size="small" color={t.c.onInk} /> : <Text weight="700" style={{ color: t.c.onInk }}>{mode === 'reedit' ? 'Save' : 'Next'}</Text>}
        </Pressable>
      </View>

      {/* Photo */}
      <GestureDetector gesture={hold}>
        <View
          style={s.area}
          onLayout={onArea}
          accessible={!cropMode && !aiOverPhoto}
          accessibilityRole="image"
          accessibilityLabel={`Photo. ${comparing ? 'Showing the original.' : summary === 'Original' ? 'No edits yet.' : `Edits: ${summary}.`}`}
          accessibilityHint={cropMode ? undefined : 'Touch and hold to compare with the original.'}
          testID="editor-photo"
        >
          {cropMode && frame && preview ? (
            <CropOverlay
              frame={frame}
              crop={recipe.crop}
              frameW={oriented.w}
              frameH={oriented.h}
              straighten={recipe.straighten}
              ratio={ratio}
              onChange={cropLive}
              onCommit={cropCommit}
            >
              {photo}
            </CropOverlay>
          ) : photo}
          {tool === 'ai' && !comparing ? <AiOverlay ai={ai} frame={frame} area={area} bg={bg} /> : null}
          {!preview && !loadError ? <ActivityIndicator style={StyleSheet.absoluteFill} color={t.c.muted} /> : null}
          {loadError ? (
            <View style={[StyleSheet.absoluteFill, s.center]}>
              <Text center muted>{loadError}</Text>
            </View>
          ) : null}
          {comparing ? (
            <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(120)} exiting={reduceMotion ? undefined : FadeOut.duration(120)} style={s.badge} pointerEvents="none">
              <Text variant="tiny" weight="700" style={{ color: '#fff' }}>ORIGINAL</Text>
            </Animated.View>
          ) : null}
        </View>
      </GestureDetector>

      {/* Summary + Before & after */}
      <View style={s.infoRow}>
        <Text variant="tiny" muted numberOfLines={1} style={{ flex: 1 }} accessibilityLiveRegion="polite">
          {summary}
        </Text>
        {screenReader && Platform.OS !== 'web' && tool !== 'crop' ? (
          <Pressable onPress={() => setComparing((v) => !v)} accessibilityRole="switch" accessibilityState={{ checked: comparing }} accessibilityLabel="Show original" style={s.srCompare}>
            <Text variant="tiny" weight="600">{comparing ? 'Showing original' : 'Show original'}</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={openStudio}
          disabled={busy || aiBusy || studioPrep || !preview}
          hitSlop={6}
          style={({ pressed }) => [s.studio, { borderColor: t.c.line }, (busy || aiBusy || studioPrep || !preview) && { opacity: 0.4 }, pressed && { opacity: 0.6 }, Platform.OS !== 'web' && !!studioUnavailableReason() && { opacity: 0.4 }]}
          accessibilityRole="button"
          accessibilityLabel="Advanced editing in Studio"
          accessibilityHint={studioUnavailableReason() ?? 'Opens this photo with your edits in Studio: layers, brushes, clone, text and shapes'}
          accessibilityState={{ disabled: busy || aiBusy || studioPrep || !preview, busy: studioPrep }}
        >
          {studioPrep ? <ActivityIndicator size="small" color={t.c.ink} /> : <Layers size={14} color={t.c.ink} />}
          <Text variant="tiny" weight="600" style={{ color: t.c.ink }}>Studio</Text>
        </Pressable>
        {allowBeforeAfter ? (
          <View style={s.ba}>
            <Text variant="tiny" weight="600" style={{ color: t.c.ink }} importantForAccessibility="no" accessibilityElementsHidden>Before & after</Text>
            <Switch
              value={beforeAfter}
              onValueChange={setBeforeAfter}
              accessibilityLabel="Post as before and after"
              accessibilityHint="Posts the original and the edited photo side by side"
              trackColor={{ true: t.c.accent, false: t.c.faint }}
              thumbColor={Platform.OS === 'android' ? t.c.bg : undefined}
              style={Platform.OS === 'ios' ? { transform: [{ scale: 0.8 }] } : undefined}
            />
          </View>
        ) : null}
      </View>

      {/* Tool panel */}
      <View style={[s.panel, { backgroundColor: t.c.bg }]}>
        {tool === 'presets' ? (
          <PresetPanel thumb={wThumb} blur={wBlur} recipe={recipe} onPick={pickPreset} onStrengthLive={strengthLive} onStrengthCommit={strengthCommit} />
        ) : tool === 'crop' ? (
          <CropPanel
            recipe={recipe}
            onAspect={setAspect}
            onSwap={swapAspect}
            onStraightenLive={straightenLive}
            onStraightenCommit={straightenCommit}
            onRotate={rotate}
            onFlip={flip}
            onReset={resetCrop}
            canReset={!!edited.crop || recipe.aspect !== 'original'}
          />
        ) : tool === 'ai' ? (
          <AiPanel ai={ai} />
        ) : (
          <AdjustPanel group={tool} adjust={recipe.adjust} onLive={setAdjustLive} onCommit={setAdjustCommit} />
        )}
      </View>
      <View style={{ backgroundColor: t.c.bg, paddingBottom: insets.bottom }}>
        <ToolTabs value={tool} onChange={setTool} edited={edited} />
      </View>
      {studio ? (
        <StudioSheet
          visible
          source={studio}
          name="Photo"
          doneLabel="Apply"
          note="Your edit so far opens here. Apply brings it back to the editor."
          onDone={studioDone}
          onCancel={closeStudio}
        />
      ) : null}
    </View>
  )
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: t.space.md, height: 52 },
  topBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  topMid: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  done: { minWidth: 72, height: 36, paddingHorizontal: t.space.lg, borderRadius: t.radius.pill, alignItems: 'center', justifyContent: 'center' },
  area: { flex: 1, overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center', padding: t.space.xl },
  badge: { position: 'absolute', top: 12, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: t.radius.pill },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm, paddingHorizontal: t.space.lg, minHeight: 40, backgroundColor: t.c.bg, borderTopWidth: 1, borderTopColor: t.c.line },
  ba: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  studio: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 28, paddingHorizontal: 10, borderRadius: t.radius.pill, borderWidth: 1 },
  srCompare: { paddingHorizontal: 8, paddingVertical: 6 },
  panel: { height: PANEL_H },
}))
