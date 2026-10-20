// What the AI tab draws over the photo area:
//   - Background: the cut-out over a checkerboard (transparent), a colour or the blurred photo,
//     until the user picks Use or Discard.
//   - Erase: the mask layer (brush strokes / tap areas) over the photo as shown.
import { Blur, Canvas, Group, Image, ImageShader, Rect } from '@shopify/react-native-skia'
import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'

import { Text } from '@/components'
import type { Frame } from '../pipeline'
import { BLUR_FRACTION, backdropLabel, checkerTile } from './composite'
import { MaskLayer } from './MaskLayer'
import type { AiEditor } from './useAiEditor'

const PAD = 16

export function AiOverlay({ ai, frame, area, bg }: { ai: AiEditor; frame: Frame | null; area: { w: number; h: number } | null; bg: string }) {
  const cut = ai.background.cut
  const cutFrame = useMemo(() => {
    if (!cut || !area) return null
    const w0 = cut.cutout.width(), h0 = cut.cutout.height()
    const sc = Math.min((area.w - PAD * 2) / w0, (area.h - PAD * 2) / h0)
    const w = w0 * sc, h = h0 * sc
    return { x: (area.w - w) / 2, y: (area.h - h) / 2, w, h }
  }, [cut, area])

  if (ai.tool === 'background' && cut && cutFrame) {
    const b = ai.background.backdrop
    const f = cutFrame
    const checker = checkerTile()
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: bg }]} accessible accessibilityRole="image"
        accessibilityLabel={`Background removed. Showing it on ${backdropLabel(b).toLowerCase()}.`} testID="ai-cutout">
        <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
          <Group transform={[{ translateX: f.x }, { translateY: f.y }]} clip={{ x: 0, y: 0, width: f.w, height: f.h }}>
            {b.kind === 'transparent' ? (
              <Rect x={0} y={0} width={f.w} height={f.h}>
                <ImageShader image={checker} tx="repeat" ty="repeat" fit="none" x={0} y={0} width={16} height={16} />
              </Rect>
            ) : b.kind === 'color' ? (
              <Rect x={0} y={0} width={f.w} height={f.h} color={b.color} />
            ) : (
              <Image image={cut.photo} x={0} y={0} width={f.w} height={f.h} fit="fill">
                <Blur blur={Math.max(2, Math.max(f.w, f.h) * BLUR_FRACTION)} mode="clamp" />
              </Image>
            )}
            <Image image={cut.cutout} x={0} y={0} width={f.w} height={f.h} fit="fill" />
          </Group>
        </Canvas>
        <View style={s.badge} pointerEvents="none">
          <Text variant="tiny" weight="700" style={{ color: '#fff' }}>PREVIEW</Text>
        </View>
      </View>
    )
  }

  if (ai.tool === 'erase' && frame) {
    const e = ai.erase
    // While erasing, the mask stays visible but can't be changed.
    return <MaskLayer frame={frame} strokes={e.strokes} mode={e.mode} brushSize={e.size} onStroke={e.addStroke} onToggleArea={e.toggleArea} disabled={!!ai.job} />
  }
  return null
}

const s = StyleSheet.create({
  badge: { position: 'absolute', top: 12, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
})
