// Full-resolution export: the same shared shader as the preview, drawn into an offscreen Skia
// surface the size of the output, encoded as JPEG and written to the cache folder.
import { ImageFormat, processUniforms, Skia, type SkImage } from '@shopify/react-native-skia'
import { makeSurface } from './surface'
import { File, Paths } from 'expo-file-system'
import { Platform } from 'react-native'

import { fitEdge, outputSize, type EditRecipe } from './contract'
import { childShaders, getEffect, makeBlur, uniformsFor } from './pipeline'

/** Longest edge of an exported photo (the upload step may shrink it further). */
export const EXPORT_MAX_EDGE = 4096
export const EXPORT_QUALITY = 92

export type Rendered = { image: SkImage; width: number; height: number }

/** Render `recipe` applied to `src` at up to maxEdge output pixels (blur: reuse a makeBlur(src)). */
export function renderToImage(src: SkImage, recipe: EditRecipe, opts: { maxEdge?: number; bypass?: boolean; blur?: SkImage } = {}): Rendered {
  const sw = src.width(), sh = src.height()
  const full = outputSize(recipe, sw, sh)
  const { width, height } = fitEdge(full.width, full.height, opts.maxEdge ?? EXPORT_MAX_EDGE)
  const surface = makeSurface(width, height)
  if (!surface) throw new Error('Not enough memory to export this photo.')
  const fx = getEffect()
  const blur = opts.blur ?? makeBlur(src)
  const u = uniformsFor({ recipe, imgW: sw, imgH: sh, outW: width, outH: height, bypass: opts.bypass })
  const paint = Skia.Paint()
  paint.setShader(fx.makeShaderWithChildren(processUniforms(fx, u), childShaders(src, blur, false)))
  surface.getCanvas().drawRect(Skia.XYWHRect(0, 0, width, height), paint)
  surface.flush()
  const snap = surface.makeImageSnapshot()
  return { image: snap.makeNonTextureImage() ?? snap, width, height }
}

/** Encode + save. Returns a file:// URI (native) or a blob: URL (web). */
export async function saveJpeg(img: SkImage, quality = EXPORT_QUALITY): Promise<string> {
  const bytes = img.encodeToBytes(ImageFormat.JPEG, quality)
  if (!bytes || !bytes.length) throw new Error('Couldn’t save the edited photo.')
  if (Platform.OS === 'web') {
    return URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'image/jpeg' }))
  }
  const file = new File(Paths.cache, `edit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`)
  file.create()
  file.write(bytes)
  return file.uri
}
