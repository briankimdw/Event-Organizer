// Loaded first by index.ts. Gives shared web code (frontend/src) the browser
// globals it uses. Each shim only fills a gap: on the web target (react-native-web)
// the real browser APIs are kept. README.md > "Portability issues" lists why each exists.
import 'react-native-url-polyfill/auto' // full URL / URLSearchParams (supabase-js, shared code)
import * as ExpoCrypto from 'expo-crypto'
import './env' // globalThis.__SHARED_ENV__ (import.meta.env in shared files)
import { installGeolocation } from './geolocation'
import { installStorage } from './storage'

const g = globalThis as any

installStorage() // localStorage / sessionStorage (api/events.js, api/locations.js, api/planner.js)
installGeolocation() // navigator.geolocation (api/locations.js getMyLocation)

// crypto.randomUUID / getRandomValues (api/portfolio.js postAlbum)
// (On web `crypto` is a getter-only global that already has both: never reassign it.)
if (typeof g.crypto === 'undefined') g.crypto = {}
try {
  if (typeof g.crypto.randomUUID !== 'function') g.crypto.randomUUID = () => ExpoCrypto.randomUUID()
  if (typeof g.crypto.getRandomValues !== 'function') g.crypto.getRandomValues = (a: any) => ExpoCrypto.getRandomValues(a)
} catch {
  /* read-only crypto (web): the browser's is used */
}

// DOMException (api/locations.js throws one when a geocode request is aborted)
if (typeof g.DOMException === 'undefined') {
  g.DOMException = class DOMException extends Error {
    constructor(message = '', name = 'Error') {
      super(message)
      this.name = name
    }
  }
}
