// /post/[id] links (e.g. posts shared in chat): id is an album id. Looks the album up and
// replaces this screen with the gallery opened at that album (the web's PostRedirect).
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router'
import { ImageOff } from 'lucide-react-native'

import { getAlbum } from '@shared/api/portfolio.js'
import { Button, EmptyState, ErrorState, Loading } from '@/components'
import useQuery from '@/hooks/useQuery'
import { GalleryState } from './Gallery'

export default function PostRedirect() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: album, loading, error, reload } = useQuery<{ id: string; provider_id: string } | null>(
    () => getAlbum(String(id)).catch((e: any) => (e?.code === '22P02' ? null : Promise.reject(e))),
    [id],
  )
  if (loading) return <GalleryState><Loading /></GalleryState>
  if (error) return <GalleryState close><ErrorState error={error} onRetry={reload} /></GalleryState>
  if (!album) {
    return (
      <GalleryState close>
        <EmptyState icon={ImageOff} title="Post not found" text="It may have been removed by its owner."
          action={<Button title="Go home" size="sm" onPress={() => router.replace('/')} />} />
      </GalleryState>
    )
  }
  return <Redirect href={{ pathname: '/gallery/[personId]', params: { personId: album.provider_id, post: album.id } }} />
}
