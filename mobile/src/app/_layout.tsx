// Root layout: app-wide providers, then one Stack holding the tab group and every
// pushed screen. Screens draw their own header (components/Screen + TopBar), so the
// native header is off everywhere.
// The theme is the user's choice (light by default), not the phone's: the splash stays
// up until the saved preference is read (a few ms), so there's no light/dark flash.
import { DarkTheme, DefaultTheme, SplashScreen, Stack, ThemeProvider } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useMemo } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'

import { ToastHost } from '@/components'
import { AuthProvider } from '@/state/auth'
import { StoreProvider } from '@/state/store'
import { WelcomeGate } from '@/state/WelcomeGate'
import { AppThemeProvider, useTheme, useThemePreference } from '@/theme'

SplashScreen.preventAutoHideAsync().catch(() => {})

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <Root />
    </AppThemeProvider>
  )
}

function Root() {
  const t = useTheme()
  const { ready } = useThemePreference()
  const navTheme = useMemo(() => {
    const nav = t.scheme === 'dark' ? DarkTheme : DefaultTheme
    return { ...nav, dark: t.scheme === 'dark', colors: { ...nav.colors, background: t.c.bg, card: t.c.bg, text: t.c.ink, border: t.c.line, primary: t.c.accent, notification: t.c.accent } }
  }, [t])

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {})
  }, [ready])

  if (!ready) return null
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: t.c.bg }}>
      <ThemeProvider value={navTheme}>
        <AuthProvider>
          <StoreProvider>
            <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.c.bg } }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="sign-in" options={{ presentation: 'modal' }} />
            </Stack>
            <ToastHost />
            <WelcomeGate />
          </StoreProvider>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  )
}
