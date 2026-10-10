// /auth/callback: native port of frontend/src/screens/AuthCallback.jsx. Email links
// (magic link, sign-up confirmation) open the app here, e.g.
// eventorganizer://auth/callback?next=/me#access_token=... (or ?code=... with PKCE).
// We finish the sign-in from the URL (authLink.ts), wait for the profile, then go on
// to `next` (or /welcome for a brand-new account).
import * as Linking from 'expo-linking'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Platform, View } from 'react-native'

import { Button, Screen, Text } from '@/components'
import { safeNext, useAuth } from '@/state/auth'
import { makeStyles, useTheme } from '@/theme'
import { completeAuthFromUrl } from './authLink'

// The URL that opened this screen. On native, the deep link (with its #fragment);
// on web, the address bar; else rebuilt from the route params.
export function useIncomingUrl(params: Record<string, string | string[] | undefined>) {
  const linking = Linking.useLinkingURL()
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.href
  if (linking) return linking
  const qs = new URLSearchParams(Object.entries(params).flatMap(([k, v]) => (v == null ? [] : [[k, Array.isArray(v) ? v[0] : v]]))).toString()
  return qs ? `app://callback?${qs}` : null
}

export default function AuthCallback() {
  const s = useStyles()
  const { c } = useTheme()
  const router = useRouter()
  const params = useLocalSearchParams<Record<string, string>>()
  const next = safeNext(params.next)
  const url = useIncomingUrl(params)
  const { user, profile, needsWelcome } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    let live = true
    completeAuthFromUrl(url).then((r) => live && r.error && setError(r.error))
    return () => { live = false }
  }, [url])

  useEffect(() => {
    if (user && profile) router.replace((needsWelcome ? { pathname: '/welcome', params: { next } } : next) as any)
  }, [user, profile, needsWelcome, next, router])

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 10000)
    return () => clearTimeout(t)
  }, [])

  if (error || (timedOut && !user)) {
    return (
      <Screen back={false} padded>
        <View style={s.center}>
          <Text variant="h3" center>That sign-in link didn’t work</Text>
          <Text variant="small" muted center>
            {error ? error.replace(/\.?$/, '.') : 'It may have expired or already been used.'} Links work once and expire after an hour.
          </Text>
          <Button title="Try again" onPress={() => router.replace({ pathname: '/sign-in', params: { next } })} style={s.btn} />
        </View>
      </Screen>
    )
  }
  return (
    <Screen back={false} padded>
      <View style={s.center}>
        <ActivityIndicator size="large" color={c.ink} />
        <Text variant="small" muted>Signing you in…</Text>
      </View>
    </Screen>
  )
}

const useStyles = makeStyles((t) => ({
  center: { alignItems: 'center', gap: 12, paddingTop: 96, paddingHorizontal: t.space.lg },
  btn: { alignSelf: 'center' },
}))
