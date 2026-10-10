// `navigator.geolocation` for native, backed by expo-location, so the shared
// getMyLocation() in api/locations.js works unchanged (it only uses
// getCurrentPosition and checks err.code === 1 for "permission denied").
import * as Location from 'expo-location'

type Success = (pos: { coords: { latitude: number; longitude: number; accuracy: number | null }; timestamp: number }) => void
type Failure = (err: { code: number; message: string }) => void

const geolocation = {
  getCurrentPosition(success: Success, failure?: Failure, options: { enableHighAccuracy?: boolean; timeout?: number } = {}) {
    ;(async () => {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') return failure?.({ code: 1, message: 'Permission denied' })
      const timeout = options.timeout ?? 10_000
      const pos = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: options.enableHighAccuracy ? Location.Accuracy.High : Location.Accuracy.Balanced }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeout)),
      ])
      success({ coords: { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }, timestamp: pos.timestamp })
    })().catch((e) => failure?.({ code: /timeout/.test(String(e?.message)) ? 3 : 2, message: String(e?.message || e) }))
  },
  watchPosition() {
    console.warn('navigator.geolocation.watchPosition is not shimmed; use expo-location directly')
    return -1
  },
  clearWatch() {},
}

export function installGeolocation() {
  const g = globalThis as any
  // On the web target `navigator` is a getter-only global with real geolocation: leave it alone.
  if (typeof g.navigator === 'undefined') g.navigator = {}
  if (!g.navigator.geolocation) {
    try {
      g.navigator.geolocation = geolocation
    } catch {
      /* read-only navigator (web): browser geolocation is used instead */
    }
  }
}
