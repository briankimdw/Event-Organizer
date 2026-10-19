// The tool panels above the tabs: sliders (Light / Color / Effects), Presets, Crop.
import { Canvas, FilterMode, Group, ImageShader, MipmapMode, RoundedRect, Shader, type SkImage } from '@shopify/react-native-skia'
import { ArrowLeftRight, FlipHorizontal2, RotateCw, Undo2 } from 'lucide-react-native'
import { memo, useCallback, useMemo } from 'react'
import { PixelRatio, Pressable, ScrollView, View } from 'react-native'

import { Chip, Text } from '@/components'
import { makeStyles, useTheme } from '@/theme'
import {
  ADJUSTMENTS, ASPECTS, PRESETS, defaultRecipe, formatAdjust,
  type AdjustKey, type AspectId, type EditRecipe,
} from './contract'
import { EditSlider } from './EditSlider'
import { getEffect, uniformsFor } from './pipeline'

// ---------------------------------------------------------------------------
// Sliders
// ---------------------------------------------------------------------------
const GRADIENTS: Partial<Record<AdjustKey, [string, string]>> = {
  temperature: ['#4a90d9', '#e8b23a'],
  tint: ['#3fae5a', '#c04fc0'],
}

export const AdjustPanel = memo(function AdjustPanel({
  group, adjust, onLive, onCommit,
}: {
  group: 'light' | 'color' | 'effects'
  adjust: EditRecipe['adjust']
  onLive: (key: AdjustKey, v: number) => void
  onCommit: (key: AdjustKey, v: number) => void
}) {
  const items = ADJUSTMENTS.filter((a) => a.group === group)
  return (
    <ScrollView contentContainerStyle={{ paddingVertical: 6 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {items.map((a) => (
        <AdjustRow key={a.key} k={a.key} label={a.label} min={a.min} max={a.max} value={adjust[a.key]} onLive={onLive} onCommit={onCommit} />
      ))}
    </ScrollView>
  )
})

const AdjustRow = memo(function AdjustRow({ k, label, min, max, value, onLive, onCommit }: {
  k: AdjustKey; label: string; min: number; max: number; value: number
  onLive: (key: AdjustKey, v: number) => void; onCommit: (key: AdjustKey, v: number) => void
}) {
  const live = useCallback((v: number) => onLive(k, v), [k, onLive])
  const commit = useCallback((v: number) => onCommit(k, v), [k, onCommit])
  const format = useCallback((v: number) => formatAdjust(k, v), [k])
  return <EditSlider label={label} min={min} max={max} value={value} defaultValue={0} onChange={live} onCommit={commit} format={format} gradient={GRADIENTS[k]} />
})

// ---------------------------------------------------------------------------
// Presets: one Skia canvas draws every thumbnail (one GPU surface, not twelve).
// ---------------------------------------------------------------------------
const TILE = 72
const SAMPLING = { filter: FilterMode.Linear, mipmap: MipmapMode.None }
const GAP = 10

export const PresetPanel = memo(function PresetPanel({
  thumb, blur, recipe, onPick, onStrengthLive, onStrengthCommit,
}: {
  thumb: SkImage | null
  blur: SkImage | null
  recipe: EditRecipe
  onPick: (id: string | null) => void
  onStrengthLive: (v: number) => void
  onStrengthCommit: (v: number) => void
}) {
  const s = useStyles()
  const { c } = useTheme()
  const tiles = useMemo(() => [{ id: null as string | null, name: 'None' }, ...PRESETS.map((p) => ({ id: p.id as string | null, name: p.name }))], [])
  const active = recipe.filter?.id ?? null
  const width = tiles.length * (TILE + GAP) + GAP

  // Square centre crop of the thumbnail, the user's sliders + each look at 100%.
  const uniforms = useMemo(() => {
    if (!thumb) return []
    const tw = thumb.width(), th = thumb.height()
    const sq = tw >= th ? { x: (1 - th / tw) / 2, y: 0, w: th / tw, h: 1 } : { x: 0, y: (1 - tw / th) / 2, w: 1, h: tw / th }
    const base = defaultRecipe()
    return tiles.map((tile, i) => uniformsFor({
      recipe: { ...base, adjust: recipe.adjust, filter: tile.id ? { id: tile.id, strength: 100 } : null },
      imgW: tw, imgH: th, crop: sq, outW: TILE, outH: TILE, density: PixelRatio.get(),
      grainCell: Math.max(TILE / 1200, 1 / PixelRatio.get()),
    }))
  }, [thumb, tiles, recipe.adjust])

  const fx = getEffect()
  return (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ width }}>
        <View style={{ width, height: TILE + 28 }}>
          {thumb && blur ? (
            <Canvas style={{ position: 'absolute', left: 0, top: 0, width, height: TILE }} pointerEvents="none">
              {tiles.map((tile, i) => (
                <Group key={tile.id ?? 'none'} transform={[{ translateX: GAP + i * (TILE + GAP) }]}>
                  <RoundedRect x={0} y={0} width={TILE} height={TILE} r={8}>
                    <Shader source={fx} uniforms={uniforms[i]}>
                      <ImageShader image={thumb} fit="none" x={0} y={0} width={thumb.width()} height={thumb.height()} sampling={SAMPLING} />
                      <ImageShader image={blur} fit="fill" x={0} y={0} width={thumb.width()} height={thumb.height()} sampling={SAMPLING} />
                    </Shader>
                  </RoundedRect>
                </Group>
              ))}
            </Canvas>
          ) : null}
          <View style={{ flexDirection: 'row', paddingLeft: GAP }} accessibilityRole="radiogroup" accessibilityLabel="Presets">
            {tiles.map((tile) => {
              const on = tile.id === active
              return (
                <Pressable
                  key={tile.id ?? 'none'}
                  onPress={() => onPick(tile.id)}
                  style={{ width: TILE, marginRight: GAP }}
                  accessibilityRole="radio"
                  accessibilityLabel={tile.id ? `${tile.name} preset` : 'No preset'}
                  accessibilityState={{ checked: on, selected: on }}
                >
                  <View style={[s.tile, on && { borderColor: c.ink, borderWidth: 2 }]} />
                  <Text variant="tiny" weight={on ? '700' : '500'} center numberOfLines={1} style={{ marginTop: 6, color: on ? c.ink : c.muted }} maxFontSizeMultiplier={1.3}>
                    {tile.name}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>
      </ScrollView>
      {recipe.filter ? (
        <EditSlider
          label={`${PRESETS.find((p) => p.id === recipe.filter?.id)?.name ?? 'Preset'} strength`}
          min={0} max={100} defaultValue={100} value={recipe.filter.strength}
          onChange={onStrengthLive} onCommit={onStrengthCommit}
          format={(v) => `${Math.round(v)}`}
        />
      ) : (
        <Text variant="small" muted center style={{ marginTop: 10 }}>Pick a look, then fine-tune it with the sliders.</Text>
      )}
    </View>
  )
})

// ---------------------------------------------------------------------------
// Crop: aspect, straighten, rotate, flip, reset
// ---------------------------------------------------------------------------
export const CropPanel = memo(function CropPanel({
  recipe, onAspect, onSwap, onStraightenLive, onStraightenCommit, onRotate, onFlip, onReset, canReset,
}: {
  recipe: EditRecipe
  onAspect: (a: AspectId) => void
  onSwap: () => void
  onStraightenLive: (v: number) => void
  onStraightenCommit: (v: number) => void
  onRotate: () => void
  onFlip: () => void
  onReset: () => void
  canReset: boolean
}) {
  const s = useStyles()
  const { c } = useTheme()
  const visible = ASPECTS.filter((a) => !a.hidden)
  // A swapped aspect (5:4, 2:3, 9:16) highlights its visible twin.
  const current = ASPECTS.find((a) => a.id === recipe.aspect)
  const activeId = current?.hidden ? ASPECTS.find((a) => a.swap === current.id && !a.hidden)?.id : recipe.aspect
  const canSwap = !!current?.swap && current.id !== '1:1'
  return (
    <View style={{ flex: 1, justifyContent: 'center', gap: 10 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={s.aspects} accessibilityRole="radiogroup" accessibilityLabel="Aspect ratio">
        {visible.map((a) => (
          <Chip key={a.id} label={a.id === activeId && current?.hidden ? current.label : a.label} toggle select on={a.id === activeId} onPress={() => onAspect(a.id)} accessibilityLabel={`Aspect ${a.label}`} />
        ))}
        <Chip label="Turn" icon={ArrowLeftRight} onPress={canSwap ? onSwap : undefined} asButton accessibilityLabel="Swap portrait and landscape" style={!canSwap ? { opacity: 0.4 } : undefined} />
      </ScrollView>
      <EditSlider
        label="Straighten" min={-45} max={45} step={0.1} defaultValue={0} value={recipe.straighten}
        onChange={onStraightenLive} onCommit={onStraightenCommit}
        format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}°`}
      />
      <View style={s.cropButtons}>
        <ToolButton icon={RotateCw} label="Rotate" onPress={onRotate} color={c.ink} />
        <ToolButton icon={FlipHorizontal2} label="Flip" onPress={onFlip} color={c.ink} />
        <ToolButton icon={Undo2} label="Reset crop" onPress={onReset} color={c.ink} disabled={!canReset} />
      </View>
    </View>
  )
})

function ToolButton({ icon: Icon, label, onPress, color, disabled }: { icon: typeof RotateCw; label: string; onPress: () => void; color: string; disabled?: boolean }) {
  const s = useStyles()
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [s.toolBtn, (pressed || disabled) && { opacity: disabled ? 0.35 : 0.6 }]} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }}>
      <Icon size={20} color={color} />
      <Text variant="tiny" weight="600" style={{ color, marginTop: 4 }} maxFontSizeMultiplier={1.3}>{label}</Text>
    </Pressable>
  )
}

const useStyles = makeStyles((t) => ({
  tile: { width: TILE, height: TILE, borderRadius: 8, borderWidth: 1, borderColor: 'transparent' },
  aspects: { gap: t.space.sm, paddingHorizontal: t.space.lg, alignItems: 'center' },
  cropButtons: { flexDirection: 'row', justifyContent: 'center', gap: t.space.xxl },
  toolBtn: { alignItems: 'center', justifyContent: 'center', minWidth: 64, minHeight: 48 },
}))
