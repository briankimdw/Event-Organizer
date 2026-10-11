// Pure helpers for the sign-in / sign-up / welcome screens, shared by the web and the
// native app (mobile imports this file through @shared). No DOM, no React.
import { supabase } from '../../lib/supabase.js'

export const MIN_PASSWORD = 8
export const CODE_LENGTH = 6
export const USERNAME_RE = /^[a-z0-9._]{3,30}$/

// The live checklist under "Create a password". Only the first rule is enforced (the same
// MIN_PASSWORD check the sign-up handler already does); the others only raise the strength.
export function passwordRules(pw = '') {
  return [
    { id: 'length', label: `At least ${MIN_PASSWORD} characters`, ok: pw.length >= MIN_PASSWORD, required: true },
    { id: 'case', label: 'Upper and lower case letters', ok: /[a-z]/.test(pw) && /[A-Z]/.test(pw) },
    { id: 'digit', label: 'A number or a symbol', ok: /[\d\W_]/.test(pw) },
  ]
}

// 0 = empty, 1 = too short, 2 = okay, 3 = good, 4 = strong.
export function passwordStrength(pw = '') {
  if (!pw) return { score: 0, label: '' }
  if (pw.length < MIN_PASSWORD) return { score: 1, label: 'Too short' }
  const extras = passwordRules(pw).filter((r) => !r.required && r.ok).length + (pw.length >= 12 ? 1 : 0)
  if (extras >= 3) return { score: 4, label: 'Strong' }
  if (extras === 2) return { score: 3, label: 'Good' }
  return { score: 2, label: 'Okay' }
}

// Round-robin over vendors so the collage isn't all one person's work: up to n cover URLs.
export function coverMix(providers = [], n = 6) {
  const out = []
  const lists = (providers || []).map((p) => p.covers || [])
  for (let round = 0; out.length < n && lists.some((l) => l.length > round); round++) {
    for (const l of lists) if (l[round] && out.length < n) out.push(l[round])
  }
  return out
}

// Initials for the avatar preview on the welcome step ("Alex Rivera" -> "AR").
export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return ''
  return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

// Is this username already someone else's? Profiles are publicly readable, so this is a plain
// read (no new backend). Advisory only: saving still catches the unique-constraint error.
// Returns true (taken), false (free) or null (couldn't tell).
export async function usernameTaken(username, selfId) {
  let q = supabase.from('profiles').select('id').eq('username', username).limit(1)
  if (selfId) q = q.neq('id', selfId)
  const { data, error } = await q
  if (error) return null
  return (data || []).length > 0
}
