// Session + the signed-in user's profiles row. Native port of frontend/src/auth.jsx
// (same value shape, so ported screens read it the same way). The session is
// persisted in AsyncStorage by the Supabase client (src/lib/supabase.ts).
import type { Session, User } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

import type { Database } from '@shared/lib/database.types'
import { supabase } from '@/lib/supabase'

export type Profile = Database['public']['Tables']['profiles']['Row']

type AuthValue = {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  refreshProfile: () => Promise<Profile | null>
  needsWelcome: boolean
  signOut: () => Promise<unknown>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (userId?: string | null) => {
    if (!userId) {
      setProfile(null)
      return null
    }
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    if (error) console.warn('Could not load profile', error)
    setProfile(data ?? null)
    return data ?? null
  }, [])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      await loadProfile(data.session?.user.id)
      if (active) setLoading(false)
    })
    // Fires on sign-in, sign-out, token refresh and OTP verification.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      // Defer the query: supabase-js warns against awaiting inside this callback.
      setTimeout(() => loadProfile(next?.user.id), 0)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const value: AuthValue = {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    refreshProfile: () => loadProfile(session?.user.id),
    // New accounts get an auto-generated username and no name: ask for them once.
    needsWelcome: !!session && !!profile && !profile.display_name,
    signOut: () => supabase.auth.signOut(),
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

// Where to send someone after they sign in (only in-app paths).
export const safeNext = (next?: string | string[] | null) => {
  const n = Array.isArray(next) ? next[0] : next
  return n && n.startsWith('/') && !n.startsWith('//') ? n : '/'
}
