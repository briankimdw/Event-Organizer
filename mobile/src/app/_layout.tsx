// Root layout: app-wide providers, then one Stack holding the tab group and every
// pushed screen. Screens draw their own header (components/Screen + TopBar), so the
// native header is off everywhere.
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'

import { ToastHost } from '@/components'
import { AuthProvider } from '@/state/auth'
import { StoreProvider } from '@/state/store'
import { WelcomeGate } from '@/state/WelcomeGate'
import { useTheme } from '@/theme'

export default function RootLayout() {
  const t = useTheme()
  const nav = t.scheme === 'dark' ? DarkTheme : DefaultTheme
  const navTheme = { ...nav, colors: { ...nav.colors, background: t.c.bg, card: t.c.bg, text: t.c.ink, border: t.c.line, primary: t.c.accent } }
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
