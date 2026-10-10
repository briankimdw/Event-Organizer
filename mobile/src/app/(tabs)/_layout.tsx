// The five tabs, same as the web's components/TabBar.jsx: Home, Discover, Bookings, Inbox, Me.
import { Tabs } from 'expo-router/js-tabs'
import { CalendarCheck, House, Layers, MessageCircle, User } from 'lucide-react-native'

import useUnreadCount from '@/hooks/useUnreadCount'
import { useTheme } from '@/theme'

export default function TabLayout() {
  const { c } = useTheme()
  const unread = useUnreadCount() // inbox badge, live
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.ink,
        tabBarInactiveTintColor: c.faint,
        tabBarStyle: { backgroundColor: c.bg, borderTopColor: c.line },
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <House color={color} size={size ?? 22} /> }} />
      <Tabs.Screen name="discover" options={{ title: 'Discover', tabBarIcon: ({ color, size }) => <Layers color={color} size={size ?? 22} /> }} />
      <Tabs.Screen name="bookings" options={{ title: 'Bookings', tabBarIcon: ({ color, size }) => <CalendarCheck color={color} size={size ?? 22} /> }} />
      <Tabs.Screen name="inbox" options={{ title: 'Inbox', tabBarBadge: unread > 0 ? (unread > 9 ? '9+' : unread) : undefined, tabBarBadgeStyle: { backgroundColor: c.accent, color: c.onAccent, fontSize: 10 }, tabBarIcon: ({ color, size }) => <MessageCircle color={color} size={size ?? 22} /> }} />
      <Tabs.Screen name="me" options={{ title: 'Me', tabBarIcon: ({ color, size }) => <User color={color} size={size ?? 22} /> }} />
    </Tabs>
  )
}
