// A brand-new account picks a name before using the app: the web App.jsx redirects
// to /welcome?next=<where you were> whenever needsWelcome, except on the auth screens.
// Mounted once in the root layout (renders nothing).
import { useGlobalSearchParams, usePathname, useRootNavigationState, useRouter } from 'expo-router'
import { useEffect } from 'react'

import { useAuth } from './auth'

const AUTH_ROUTES = ['/sign-in', '/auth/callback', '/welcome', '/reset-password']

export function WelcomeGate() {
  const { needsWelcome } = useAuth()
  const pathname = usePathname()
  const params = useGlobalSearchParams()
  const router = useRouter()
  const navReady = !!useRootNavigationState()?.key

  useEffect(() => {
    if (!navReady || !needsWelcome || AUTH_ROUTES.includes(pathname)) return
    const qs = new URLSearchParams(
      Object.entries(params).flatMap(([k, v]) => (v == null ? [] : [[k, String(Array.isArray(v) ? v[0] : v)]])),
    ).toString()
    router.replace({ pathname: '/welcome', params: { next: pathname + (qs ? `?${qs}` : '') } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navReady, needsWelcome, pathname])
  return null
}
