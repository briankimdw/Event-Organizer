// A drawing surface for offscreen work (downscales, the clarity blur, the export).
// iOS / Android: GPU (MakeOffscreen), falling back to CPU. Web: CPU raster, because every web
// MakeOffscreen opens a new WebGL context that is never released (browsers allow ~16).
import { Skia } from '@shopify/react-native-skia'
import { Platform } from 'react-native'

export function makeSurface(width: number, height: number) {
  if (Platform.OS === 'web') return Skia.Surface.Make(width, height)
  return Skia.Surface.MakeOffscreen(width, height) ?? Skia.Surface.Make(width, height)
}

/**
 * Web only, development: React 19's dev prop-diff logging walks every enumerable field of a prop.
 * A CanvasKit-backed Skia object (SkImage, SkRuntimeEffect...) holds the whole CanvasKit module
 * (and its wasm heap), so passing one as a prop freezes the page. Hide those fields. No-op natively.
 */
export function quiet<T>(obj: T): T {
  if (Platform.OS !== 'web' || !obj || typeof obj !== 'object') return obj
  for (const key of ['CanvasKit', 'ref']) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      try {
        Object.defineProperty(obj, key, { enumerable: false })
      } catch {}
    }
  }
  return obj
}
