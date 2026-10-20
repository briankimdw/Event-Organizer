// Putting a background behind a cut-out (Remove background), and the checkerboard that shows
// transparency. The cut-out is the same size as the photo that was sent, so the blurred
// background is that photo, blurred.
import { BlendMode, FilterMode, MipmapMode, Skia, TileMode, type SkImage } from '@shopify/react-native-skia'

import { makeSurface, quiet } from '../surface'

export type Backdrop = { kind: 'transparent' } | { kind: 'color'; color: string } | { kind: 'blur' }

export const BACKDROP_COLORS: { color: string; label: string }[] = [
  { color: '#ffffff', label: 'White' },
  { color: '#000000', label: 'Black' },
  { color: '#ece6dc', label: 'Warm grey' },
  { color: '#dfe7ef', label: 'Cool grey' },
]

export const backdropLabel = (b: Backdrop) =>
  b.kind === 'transparent' ? 'Transparent' : b.kind === 'blur' ? 'Blurred photo' : BACKDROP_COLORS.find((c) => c.color === b.color)?.label ?? b.color

/** Blur radius for the blurred backdrop, relative to the long edge (same look at any size). */
export const BLUR_FRACTION = 0.025

/** The cut-out flattened onto the backdrop (opaque), or the cut-out itself for 'transparent'. */
export function flatten(cutout: SkImage, backdrop: Backdrop, photo: SkImage | null): SkImage {
  if (backdrop.kind === 'transparent') return cutout
  const w = cutout.width(), h = cutout.height()
  const surface = makeSurface(w, h)
  if (!surface) throw new Error('Not enough memory.')
  const canvas = surface.getCanvas()
  if (backdrop.kind === 'color' || !photo) {
    canvas.clear(Skia.Color(backdrop.kind === 'color' ? backdrop.color : '#ffffff'))
  } else {
    const sigma = Math.max(2, Math.max(w, h) * BLUR_FRACTION)
    const p = Skia.Paint()
    p.setImageFilter(Skia.ImageFilter.MakeBlur(sigma, sigma, TileMode.Clamp, null))
    canvas.drawImageRectOptions(photo, Skia.XYWHRect(0, 0, photo.width(), photo.height()), Skia.XYWHRect(0, 0, w, h), FilterMode.Linear, MipmapMode.None, p)
  }
  const over = Skia.Paint()
  over.setBlendMode(BlendMode.SrcOver)
  canvas.drawImage(cutout, 0, 0, over)
  surface.flush()
  const snap = surface.makeImageSnapshot()
  return quiet(snap.makeNonTextureImage() ?? snap)
}

let checker: SkImage | null = null
/** A 16 × 16 two-tone tile (8 px squares) to repeat under transparent pixels. */
export function checkerTile(): SkImage {
  if (checker) return checker
  const surface = makeSurface(16, 16)
  if (!surface) throw new Error('Not enough memory.')
  const c = surface.getCanvas()
  c.clear(Skia.Color('#ffffff'))
  const p = Skia.Paint()
  p.setColor(Skia.Color('#d0d0d0'))
  c.drawRect(Skia.XYWHRect(0, 0, 8, 8), p)
  c.drawRect(Skia.XYWHRect(8, 8, 8, 8), p)
  surface.flush()
  const snap = surface.makeImageSnapshot()
  checker = quiet(snap.makeNonTextureImage() ?? snap)
  return checker
}
