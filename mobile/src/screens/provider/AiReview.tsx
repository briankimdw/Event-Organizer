// /ai-review/[id]: native port of frontend/src/screens/AiReview.jsx. The review
// status of one of my albums (id = album id). There's no automated AI check yet:
// an album is only "in review" if the team has put it there.
import { useLocalSearchParams, useRouter } from 'expo-router'
import { CheckCircle2, Clock, EyeOff, ImageOff, Loader, ShieldAlert } from 'lucide-react-native'
import { View } from 'react-native'

import { getAlbum, getMyProviders, toViewerAlbum } from '@shared/api/portfolio.js'
import { Button, EmptyState, ErrorState, Loading, Photo, Screen, SignInPrompt, Text } from '@/components'
import useQuery from '@/hooks/useQuery'
import { useAuth } from '@/state/auth'
import { makeStyles, useTheme } from '@/theme'
import { Callout } from '../account/ui'

type Tone = 'soft' | 'live' | 'danger'
const STATUS: Record<string, { title: string; Icon: typeof Clock; tone: Tone; head: string; text: string }> = {
  under_review: {
    title: 'Post in review', Icon: ShieldAlert, tone: 'danger', head: 'Held for review',
    text: 'This album isn’t public while our team reviews it. You don’t need to do anything for now. The original files you uploaded are stored privately with the post.',
  },
  processing: { title: 'Post processing', Icon: Loader, tone: 'soft', head: 'Still processing', text: 'This album is still being processed and isn’t public yet.' },
  hidden: { title: 'Hidden post', Icon: EyeOff, tone: 'soft', head: 'Hidden', text: 'This album is hidden. Only you can see it.' },
  published: { title: 'Post', Icon: CheckCircle2, tone: 'live', head: 'Live', text: 'This album is public on your profile.' },
}

// One of my albums (any of my listings), or null if it doesn't exist or isn't mine.
async function loadMyAlbum(albumId: string, userId: string) {
  const [row, mine] = await Promise.all([
    getAlbum(albumId).catch((e: any) => (e?.code === '22P02' ? null : Promise.reject(e))), // 22P02: not a uuid
    getMyProviders(userId),
  ])
  return row && mine.some((p: any) => p.id === row.provider_id) ? toViewerAlbum(row) : null
}

export default function AiReview() {
  const s = useStyles()
  const { c } = useTheme()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user, loading: authLoading } = useAuth()
  const { data: album, loading, error, reload } = useQuery(user && id ? () => loadMyAlbum(id, user.id) : null, [id, user?.id])

  if (!authLoading && !user) return <Screen title="Post in review" back><SignInPrompt title="Sign in to see your post" /></Screen>
  if (authLoading || loading) return <Screen title="Post in review" back><Loading /></Screen>
  if (error) return <Screen title="Post in review" back><ErrorState error={error} onRetry={reload} /></Screen>
  if (!album) {
    return (
      <Screen title="Post in review" back>
        <EmptyState icon={ImageOff} title="Post not found" text="It may have been deleted, or it isn’t yours."
          action={<Button title="Back to profile" size="sm" onPress={() => router.replace('/me')} />} />
      </Screen>
    )
  }

  const st = STATUS[album.status] || { title: 'Post', Icon: Clock, tone: 'soft' as Tone, head: album.status, text: '' }
  const tint = st.tone === 'danger' ? c.danger : st.tone === 'live' ? c.ok : c.ink
  return (
    <Screen title={st.title} subtitle={album.title} back padded>
      {!!album.cover && <Photo uri={album.cover} style={s.img} />}
      <Callout tone={st.tone} style={s.mt}>
        <View style={s.inline}><st.Icon size={16} color={tint} /><Text weight="700">{st.head}</Text></View>
        {!!st.text && <Text variant="small" muted>{st.text}</Text>}
      </Callout>
      <Text variant="small" muted style={s.mtSm}>
        {album.title}
        {album.photos.length > 0 && ` · ${album.photos.length} photo${album.photos.length === 1 ? '' : 's'}`}
        {album.date && ` · ${album.date}`}
      </Text>
      {album.status === 'published' && (
        <Button title="View post" block style={s.mt}
          onPress={() => router.push({ pathname: '/gallery/[personId]', params: { personId: album.providerId, post: album.id } })} />
      )}
    </Screen>
  )
}

const useStyles = makeStyles((t) => ({
  img: { width: '100%', aspectRatio: 1, borderRadius: t.radius.lg },
  mt: { marginTop: t.space.md },
  mtSm: { marginTop: t.space.sm },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
}))
