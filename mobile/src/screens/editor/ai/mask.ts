// The Erase mask: what the user painted, kept resolution-free (0..1 of the photo as shown, i.e. the
// current edit's output frame), so the same strokes draw on screen and into the mask that's sent
// (work.ts maskForInput maps them onto the working photo).
//   brush: a finger stroke, radius r as a fraction of the frame's width
//   area:  a rectangle (the tap-to-select grid, the screen-reader friendly way to mark a region)
import { Skia, type SkPath } from '@shopify/react-native-skia'

export type Stroke =
  | { kind: 'brush'; pts: number[]; r: number }
  | { kind: 'area'; id: string; x: number; y: number; w: number; h: number }

/** The 3×3 tap grid ("Top left" … "Bottom right"). */
export const AREAS: { id: string; label: string; x: number; y: number; w: number; h: number }[] = (() => {
  const rows = ['Top', 'Middle', 'Bottom']
  const cols = ['left', 'centre', 'right']
  const out = []
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const label = r === 1 && c === 1 ? 'Centre' : `${rows[r]} ${cols[c]}`
      out.push({ id: `${r}${c}`, label, x: c / 3, y: r / 3, w: 1 / 3, h: 1 / 3 })
    }
  }
  return out
})()

/** A brush stroke as a Skia path in a w × h box (draw it with a round-capped stroke of 2r·w). */
export function brushPath(st: Extract<Stroke, { kind: 'brush' }>, w: number, h: number): SkPath {
  const b = Skia.PathBuilder.Make()
  const { pts } = st
  if (pts.length >= 2) {
    b.moveTo(pts[0] * w, pts[1] * h)
    if (pts.length === 2) b.lineTo(pts[0] * w + 0.01, pts[1] * h) // a tap: round caps make it a dot
    for (let i = 2; i < pts.length; i += 2) b.lineTo(pts[i] * w, pts[i + 1] * h)
  }
  return b.build()
}

/** Fraction of the photo covered (rough, for "this covers most of the photo" warnings). */
export function coverage(strokes: Stroke[]): number {
  let a = 0
  for (const s of strokes) {
    if (s.kind === 'area') a += s.w * s.h
    else {
      let len = 0
      for (let i = 2; i < s.pts.length; i += 2) len += Math.hypot(s.pts[i] - s.pts[i - 2], s.pts[i + 1] - s.pts[i - 1])
      a += len * 2 * s.r + Math.PI * s.r * s.r
    }
  }
  return Math.min(1, a)
}
