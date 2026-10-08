import { createClient } from '@supabase/supabase-js'

// Browser client. Uses the publishable key: what users can read or change is
// enforced by Row-Level Security in the database (see supabase/migrations).
// Values come from frontend/.env.local (template: frontend/.env.example).
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  console.warn('Supabase is not configured: copy frontend/.env.example to frontend/.env.local and fill it in.')
}

/** @type {import('@supabase/supabase-js').SupabaseClient<import('./database.types').Database>} */
export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
