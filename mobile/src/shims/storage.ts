// A synchronous `localStorage` / `sessionStorage` for native, because shared web
// code (api/events.js, api/locations.js, api/planner.js) uses them directly.
//
// localStorage: an in-memory Map, hydrated from AsyncStorage at startup and
// written through to it, so values survive app restarts. Reads made before
// hydration finishes (a few ms after launch) just see an empty store; the
// shared code already treats a missing value as "nothing saved".
// sessionStorage: in-memory only (lives as long as the JS runtime).
import AsyncStorage from '@react-native-async-storage/async-storage'

const PREFIX = 'ls:'

class MemoryStorage {
  protected map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null
  }
  getItem(k: string) {
    return this.map.has(String(k)) ? this.map.get(String(k))! : null
  }
  setItem(k: string, v: unknown) {
    this.map.set(String(k), String(v))
  }
  removeItem(k: string) {
    this.map.delete(String(k))
  }
  clear() {
    this.map.clear()
  }
}

class PersistentStorage extends MemoryStorage {
  ready: Promise<void>
  constructor() {
    super()
    this.ready = AsyncStorage.getAllKeys()
      .then((keys) => AsyncStorage.multiGet(keys.filter((k) => k.startsWith(PREFIX))))
      .then((pairs) => {
        for (const [k, v] of pairs) if (v != null && !this.map.has(k.slice(PREFIX.length))) this.map.set(k.slice(PREFIX.length), v)
      })
      .catch((e) => console.warn('localStorage shim: could not hydrate', e))
  }
  setItem(k: string, v: unknown) {
    super.setItem(k, v)
    AsyncStorage.setItem(PREFIX + k, String(v)).catch(() => {})
  }
  removeItem(k: string) {
    super.removeItem(k)
    AsyncStorage.removeItem(PREFIX + k).catch(() => {})
  }
  clear() {
    const keys = [...this.map.keys()].map((k) => PREFIX + k)
    super.clear()
    AsyncStorage.multiRemove(keys).catch(() => {})
  }
}

export function installStorage() {
  const g = globalThis as any
  if (typeof g.localStorage === 'undefined') g.localStorage = new PersistentStorage()
  if (typeof g.sessionStorage === 'undefined') g.sessionStorage = new MemoryStorage()
}
