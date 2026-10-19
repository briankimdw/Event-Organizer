// The editor itself (loaded lazily by PhotoEditor.tsx once Skia is ready).
// Layout: top bar (Cancel · undo / redo / reset · Done), the photo, a one-line summary +
// "Before & after" switch, the active tool's panel, the tool tabs.
import { Canvas, FilterMode, Group, ImageShader, MipmapMode, Rect, Shader, type SkImage } from '@shopify/react-native-skia'
import { Redo2, RotateCcw, Undo2, X } from 'lucide-react-native'
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
import { getEffect, makeBlur, uniformsFor, type Frame } from './pipeline'
import { EDITOR_BG, EDITOR_BG_RGB } from './chrome'
import { ToolTabs, type ToolId } from './ToolTabs'
import type { PhotoEditorProps } from './types'
import { useHistory } from './useHistory'

const PANEL_H = 236
const SAMPLING = { filter: FilterMode.Linear, mipmap: MipmapMode.None }
const PAD = 16
const CROP_PAD = 28 // room for the crop handles

export default function EditorScreen({ source, initialRecipe, mode = 'post', allowBeforeAfter, initialBeforeAfter, onDone, onCancel }: PhotoEditorProps) {
  const s = useStyles()
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const reduceMotion = useReduceMotion()
  const screenReader = useScreenReader()

  const initial = useMemo(() => normalize(initialRecipe ?? null), []) // eslint-disable-line react-hooks/exhaustive-deps
  const hist = useHistory<EditRecipe>(initial)
  // Callbacks read the history through a ref so they keep their identity (no slider re-renders
  // or gesture re-creation on every change).
  const hRef = useRef(hist)
  useLayoutEffect(() => {
    hRef.current = hist
  })
  const h = useMemo(() => ({
    get committed() { return hRef.current.committed },
    preview: (r: EditRecipe) => hRef.current.preview(r),
    commit: (r: EditRecipe) => hRef.current.commit(r),
  }), [])
  const recipe = hist.value
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

  const pw = preview?.width() ?? source.width ?? 1
  const ph = preview?.height() ?? source.height ?? 1
  const oriented = orientedSize(pw, ph, recipe.rotate)

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
    h.commit(defaultRecipe())
    announce('All edits reset')
  }, [h])

  // ---- frame on screen ---------------------------------------------------------
  const cropMode = tool === 'crop' && !comparing
  const shown: EditRecipe = comparing ? defaultRecipe() : recipe
  const frame: Frame | null = useMemo(() => {
    if (!area || !preview) return null
    const pad = cropMode ? CROP_PAD : PAD
    let w0: number, h0: number
    if (cropMode) ({ w: w0, h: h0 } = orientedSize(pw, ph, shown.rotate))
    else ({ width: w0, height: h0 } = outputSize(shown, pw, ph))
    const sc = Math.min((area.w - pad * 2) / w0, (area.h - pad * 2) / h0)
    const w = w0 * sc, hh = h0 * sc
    return { x: (area.w - w) / 2, y: (area.h - hh) / 2, w, h: hh }
  }, [area, preview, cropMode, pw, ph, shown])

  const uniforms = useMemo(() => {
    if (!frame || !preview) return null
    const density = PixelRatio.get()
    return uniformsFor({
      recipe: shown, imgW: pw, imgH: ph, outW: frame.w, outH: frame.h, density,
      crop: cropMode ? FULL_CROP : undefined,
      bypass: comparing,
      bg: cropMode ? EDITOR_BG_RGB[t.scheme] : null,
      // Grain the same size relative to the photo as in the export (1/1200 of the long edge).
      grainCell: Math.max(Math.max(frame.w, frame.h) / 1200, 1 / density),
    })
  }, [frame, preview, shown, pw, ph, cropMode, comparing, t.scheme])

  // ---- compare (press and hold the photo) ------------------------------------
  const hold = useMemo(() => Gesture.LongPress()
    .runOnJS(true)
    .enabled(!cropMode)
    .minDuration(180)
    .maxDistance(10000)
    .onStart(() => setComparing(true))
    .onFinalize(() => setComparing(false)), [cropMode])

  // ---- done / cancel -------------------------------------------------------------
  const changed = !sameRecipe(recipe, initial)
  const cancel = useCallback(() => {
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
  }, [changed, busy, mode, onCancel])

  const done = useCallback(async () => {
    if (busy) return
    setBusy(true)
    announce('Saving the photo')
    try {
      const final = normalize(hRef.current.committed)
      // Nothing changed and the size is known: hand back the original (no re-encode).
      if (isIdentity(final) && source.width && source.height) {
        await onDone({ uri: source.uri, recipe: final, width: source.width, height: source.height, makeBeforeAfter: beforeAfter })
        return
      }
      // Let the spinner paint before the (synchronous) GPU work.
      await new Promise((r) => setTimeout(r, 30))
      const full = await loadFull(source.uri)
      const out = renderToImage(full, final)
      const uri = await saveJpeg(out.image)
      full.dispose?.()
      out.image.dispose?.()
      await onDone({ uri, recipe: final, width: out.width, height: out.height, makeBeforeAfter: beforeAfter })
    } catch (e: any) {
      const msg = e?.message || 'Couldn’t save the edited photo.'
      if (Platform.OS === 'web') console.error(msg)
      else Alert.alert('Couldn’t save', msg)
      announce(msg)
    } finally {
      setBusy(false)
    }
  }, [busy, source, onDone, beforeAfter])

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
  }
  const summary = describe(recipe)
  const ratio = aspectRatio(recipe.aspect, oriented.w, oriented.h)
  const bg = EDITOR_BG[t.scheme]
  const fx = getEffect()

  // The shader's uv starts at its local origin, so the output is drawn in a translated group.
  const photo = preview && blur && frame && uniforms ? (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Group transform={[{ translateX: frame.x }, { translateY: frame.y }]}>
        <Rect x={0} y={0} width={frame.w} height={frame.h}>
          <Shader source={fx} uniforms={uniforms}>
            <ImageShader image={preview} fit="none" x={0} y={0} width={pw} height={ph} sampling={SAMPLING} />
            <ImageShader image={blur} fit="fill" x={0} y={0} width={pw} height={ph} sampling={SAMPLING} />
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
          <IconButton icon={Undo2} label="Undo" onPress={hist.undo} disabled={!hist.canUndo || busy} color={hist.canUndo ? t.c.ink : t.c.faint} />
          <IconButton icon={Redo2} label="Redo" onPress={hist.redo} disabled={!hist.canRedo || busy} color={hist.canRedo ? t.c.ink : t.c.faint} />
          <IconButton icon={RotateCcw} label="Reset all edits" onPress={resetAll} disabled={isIdentity(recipe) || busy} color={isIdentity(recipe) ? t.c.faint : t.c.ink} />
        </View>
        <Pressable
          onPress={done}
          disabled={busy || !preview}
          style={({ pressed }) => [s.done, { backgroundColor: t.c.ink }, (pressed || busy) && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={mode === 'reedit' ? 'Save edits' : 'Done editing'}
          accessibilityState={{ busy, disabled: busy || !preview }}
        >
          {busy ? <ActivityIndicator size="small" color={t.c.onInk} /> : <Text weight="700" style={{ color: t.c.onInk }}>{mode === 'reedit' ? 'Save' : 'Next'}</Text>}
        </Pressable>
      </View>

      {/* Photo */}
      <GestureDetector gesture={hold}>
        <View
          style={s.area}
          onLayout={onArea}
          accessible={!cropMode}
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
          <PresetPanel thumb={thumb} blur={blur} recipe={recipe} onPick={pickPreset} onStrengthLive={strengthLive} onStrengthCommit={strengthCommit} />
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
        ) : (
          <AdjustPanel group={tool} adjust={recipe.adjust} onLive={setAdjustLive} onCommit={setAdjustCommit} />
        )}
      </View>
      <View style={{ backgroundColor: t.c.bg, paddingBottom: insets.bottom }}>
        <ToolTabs value={tool} onChange={setTool} edited={edited} />
      </View>
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
  srCompare: { paddingHorizontal: 8, paddingVertical: 6 },
  panel: { height: PANEL_H },
}))
