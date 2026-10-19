// Values the shared web code reads as `import.meta.env.X` (rewritten to
// globalThis.__SHARED_ENV__.X by babel/shared-env-plugin.js).
// EXPO_PUBLIC_* variables come from mobile/.env and are inlined at build time.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''

export const ENV = {
  supabaseUrl: SUPABASE_URL,
  supabaseKey: SUPABASE_KEY,
}

// What `import.meta.env` looks like to shared files. DEV is false on purpose:
// shared code uses it for web-only dev tools. (VITE_ML_URL, the AI planner's URL, went
// with the planner in the photography pivot.)
export const SHARED_ENV = {
  VITE_SUPABASE_URL: SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: SUPABASE_KEY,
  DEV: false,
  PROD: !__DEV__,
  MODE: __DEV__ ? 'development' : 'production',
  BASE_URL: '/',
  SSR: false,
} as const

;(globalThis as any).__SHARED_ENV__ = SHARED_ENV
