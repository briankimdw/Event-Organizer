// 3-column portfolio grid of album covers (the web Profile's .grid3 of .album-tile).
import { Copy } from 'lucide-react-native'
import { Pressable, View, useWindowDimensions } from 'react-native'

import type { toViewerAlbum } from '@shared/api/portfolio.js'
import { Photo, Text } from '@/components'
import { makeStyles } from '@/theme'

export type Album = ReturnType<typeof toViewerAlbum>

const STATUS: Record<string, string> = { processing: 'Processing', under_review: 'In review', hidden: 'Hidden' }
const GAP = 2

export function AlbumGrid({ albums, onOpen }: { albums: Album[]; onOpen: (a: Album) => void }) {
  const s = useStyles()
  const { width } = useWindowDimensions()
  const size = Math.floor((Math.min(width, 700) - GAP * 2) / 3)
  return (
    <View style={s.grid}>
      {albums.map((a) => (
        <Pressable key={a.id} onPress={() => onOpen(a)} style={({ pressed }) => [{ width: size, height: size }, pressed && s.pressed]} accessibilityRole="button" accessibilityLabel={a.title || 'Album'}>
          <Photo uri={a.cover} style={{ width: size, height: size }} />
          {a.photos.length > 1 && (
            <View style={s.count}>
              <Copy size={11} color="#fff" />
              <Text style={s.overlayText}>{a.photos.length}</Text>
            </View>
          )}
          {!!a.status && a.status !== 'published' && (
            <View style={s.status}>
              <Text style={s.overlayText}>{STATUS[a.status] || a.status}</Text>
            </View>
          )}
        </Pressable>
      ))}
    </View>
  )
}

const useStyles = makeStyles((t) => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  pressed: { opacity: 0.8 },
  count: { position: 'absolute', top: 6, right: 6, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: t.c.overlay },
  status: { position: 'absolute', left: 6, bottom: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: t.c.overlay },
  overlayText: { color: '#fff', fontSize: 11, fontWeight: '600' },
}))
