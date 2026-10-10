// Finish signing in from an email link that opened the app (magic link, sign-up
// confirmation, password reset). The web gets this for free (supabase-js reads the
// URL on load, detectSessionInUrl); the native client has that off, so the
// /auth/callback and /reset-password screens pass the incoming URL here.
//
// Handles every shape Supabase can send:
//   ?code=...                                PKCE flow       -> exchangeCodeForSession
//   #access_token=...&refresh_token=...      implicit flow   -> setSession
//   ?token_hash=...&type=magiclink|recovery  custom email templates -> verifyOtp
//   ?error_description=... / #error_description=...  an expired or used link
import type { EmailOtpType } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'

const handled = new Map<string, Promise<AuthLinkResult>>()

export type AuthLinkResult = { handled: boolean; error?: string }

export function parseAuthUrl(url: string) {
  const [beforeHash, hash = ''] = url.split('#')
  const query = beforeHash.includes('?') ? beforeHash.slice(beforeHash.indexOf('?') + 1) : ''
  const q = new URLSearchParams(query)
  const h = new URLSearchParams(hash)
  const get = (k: string) => q.get(k) ?? h.get(k)
  return {
    code: get('code'),
    accessToken: get('access_token'),
    refreshToken: get('refresh_token'),
    tokenHash: get('token_hash'),
    type: get('type'),
    error: get('error_description') || get('error'),
    next: get('next'),
  }
}

// Idempotent per URL: the screen may render several times with the same link.
export function completeAuthFromUrl(url: string | null | undefined): Promise<AuthLinkResult> {
  if (!url) return Promise.resolve({ handled: false })
  if (!handled.has(url)) handled.set(url, run(url))
  return handled.get(url)!
}

async function run(url: string): Promise<AuthLinkResult> {
  const p = parseAuthUrl(url)
  if (p.error) return { handled: true, error: p.error.replace(/\+/g, ' ') }
  try {
    if (p.code) {
      const { error } = await supabase.auth.exchangeCodeForSession(p.code)
      if (error) throw error
      return { handled: true }
    }
    if (p.accessToken && p.refreshToken) {
      const { error } = await supabase.auth.setSession({ access_token: p.accessToken, refresh_token: p.refreshToken })
      if (error) throw error
      return { handled: true }
    }
    if (p.tokenHash && p.type) {
      const { error } = await supabase.auth.verifyOtp({ token_hash: p.tokenHash, type: p.type as EmailOtpType })
      if (error) throw error
      return { handled: true }
    }
  } catch (e: any) {
    console.warn('Auth link failed', e)
    return { handled: true, error: e?.message || 'That link didn’t work.' }
  }
  return { handled: false }
}
