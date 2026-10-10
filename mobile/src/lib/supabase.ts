// The app's one Supabase client. Metro redirects every import of the web's
// frontend/src/lib/supabase.js here (see metro.config.js), so shared api/* code
// and native screens use this same client and session.
//
// Uses the publishable key: what users can read or change is enforced by
// Row-Level Security in the database. Values come from mobile/.env.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import { AppState, Platform } from 'react-native'
import 'react-native-url-polyfill/auto'

import type { Database } from '@shared/lib/database.types'
import { ENV } from '@/shims/env'

if (!ENV.supabaseUrl || !ENV.supabaseKey) {
  console.warn('Supabase is not configured: copy mobile/.env.example to mobile/.env and fill it in.')
}

export const supabase = createClient<Database>(ENV.supabaseUrl || 'http://localhost', ENV.supabaseKey || 'missing', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // no URL bar; deep links are handled by the auth callback route
  },
})

// Native apps refresh the session only while in the foreground (Supabase's RN guidance).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh()
    else supabase.auth.stopAutoRefresh()
  })
}
