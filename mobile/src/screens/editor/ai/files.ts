// Image files for the AI tools: encode a Skia image to a file the request can upload, decode a
// result back into Skia (without the EXIF pass loadImage.ts does: these files are our own and
// upright, and a PNG cut-out must keep its alpha, which the JPEG re-encode there would drop).
//   iOS / Android: files in the cache folder (file://).   Web target: blob: URLs.
import { AlphaType, ColorType, FilterMode, ImageFormat, MipmapMode, Skia, type SkImage } from '@shopify/react-native-skia'
import { File, Paths } from 'expo-file-system'
import { Platform } from 'react-native'

import { makeSurface, quiet } from '../surface'

const WEB = Platform.OS === 'web'

export type ImageFile = { uri: string; width: number; height: number; type: 'image/png' | 'image/jpeg'; bytes: number }

function cacheFile(ext: string) {
  return new File(Paths.cache, `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`)
}

/** Write encoded bytes to a local file (blob: URL on the web). */
export function saveBytes(bytes: Uint8Array, type: 'image/png' | 'image/jpeg'): string {
  if (WEB) return URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type }))
  const file = cacheFile(type === 'image/png' ? 'png' : 'jpg')
  file.create()
  file.write(bytes)
  return file.uri
}

/** Encode a Skia image (PNG keeps transparency; JPEG for photos, smaller to upload). */
export function writeImage(img: SkImage, type: 'image/png' | 'image/jpeg', quality = 92): ImageFile {
  const bytes = img.encodeToBytes(type === 'image/png' ? ImageFormat.PNG : ImageFormat.JPEG, quality)
  if (!bytes || !bytes.length) throw new Error('Couldn’t prepare the photo.')
  return { uri: saveBytes(bytes, type), width: img.width(), height: img.height(), type, bytes: bytes.length }
}

/** Decode a local file / blob: URL (or encoded bytes) into a Skia image. */
export async function decodeImage(src: string | Uint8Array): Promise<SkImage> {
  const data = typeof src === 'string' ? await Skia.Data.fromURI(src) : Skia.Data.fromBytes(src)
  const img = Skia.Image.MakeImageFromEncoded(data)
  if (!img) throw new Error('The result couldn’t be opened.')
  return quiet(img)
}

/** Best effort: remove a temporary file we wrote. */
export function discard(uri: string | null | undefined) {
  if (!uri) return
  try {
    if (WEB) {
      if (uri.startsWith('blob:')) URL.revokeObjectURL(uri)
      return
    }
    // Only files we wrote: AI results (ai-*) and Studio results (studio-*, studio/files.ts).
    if (uri.startsWith('file:') && (uri.includes('/ai-') || uri.includes('/studio-'))) {
      const f = new File(uri)
      if (f.exists) f.delete()
    }
  } catch {}
}

/** The image as straight (unpremultiplied) RGBA bytes, at most `edge` px on the long side. */
export function rgbaOf(img: SkImage, edge: number): { data: Uint8ClampedArray; width: number; height: number } {
  const w0 = img.width(), h0 = img.height()
  const s = Math.min(1, edge / Math.max(w0, h0))
  const width = Math.max(1, Math.round(w0 * s)), height = Math.max(1, Math.round(h0 * s))
  let small = img
  if (width !== w0 || height !== h0) {
    const surface = makeSurface(width, height)
    if (!surface) throw new Error('Not enough memory.')
    surface.getCanvas().drawImageRectOptions(img, Skia.XYWHRect(0, 0, w0, h0), Skia.XYWHRect(0, 0, width, height), FilterMode.Linear, MipmapMode.Linear, Skia.Paint())
    surface.flush()
    const snap = surface.makeImageSnapshot()
    small = snap.makeNonTextureImage() ?? snap
  }
  const px = small.readPixels(0, 0, { width, height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul })
  if (!px || !(px instanceof Uint8Array)) throw new Error('Couldn’t read the photo’s colours.')
  return { data: new Uint8ClampedArray(px.buffer, px.byteOffset, px.byteLength), width, height }
}
