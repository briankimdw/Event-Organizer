// How AI results fit the non-destructive editor (same rules as the web):
//   - The AI tools work on the WORKING photo (the original, or the result of an earlier AI step),
//     never on the original file itself: the original stays untouched.
//   - Each result becomes the new working photo ("base"); the recipe (sliders, look, crop) stays
//     and keeps applying on top, so the user can still fine-tune. Undo steps back to the previous
//     base; Reset all goes back to the original.
//   - A recipe only describes edits relative to the ORIGINAL, so once an AI step is in, the editor
//     hands back recipe: null (the render is baked in) plus the list of AI steps.
//   - Masks are painted on the photo as shown (cropped / turned) and mapped back to the working
//     photo's pixels with the shared geometry matrix.
import { PaintStyle, Skia, StrokeCap, StrokeJoin, type SkImage } from '@shopify/react-native-skia'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { Platform } from 'react-native'

import { geometryMatrix, mat3, outputSize, type EditRecipe } from '../contract'
import { STUDIO_STEP } from '../studio/config'
import { downscale, PREVIEW_EDGE } from '../loadImage'
import { makeBlur } from '../pipeline'
import { makeSurface, quiet } from '../surface'
import { decodeImage, saveBytes, writeImage, type ImageFile } from './files'
import { brushPath, type Stroke } from './mask'

export type Base = {
  id: number
  /** Full-size working photo (file:// or blob:), what the export and the next AI step read. */
  uri: string
  width: number
  height: number
  preview: SkImage
  blur: SkImage
  thumb: SkImage
  /** AI / Studio steps so far, oldest first ("Background removed", "Erased", "Upscaled 2×", "Edited in Studio"). */
  steps: string[]
  /**
   * Studio bakes the sliders into its result (the recipe restarts from zero on top of it). This is
   * the recipe the first Studio step in the chain replaced: "Remove AI edits" brings it back.
   */
  restore?: EditRecipe
}

/** The working photo as a file of at most `maxEdge` px (upright), plus its Skia image. */
export async function workingInput(src: { uri: string; base: Base | null }, maxEdge: number): Promise<{ file: ImageFile; image: SkImage }> {
  if (src.base) {
    const full = await decodeImage(src.base.uri)
    if (Math.max(full.width(), full.height()) <= maxEdge) {
      const type = src.base.uri.endsWith('.png') ? 'image/png' : 'image/jpeg'
      return { file: { uri: src.base.uri, width: full.width(), height: full.height(), type, bytes: 0 }, image: full }
    }
    const small = downscale(full, maxEdge)
    return { file: writeImage(small, 'image/jpeg', 92), image: small }
  }
  if (Platform.OS === 'web') {
    const full = await decodeImage(src.uri)
    const small = downscale(full, maxEdge)
    return { file: writeImage(small, 'image/jpeg', 92), image: small }
  }
  // iOS / Android: the manipulator applies EXIF orientation (Skia's decoder doesn't) and resizes.
  let ref = await ImageManipulator.manipulate(src.uri).renderAsync()
  if (Math.max(ref.width, ref.height) > maxEdge) {
    ref = await ImageManipulator.manipulate(ref).resize(ref.width >= ref.height ? { width: maxEdge } : { height: maxEdge }).renderAsync()
  }
  const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.92 })
  const image = await decodeImage(out.uri)
  return { file: { uri: out.uri, width: out.width, height: out.height, type: 'image/jpeg', bytes: 0 }, image }
}

/** Long edge of the working photo at full size (what Upscale checks against its 1024 px limit). */
export function workingEdge(base: Base | null, source: { width?: number; height?: number }, preview: SkImage | null): number | null {
  if (base) return Math.max(base.width, base.height)
  if (source.width && source.height) return Math.max(source.width, source.height)
  // The preview is the photo itself when it's smaller than the preview size.
  if (preview && Math.max(preview.width(), preview.height()) < PREVIEW_EDGE) return Math.max(preview.width(), preview.height())
  return null
}

/**
 * The mask for /ai/erase at the input's size: strokes were painted in the output frame of
 * `recipe` (u, v in 0..1); the shared geometry matrix maps them onto the working photo.
 */
export function maskForInput(strokes: Stroke[], recipe: EditRecipe, w: number, h: number): ImageFile {
  const out = outputSize(recipe, w, h) // the frame the user painted on, in input pixels
  const m = geometryMatrix(recipe, w, h) // output uv -> source st
  const t = mat3.mul(mat3.mul([w, 0, 0, 0, h, 0, 0, 0, 1], m), [1 / out.width, 0, 0, 0, 1 / out.height, 0, 0, 0, 1])
  const surface = makeSurface(w, h)
  if (!surface) throw new Error('Not enough memory to prepare the mask.')
  const canvas = surface.getCanvas()
  canvas.clear(Skia.Color('black'))
  canvas.save()
  canvas.concat(Skia.Matrix(t))
  const fill = Skia.Paint()
  fill.setColor(Skia.Color('white'))
  fill.setAntiAlias(true)
  const line = Skia.Paint()
  line.setColor(Skia.Color('white'))
  line.setAntiAlias(true)
  line.setStyle(PaintStyle.Stroke)
  line.setStrokeCap(StrokeCap.Round)
  line.setStrokeJoin(StrokeJoin.Round)
  for (const s of strokes) {
    if (s.kind === 'area') canvas.drawRect(Skia.XYWHRect(s.x * out.width, s.y * out.height, s.w * out.width, s.h * out.height), fill)
    else {
      line.setStrokeWidth(Math.max(1, s.r * 2 * out.width))
      canvas.drawPath(brushPath(s, out.width, out.height), line)
    }
  }
  canvas.restore()
  surface.flush()
  const snap = surface.makeImageSnapshot()
  const img = snap.makeNonTextureImage() ?? snap
  return writeImage(img, 'image/png')
}

/** What to call the pixel edits in `steps`: "AI edits", "Studio edits" or "AI & Studio edits". */
export function pixelEditsLabel(steps: string[]): string {
  const studio = steps.filter((x) => x === STUDIO_STEP).length
  if (!studio) return 'AI edits'
  return studio === steps.length ? 'Studio edits' : 'AI & Studio edits'
}

let nextId = 1

/** A finished image that's already a file of ours (a Studio result) as a new working base. */
export async function makeBaseFromFile(file: { uri: string }, steps: string[], restore?: EditRecipe): Promise<Base> {
  const full = await decodeImage(file.uri)
  const preview = quiet(downscale(full, PREVIEW_EDGE))
  return {
    id: nextId++, uri: file.uri, width: full.width(), height: full.height(),
    preview, blur: makeBlur(preview), thumb: quiet(downscale(preview, 220)), steps, restore,
  }
}

/** A finished AI image (encoded bytes or an already-decoded image) as a new working base. */
export async function makeBase(from: { bytes: Uint8Array; type: 'image/png' | 'image/jpeg' } | { image: SkImage; type: 'image/png' | 'image/jpeg' }, steps: string[]): Promise<Base> {
  let full: SkImage, uri: string
  if ('bytes' in from) {
    uri = saveBytes(from.bytes, from.type)
    full = await decodeImage(from.bytes)
  } else {
    full = from.image
    uri = writeImage(full, from.type, 95).uri
  }
  const preview = quiet(downscale(full, PREVIEW_EDGE))
  return {
    id: nextId++, uri, width: full.width(), height: full.height(),
    preview, blur: makeBlur(preview), thumb: quiet(downscale(preview, 220)), steps,
  }
}
