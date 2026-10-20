// The AI tab's panel: Auto · Background · Erase · Upscale, each with its options; a progress
// view with Cancel while a request runs; errors with a way forward. Tools the server can't run
// are greyed out and say why (capabilities). Everything is a labelled button / radio for
// VoiceOver / TalkBack; motion follows Reduce Motion.
import { Eraser, ImageUpscale, RefreshCw, Scissors, Share2, Sparkles, Undo2, WandSparkles, X, type LucideIcon } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated'

import { Button, Chip, Segmented, Text } from '@/components'
import { useReduceMotion, useScreenReader } from '@/lib/a11y'
import { makeStyles, useTheme } from '@/theme'
import { EditSlider } from '../EditSlider'
import { BACKDROP_COLORS, backdropLabel, type Backdrop } from './composite'
import type { AiEditor, AiTool } from './useAiEditor'

const TOOLS: { id: AiTool; label: string; icon: LucideIcon; hint: string }[] = [
  { id: 'auto', label: 'Auto', icon: WandSparkles, hint: 'Balances light and colour' },
  { id: 'background', label: 'Background', icon: Scissors, hint: 'Removes or replaces the background' },
  { id: 'erase', label: 'Erase', icon: Eraser, hint: 'Removes things you paint over' },
  { id: 'upscale', label: 'Upscale', icon: ImageUpscale, hint: 'Makes a small photo bigger' },
]

export function AiPanel({ ai }: { ai: AiEditor }) {
  const s = useStyles()
  const reason = (t: AiTool) => (t === 'auto' ? null : ai.reasonFor(t))
  const busy = !!ai.job
  return (
    <View style={{ flex: 1 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={s.tools} accessibilityRole="radiogroup" accessibilityLabel="AI tools">
        {TOOLS.map((t) => {
          const why = reason(t.id)
          const off = !!why && !!ai.caps // still checking: not greyed yet
          return (
            <Chip
              key={t.id}
              label={t.label}
              icon={t.icon}
              toggle
              select
              on={ai.tool === t.id}
              onPress={busy ? undefined : () => ai.setTool(t.id)}
              accessibilityLabel={`${t.label}${off ? ', not available' : ''}`}
              accessibilityHint={off ? why! : t.hint}
              style={off ? { opacity: 0.45 } : undefined}
            />
          )
        })}
        {ai.base && !busy ? (
          <Chip label="Remove AI edits" icon={Undo2} onPress={ai.removeAll} asButton accessibilityHint={`Goes back to the original photo (${ai.base.steps.join(', ')}); your sliders stay`} />
        ) : null}
      </ScrollView>
      <View style={s.body}>
        {ai.job ? <Progress ai={ai} /> : <ToolBody ai={ai} reason={reason(ai.tool)} />}
      </View>
    </View>
  )
}

function ToolBody({ ai, reason }: { ai: AiEditor; reason: string | null }) {
  const s = useStyles()
  const err = ai.error && ai.error.tool === ai.tool ? ai.error : null
  if (ai.tool !== 'auto' && reason) return <Unavailable ai={ai} reason={reason} />
  return (
    <View style={{ flex: 1 }}>
      {err ? (
        <View style={s.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          <Text variant="small" style={{ flex: 1 }} color="danger">{err.message}</Text>
          <Pressable onPress={ai.clearError} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss the error">
            <X size={16} color="#888" />
          </Pressable>
        </View>
      ) : null}
      {ai.tool === 'auto' ? <AutoBody ai={ai} />
        : ai.tool === 'background' ? <BackgroundBody ai={ai} />
          : ai.tool === 'erase' ? <EraseBody ai={ai} />
            : <UpscaleBody ai={ai} />}
    </View>
  )
}

function Unavailable({ ai, reason }: { ai: AiEditor; reason: string }) {
  const s = useStyles()
  const checking = !ai.caps
  return (
    <View style={s.center} accessibilityLiveRegion="polite">
      <Text variant="small" muted center>{reason}</Text>
      {!checking ? (
        <Button title="Try again" size="sm" variant="ghost" icon={RefreshCw} onPress={() => ai.loadCaps(true)} style={{ marginTop: 10, alignSelf: 'center' }} accessibilityHint="Checks the AI tools again" />
      ) : null}
      {!checking && ai.tool !== 'auto' ? (
        <Text variant="tiny" muted center style={{ marginTop: 6 }}>Auto-enhance works without them.</Text>
      ) : null}
    </View>
  )
}

function AutoBody({ ai }: { ai: AiEditor }) {
  const s = useStyles()
  return (
    <View style={s.center}>
      <Text variant="small" muted center style={{ marginBottom: 12 }}>
        {ai.auto.applied && ai.auto.text ? `Applied: ${ai.auto.text}. Fine-tune in Light and Color.` : 'Balances exposure, contrast and white balance for this photo. Runs on your phone.'}
      </Text>
      <Button
        title={ai.auto.applied ? 'Auto applied' : 'Auto-enhance'}
        icon={Sparkles}
        onPress={ai.auto.run}
        disabled={ai.auto.applied}
        style={{ alignSelf: 'center' }}
        accessibilityHint="Sets the Light and Color sliders. Undo takes it back."
      />
    </View>
  )
}

function BackgroundBody({ ai }: { ai: AiEditor }) {
  const s = useStyles()
  const bg = ai.background
  if (!bg.cut) {
    return (
      <View style={s.center}>
        <Text variant="small" muted center style={{ marginBottom: 12 }}>Cuts out the subject. Then keep it transparent, or put it on a colour or a blurred copy of the photo.</Text>
        <Button title="Remove background" icon={Scissors} onPress={bg.run} style={{ alignSelf: 'center' }} />
      </View>
    )
  }
  const opts: { b: Backdrop; key: string }[] = [
    { b: { kind: 'transparent' }, key: 'transparent' },
    ...BACKDROP_COLORS.map((c) => ({ b: { kind: 'color', color: c.color } as Backdrop, key: c.color })),
    { b: { kind: 'blur' }, key: 'blur' },
  ]
  const same = (a: Backdrop, b: Backdrop) => a.kind === b.kind && (a.kind !== 'color' || (b.kind === 'color' && a.color === b.color))
  return (
    <View style={{ flex: 1, justifyContent: 'center', gap: 12 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={s.row} accessibilityRole="radiogroup" accessibilityLabel="Background">
        {opts.map(({ b, key }) => (
          <Chip key={key} label={backdropLabel(b)} toggle select on={same(bg.backdrop, b)} onPress={() => bg.setBackdrop(b)} accessibilityLabel={`${backdropLabel(b)} background`} />
        ))}
      </ScrollView>
      {bg.backdrop.kind === 'transparent' ? (
        <Text variant="tiny" muted center style={{ paddingHorizontal: 16 }}>Posts are JPEG photos, so Use puts it on white. Save the PNG to keep it transparent.</Text>
      ) : null}
      <View style={s.actions}>
        <Button title="Discard" variant="ghost" size="sm" onPress={bg.discard} accessibilityHint="Keeps the photo as it was" />
        {bg.share && bg.backdrop.kind === 'transparent' ? <Button title="Save PNG" variant="outline" size="sm" icon={Share2} onPress={bg.share} accessibilityHint="Opens the share sheet with the transparent PNG" /> : null}
        <Button title="Use" size="sm" onPress={bg.use} accessibilityHint="Makes this the photo you’re editing. Undo takes it back." />
      </View>
    </View>
  )
}

function EraseBody({ ai }: { ai: AiEditor }) {
  const s = useStyles()
  const sr = useScreenReader()
  const e = ai.erase
  const has = e.strokes.length > 0
  return (
    <View style={{ flex: 1, justifyContent: 'center', gap: 8 }}>
      <View style={{ paddingHorizontal: 16 }}>
        <Segmented
          label="How to mark what to erase"
          value={e.mode}
          onChange={e.setMode}
          options={[{ value: 'brush', label: 'Brush' }, { value: 'area', label: 'Tap areas' }]}
        />
      </View>
      {e.mode === 'brush' ? (
        <EditSlider label="Brush size" min={12} max={96} step={2} defaultValue={36} value={e.size} onChange={e.setSize} onCommit={e.setSize} format={(v) => `${Math.round(v)} pt`} />
      ) : null}
      <Text variant="tiny" muted center style={{ paddingHorizontal: 16 }} accessibilityLiveRegion="polite">
        {e.mode === 'brush'
          ? (has ? `${e.strokes.length} stroke${e.strokes.length > 1 ? 's' : ''}. Paint loosely over the whole object.` : sr ? 'Painting needs a finger drag. With VoiceOver, use Tap areas instead.' : 'Paint over what you want gone.')
          : (has ? `${e.strokes.length} area${e.strokes.length > 1 ? 's' : ''} marked.` : 'Tap the parts of the photo to erase (a 3 by 3 grid).')}
        {e.covered > 0.35 ? ' Large areas come out soft.' : ''}
      </Text>
      <View style={s.actions}>
        <Button title="Undo stroke" variant="ghost" size="sm" icon={Undo2} onPress={e.undo} disabled={!has} accessibilityLabel={e.mode === 'brush' ? 'Undo last stroke' : 'Undo last area'} />
        <Button title="Clear" variant="ghost" size="sm" onPress={e.clear} disabled={!has} accessibilityLabel="Clear the mask" />
        <Button title="Erase" size="sm" icon={Eraser} onPress={e.run} disabled={!has} accessibilityHint="Removes what’s marked and fills it in" />
      </View>
    </View>
  )
}

function UpscaleBody({ ai }: { ai: AiEditor }) {
  const s = useStyles()
  const u = ai.upscale
  return (
    <View style={{ flex: 1, justifyContent: 'center', gap: 12 }}>
      {u.tooBig ? (
        <Text variant="small" muted center style={{ paddingHorizontal: 16 }}>{u.tooBig}</Text>
      ) : (
        <>
          <View style={[s.row, { justifyContent: 'center' }]} accessibilityRole="radiogroup" accessibilityLabel="Upscale factor">
            {u.scales.map((n) => (
              <Chip key={n} label={`${n}×`} toggle select on={u.scale === n} onPress={() => u.setScale(n)} accessibilityLabel={`${n} times`} />
            ))}
          </View>
          <Text variant="tiny" muted center>
            {u.edge ? `${u.edge} px → ${u.edge * u.scale} px on the long side` : 'Makes a small photo bigger and sharper.'}
          </Text>
          <View style={s.actions}>
            <Button title={`Upscale ${u.scale}×`} size="sm" icon={ImageUpscale} onPress={u.run} accessibilityLabel={`Upscale ${u.scale} times`} />
          </View>
        </>
      )}
    </View>
  )
}

function Progress({ ai }: { ai: AiEditor }) {
  const s = useStyles()
  const { c } = useTheme()
  const reduce = useReduceMotion()
  const job = ai.job!
  const [now, setNow] = useState(job.started)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const secs = Math.max(0, Math.round((now - job.started) / 1000))
  const x = useSharedValue(0)
  useEffect(() => {
    if (reduce) return
    x.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }), -1, false)
    return () => cancelAnimation(x)
  }, [reduce, x])
  const bar = useAnimatedStyle(() => ({ transform: [{ translateX: -120 + x.value * 360 }] }))
  return (
    <View style={s.center} accessible accessibilityRole="progressbar" accessibilityLabel={`${job.stage} ${secs} seconds`} accessibilityLiveRegion="polite">
      <Text variant="small" weight="600" center>{job.stage}</Text>
      <View style={[s.track, { backgroundColor: c.line }]}>
        {reduce ? <View style={[s.fillStatic, { backgroundColor: c.ink }]} /> : <Animated.View style={[s.fill, { backgroundColor: c.ink }, bar]} />}
      </View>
      <Text variant="tiny" muted center>{secs < 3 ? 'This can take a few seconds.' : `${secs} s`}</Text>
      <Button title="Cancel" variant="ghost" size="sm" onPress={ai.cancel} style={{ marginTop: 8, alignSelf: 'center' }} accessibilityHint="Stops the AI tool; your photo stays as it was" />
    </View>
  )
}

const useStyles = makeStyles((t) => ({
  tools: { gap: t.space.sm, paddingHorizontal: t.space.lg, paddingTop: 10, paddingBottom: 4, alignItems: 'center' },
  body: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: t.space.xl },
  row: { flexDirection: 'row', gap: t.space.sm, paddingHorizontal: t.space.lg, alignItems: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: t.space.sm, paddingHorizontal: t.space.lg },
  error: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: t.space.lg, marginTop: 6, padding: 8, borderRadius: t.radius.md, backgroundColor: t.c.soft },
  track: { width: 240, height: 4, borderRadius: 2, overflow: 'hidden', marginVertical: 10 },
  fill: { width: 120, height: 4, borderRadius: 2 },
  fillStatic: { width: 240, height: 4, opacity: 0.5 },
}))
