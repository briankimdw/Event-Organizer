// Web target only (development / screenshots / the parity test): Skia on the web is CanvasKit
// (WebAssembly), which must be downloaded before ANY module importing '@shopify/react-native-skia'
// is evaluated, so the editor's Skia code is only reached through a dynamic import after
// loadSkia() (see PhotoEditor.tsx). The wasm comes from jsDelivr at the exact version Skia depends
// on, instead of being copied into a public/ folder.
// The native twin is skia.ts: this file (and canvaskit-wasm, which requires Node's "fs") must never
// be part of an iOS / Android bundle.
const CANVASKIT_VERSION = '0.41.0' // = node_modules/canvaskit-wasm (dependency of @shopify/react-native-skia 2.6.2)

let ready: Promise<void> | null = null

export function loadSkia(): Promise<void> {
  ready ??= import('@shopify/react-native-skia/lib/module/web/LoadSkiaWeb').then(({ LoadSkiaWeb }) =>
    LoadSkiaWeb({ locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/canvaskit-wasm@${CANVASKIT_VERSION}/bin/full/${file}` }),
  )
  ready.catch(() => (ready = null)) // allow a retry
  return ready
}
