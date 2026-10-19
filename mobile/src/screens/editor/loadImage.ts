// Getting the photo into Skia.
//
// iOS / Android: expo-image-manipulator first decodes the original (applying its EXIF
// orientation, which Skia's decoder doesn't) and writes an upright JPEG; Skia decodes that.
//   - preview: long edge PREVIEW_EDGE (what the sliders re-render, fast on any phone)
//   - export:  long edge up to EXPORT_SOURCE_EDGE, decoded only when Done is tapped and
//              released right after, so editing never holds a 48 MP bitmap in memory.
// Web target (development only): Skia decodes the URL directly.
import { FilterMode, MipmapMode, Skia, type SkImage } from '@shopify/react-native-skia'
import { makeSurface, quiet } from './surface'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { Platform } from 'react-native'

export const PREVIEW_EDGE = 1600
export const EXPORT_SOURCE_EDGE = 6000

async function decode(uri: string): Promise<SkImage> {
  const data = await Skia.Data.fromURI(uri)
  const img = Skia.Image.MakeImageFromEncoded(data)
  if (!img) throw new Error('This photo couldn’t be opened.')
  return quiet(img)
}

/** Upright copy of the photo with its long edge at most `edge` (never upscaled). */
async function upright(uri: string, edge: number, quality: number): Promise<string> {
  let ref = await ImageManipulator.manipulate(uri).renderAsync()
  if (Math.max(ref.width, ref.height) > edge) {
    ref = await ImageManipulator.manipulate(ref).resize(ref.width >= ref.height ? { width: edge } : { height: edge }).renderAsync()
  }
  const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: quality })
  return out.uri
}

export async function loadPreview(uri: string): Promise<SkImage> {
  if (Platform.OS === 'web') {
    const full = await decode(uri)
    return downscale(full, PREVIEW_EDGE)
  }
  return decode(await upright(uri, PREVIEW_EDGE, 0.92))
}

export async function loadFull(uri: string): Promise<SkImage> {
  if (Platform.OS === 'web') return decode(uri)
  return decode(await upright(uri, EXPORT_SOURCE_EDGE, 1))
}

/** A smaller copy drawn with Skia, halving step by step (clean without mipmaps). */
export function downscale(img: SkImage, edge: number): SkImage {
  let cur = img
  for (let step = 0; step < 12; step++) {
    const w = cur.width(), h = cur.height()
    const long = Math.max(w, h)
    if (long <= edge) return cur
    const s = Math.max(0.5, edge / long)
    const tw = Math.max(1, Math.round(w * s)), th = Math.max(1, Math.round(h * s))
    const surface = makeSurface(tw, th)
    if (!surface) return cur
    surface.getCanvas().drawImageRectOptions(cur, Skia.XYWHRect(0, 0, w, h), Skia.XYWHRect(0, 0, tw, th), FilterMode.Linear, MipmapMode.None, Skia.Paint())
    surface.flush()
    const snap = surface.makeImageSnapshot()
    const next = snap.makeNonTextureImage() ?? snap
    if (next.width() >= w && next.height() >= h) return cur // no progress: stop
    cur = quiet(next)
  }
  return cur
}
