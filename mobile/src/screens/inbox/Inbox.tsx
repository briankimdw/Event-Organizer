// Inbox tab: native port of frontend/src/screens/Inbox.jsx. My conversations
// (direct, group, booking, inquiry), newest first, with unread dots. Live: reloads
// when a message arrives anywhere (subscribeToInbox) and whenever the tab regains focus.
import { useFocusEffect, useRouter } from 'expo-router'
import { Briefcase, CalendarDays, MessageCircle, Search, SquarePen, Users } from 'lucide-react-native'
import { useCallback, useEffect, useState } from 'react'
import { FlatList, Pressable, RefreshControl, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { listConversations, subscribeToInbox } from '@shared/api/messages.js'
import { ago } from '@shared/lib/dates.js'
import { Avatar, Button, EmptyState, ErrorState, IconButton, Loading, SignInPrompt, Text, TextField } from '@/components'
import useQuery from '@/hooks/useQuery'
import { useAuth } from '@/state/auth'
import { makeStyles, useTheme } from '@/theme'

export type Conversation = Awaited<ReturnType<typeof listConversations>>[number]

const preview = (c: Conversation) => {
  const last = c.lastMessage
  if (!last) return c.isGroup ? 'New group · say hi 👋' : 'Say hi 👋'
  const sender = c.members.find((m: any) => m.profileId === last.senderId)
  const who = last.fromMe ? 'You: ' : c.isGroup ? `${sender?.name.split(' ')[0] ?? 'Someone'}: ` : ''
  return who + (last.text || 'Shared a post')
}

export default function Inbox() {
  const s = useStyles()
  const { c: col } = useTheme()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { data, loading, error, reload } = useQuery<Conversation[]>(user ? listConversations : null, [user?.id])
  const [q, setQ] = useState('')
  const [pulling, setPulling] = useState(false)

  useEffect(() => (user ? subscribeToInbox(reload) : undefined), [user?.id, reload])
  // Back from a chat: its unread dot should be gone.
  useFocusEffect(useCallback(() => { if (user) reload() }, [user?.id, reload])) // eslint-disable-line react-hooks/exhaustive-deps

  const query = q.trim().toLowerCase()
  const list = (data || []).filter(
    (c) => !query || c.title.toLowerCase().includes(query) || c.lastMessage?.text?.toLowerCase().includes(query) || c.booking?.packageName?.toLowerCase().includes(query),
  )

  const header = (
    <View style={s.header}>
      <Text variant="h1">Messages</Text>
      {user && <IconButton icon={SquarePen} label="New message" onPress={() => router.push('/inbox/new')} />}
    </View>
  )

  let body
  if (authLoading) body = <Loading />
  else if (!user) body = <SignInPrompt title="Sign in to see your messages" text="Chat with vendors about bookings, pricing and style." />
  else if (loading && !data) body = <Loading />
  else if (error && !data) body = <ErrorState error={error} onRetry={reload} />
  else {
    body = (
      <FlatList
        data={list}
        keyExtractor={(c) => c.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={pulling}
            onRefresh={async () => {
              setPulling(true)
              await Promise.resolve(reload())
              setTimeout(() => setPulling(false), 400)
            }}
            tintColor={col.muted} colors={[col.ink]} progressBackgroundColor={col.card}
          />
        }
        ListHeaderComponent={
          data?.length ? (
            <View style={s.search}>
              <TextField icon={Search} placeholder="Search messages" value={q} onChangeText={setQ} clearable returnKeyType="search" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          !data?.length ? (
            <EmptyState
              icon={MessageCircle}
              title="No messages yet"
              text="Message anyone, ask a vendor a question, or request a booking to start a thread."
              action={<Button title="New message" size="sm" onPress={() => router.push('/inbox/new')} />}
            />
          ) : (
            <EmptyState compact icon={Search} title="No matches" text={`Nothing matches “${q.trim()}”.`} />
          )
        }
        renderItem={({ item: c }) => <ConversationRow c={c} onPress={() => router.push({ pathname: '/inbox/[id]', params: { id: c.id } })} />}
        contentContainerStyle={s.listContent}
      />
    )
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {header}
      {body}
    </SafeAreaView>
  )
}

function ConversationRow({ c, onPress }: { c: Conversation; onPress: () => void }) {
  const s = useStyles()
  const { c: col } = useTheme()
  const [first] = c.members
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.row, pressed && { backgroundColor: col.soft }]}
      accessibilityRole="button"
      accessibilityLabel={`${c.title}${c.unread ? ', unread' : ''}. ${preview(c)}`}
    >
      <View>
        <Avatar uri={first?.avatar} name={first?.name ?? c.title} size={48} />
        {c.isGroup && c.members.length > 1 && (
          <View style={s.groupCount}><Text variant="caption" style={{ color: col.onInk }}>+{c.members.length}</Text></View>
        )}
      </View>
      <View style={s.grow}>
        <View style={s.titleRow}>
          <Text weight={c.unread ? '700' : '600'} numberOfLines={1} style={s.shrink}>{c.title}</Text>
          {c.kind === 'booking' && <Tag icon={Briefcase} label="Booking" />}
          {c.kind === 'inquiry' && <Tag label="Inquiry" />}
          {c.kind === 'group' && <Tag icon={Users} label="Group" />}
          {c.kind === 'event' && <Tag icon={CalendarDays} label="Event" />}
        </View>
        <Text variant="small" numberOfLines={1} muted={!c.unread} weight={c.unread ? '600' : undefined}>{preview(c)}</Text>
      </View>
      <View style={s.meta}>
        <Text variant="tiny" muted>{ago(c.lastMessage?.at || c.lastMessageAt)}</Text>
        {c.unread && <View style={s.dot} accessibilityLabel="Unread" />}
      </View>
    </Pressable>
  )
}

function Tag({ label, icon: Icon }: { label: string; icon?: typeof Users }) {
  const s = useStyles()
  const { c } = useTheme()
  return (
    <View style={s.tag}>
      {Icon && <Icon size={10} color={c.muted} />}
      <Text variant="caption" muted>{label}</Text>
    </View>
  )
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.c.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: t.space.lg, paddingTop: t.space.sm, paddingBottom: t.space.sm },
  search: { paddingHorizontal: t.space.lg, paddingBottom: t.space.sm },
  listContent: { paddingBottom: t.space.xxl, flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: t.space.lg, paddingVertical: 10 },
  grow: { flex: 1, minWidth: 0, gap: 2 },
  shrink: { flexShrink: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: t.c.soft, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  meta: { alignItems: 'flex-end', gap: 6, minWidth: 36 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: t.c.accent },
  groupCount: {
    position: 'absolute', right: -4, bottom: -2, backgroundColor: t.c.ink, borderRadius: 999, paddingHorizontal: 5, paddingVertical: 1,
    borderWidth: 2, borderColor: t.c.bg,
  },
}))
