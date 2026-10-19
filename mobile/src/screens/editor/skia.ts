// Loading Skia. On iOS / Android (and Expo Go) it's built in and ready at once.
// The web target's CanvasKit loader is skia.web.ts (kept out of native bundles).
export function loadSkia(): Promise<void> {
  return Promise.resolve()
}
