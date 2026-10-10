// Greeting + title + Post button (the web Home's .home-header) and the search bar
// that opens /search (the web's SearchLauncher).
import { useRouter } from 'expo-router'
import { Plus, Search } from 'lucide-react-native'
import { Pressable, View } from 'react-native'

import { Text } from '@/components'
import { useAuth } from '@/state/auth'
import { useStore } from '@/state/store'
import { makeStyles, useTheme } from '@/theme'

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export function HomeHeader() {
  const s = useStyles()
  const { c } = useTheme()
  const router = useRouter()
  const { profile } = useAuth()
  const { isProvider } = useStore()
  const firstName = (profile?.display_name || '').split(' ')[0]
  return (
    <View style={s.header}>
      <View style={s.grow}>
        <Text variant="small" muted>{firstName ? `${greeting()}, ${firstName}` : greeting()}</Text>
        <Text variant="h3" style={s.title}>What are you planning?</Text>
      </View>
      {isProvider && (
        <Pressable onPress={() => router.push('/upload')} style={s.post} accessibilityRole="button" accessibilityLabel="Post photos">
          <Plus size={16} color={c.onInk} />
          <Text variant="small" weight="600" style={{ color: c.onInk }}>Post</Text>
        </Pressable>
      )}
    </View>
  )
}

export function SearchLauncher({ placeholder = 'Search vendors, styles, cities' }: { placeholder?: string }) {
  const s = useStyles()
  const { c } = useTheme()
  const router = useRouter()
  return (
    <Pressable onPress={() => router.push('/search')} style={s.search} accessibilityRole="search" accessibilityLabel={placeholder}>
      <Search size={16} color={c.muted} />
      <Text variant="body" muted numberOfLines={1}>{placeholder}</Text>
    </Pressable>
  )
}

const useStyles = makeStyles((t) => ({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: t.space.lg, paddingTop: 14, paddingBottom: 10 },
  grow: { flex: 1 },
  title: { fontSize: 18 },
  post: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: t.c.ink },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.c.soft, borderRadius: t.radius.md, paddingHorizontal: 12, paddingVertical: 12 },
}))
