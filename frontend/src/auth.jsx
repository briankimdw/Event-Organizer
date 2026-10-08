import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from './lib/supabase.js'

// Session + the signed-in user's row from public.profiles (created by the
// signup trigger in the database).
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (userId) => {
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
    // Fires on sign-in, sign-out, token refresh, and when a magic link lands.
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

  const value = {
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

export const useAuth = () => useContext(AuthContext)

// Where to send someone after they sign in (only same-site paths).
export const safeNext = (next) => (next && next.startsWith('/') && !next.startsWith('//') ? next : '/')
