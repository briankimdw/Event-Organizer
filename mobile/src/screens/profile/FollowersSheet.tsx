// Who follows a provider (the web's components/FollowersSheet.jsx). Each row opens that person.
import { useRouter } from 'expo-router'
import { ChevronRight, Users } from 'lucide-react-native'
import { Pressable, View } from 'react-native'

import { listFollowers } from '@shared/api/social.js'
import { Avatar, EmptyState, ErrorState, Loading, Sheet, Text } from '@/components'
import useQuery from '@/hooks/useQuery'
import { makeStyles, useTheme } from '@/theme'

type Follower = { id: string; name: string; username: string | null; avatar: string }

export function FollowersSheet({ open, onClose, providerId, count }: { open: boolean; onClose: () => void; providerId: string; count: number }) {
  const s = useStyles()
  const { c } = useTheme()
  const router = useRouter()
  const { data, loading, error, reload } = useQuery<Follower[]>(open ? () => listFollowers(providerId) : null, [open, providerId])
  return (
    <Sheet open={open} onClose={onClose} title={`Followers${count ? ` · ${count}` : ''}`}>
      {loading && !data && <Loading inline />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data?.length === 0 && <EmptyState compact icon={Users} title="No followers yet" />}
      {data?.map((p) => (
        <Pressable
          key={p.id}
          onPress={() => {
            onClose()
            router.push(`/u/${p.id}`)
          }}
          style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
          accessibilityRole="link"
          accessibilityLabel={`Open ${p.name}’s profile`}
        >
          <Avatar uri={p.avatar} name={p.name} size="md" />
          <View style={s.grow}>
            <Text variant="small" weight="700">{p.name}</Text>
            {!!p.username && <Text variant="tiny" muted>@{p.username}</Text>}
          </View>
          <ChevronRight size={16} color={c.muted} />
        </Pressable>
      ))}
    </Sheet>
  )
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.c.line },
  grow: { flex: 1, minWidth: 0 },
}))
