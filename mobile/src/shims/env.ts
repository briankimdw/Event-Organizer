// Values the shared web code reads as `import.meta.env.X` (rewritten to
// globalThis.__SHARED_ENV__.X by babel/shared-env-plugin.js).
// EXPO_PUBLIC_* variables come from mobile/.env and are inlined at build time.
import Constants from 'expo-constants'
import { Platform } from 'react-native'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''

// The planner (services/ml). Unset: the dev machine that serves the JS bundle,
// on port 8000, so Expo Go on the same Wi-Fi reaches it without config.
function plannerUrl(): string {
  const set = process.env.EXPO_PUBLIC_PLANNER_URL
  if (set) return set.replace(/\/+$/, '')
  if (Platform.OS === 'web' && typeof location !== 'undefined') return `http://${location.hostname}:8000`
  const host = (Constants.expoConfig?.hostUri ?? '').split(':')[0]
  return `http://${host || 'localhost'}:8000`
}

export const ENV = {
  supabaseUrl: SUPABASE_URL,
  supabaseKey: SUPABASE_KEY,
  plannerUrl: plannerUrl(),
}

// What `import.meta.env` looks like to shared files. DEV is false on purpose:
// shared code uses it for web-only dev tools (e.g. the planner's ?mock=1 mode).
export const SHARED_ENV = {
  VITE_SUPABASE_URL: SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: SUPABASE_KEY,
  VITE_ML_URL: ENV.plannerUrl,
  DEV: false,
  PROD: !__DEV__,
  MODE: __DEV__ ? 'development' : 'production',
  BASE_URL: '/',
  SSR: false,
} as const

;(globalThis as any).__SHARED_ENV__ = SHARED_ENV
