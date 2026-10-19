// A card for something shared in chat (message.shared from @shared/api/messages.js):
// a post or a photographer; tapping opens it. Native twin of the web's
// components/share/ShareCard.jsx. Events are archived (photography pivot): an old
// shared event shows as a small generic stub that opens nothing. A shared before & after shows
// the after photo with the "Before / After" badge; press and hold to wipe the before in.
import { router } from 'expo-router'
import { CalendarDays, ChevronRight, ImageOff, Star } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, View } from 'react-native'

import { Avatar, Photo, Text } from '@/components'
import { BA_THUMB_PRESS_MS, BeforeAfterThumb } from '@/components/BeforeAfter'
import { useBeforePhotos } from '@/lib/beforeAfter'
import { makeStyles, useTheme } from '@/theme'

export type SharedThing = {
  kind: 'post' | 'provider' | 'event'
  id: string | null
  available: boolean
  title?: string | null
  caption?: string | null
  cover?: string | null
  vendorName?: string | null
  providerId?: string | null
  name?: string
  avatar?: string
  noun?: string | null
  city?: string | null
  rating?: number | null
  reviewCount?: number
  fromPrice?: string | null
  beforeAfter?: boolean
}

const open = (s: SharedThing) => {
  if (!s.id) return
  if (s.kind === 'post' && s.providerId) router.push({ pathname: '/gallery/[personId]', params: { personId: s.providerId, post: s.id } })
  else if (s.kind === 'provider') router.push({ pathname: '/u/[id]', params: { id: s.id } })
}

export function ShareCard({ shared }: { shared: SharedThing | null | undefined }) {
  const s = useStyles()
  const { c } = useTheme()
  if (!shared) return null

  if (shared.kind !== 'post' && shared.kind !== 'provider') {
    return (
      <View style={[s.card, s.gone]} accessible accessibilityLabel={`Shared an event${shared.title ? `: ${shared.title}` : ''}. Events aren’t available anymore.`}>
        <CalendarDays size={16} color={c.muted} />
        <View style={s.shrink}>
          <Text variant="small" weight="600" numberOfLines={1}>{shared.title || 'Shared an event'}</Text>
          <Text variant="tiny" muted>Events aren’t available anymore</Text>
        </View>
      </View>
    )
  }

  if (!shared.available) {
    return (
      <View style={[s.card, s.gone]}>
        <ImageOff size={16} color={c.muted} />
        <Text variant="small" muted>{shared.kind === 'post' ? 'This post is no longer available' : 'This profile is no longer available'}</Text>
      </View>
    )
  }

  if (shared.kind === 'post') return <PostCard shared={shared} />

  if (shared.kind === 'provider') {
    const meta = [shared.noun && shared.noun.replace(/^\w/, (x) => x.toUpperCase()), shared.city?.split(',')[0]].filter(Boolean).join(' · ')
    return (
      <Pressable onPress={() => open(shared)} style={({ pressed }) => [s.card, pressed && s.pressed]} accessibilityRole="button" accessibilityLabel={`Profile: ${shared.name}`}>
        <View style={s.cover}>{!!shared.cover && <Photo uri={shared.cover} style={s.fill} />}</View>
        <View style={s.vendor}>
          <Avatar uri={shared.avatar} name={shared.name} size={52} ring />
          <View style={[s.vendorText, s.belowCover]}>
            <Text weight="600" numberOfLines={1}>{shared.name}</Text>
            {!!meta && <Text variant="tiny" muted numberOfLines={1}>{meta}</Text>}
            <View style={s.stats}>
              {shared.rating != null ? (
                <View style={s.inline}>
                  <Star size={11} color={c.star} fill={c.star} />
                  <Text variant="tiny" weight="600">{shared.rating.toFixed(1)}</Text>
                  <Text variant="tiny" muted>({shared.reviewCount ?? 0})</Text>
                </View>
              ) : (
                <Text variant="tiny" muted>New</Text>
              )}
              {!!shared.fromPrice && <Text variant="tiny" weight="600">{shared.fromPrice}</Text>}
            </View>
          </View>
        </View>
        <View style={s.cta}>
          <Text variant="tiny" weight="600">View profile</Text>
          <ChevronRight size={14} color={c.ink} />
        </View>
      </Pressable>
    )
  }

  return null
}

export default ShareCard

function PostCard({ shared }: { shared: SharedThing }) {
  const s = useStyles()
  const { c } = useTheme()
  const before = useBeforePhotos(shared.beforeAfter && shared.id ? [shared.id] : []).get(shared.id || '')
  const [peek, setPeek] = useState(false)
  const ba = !!before && !!shared.cover
  return (
    <Pressable
      onPress={() => open(shared)}
      onLongPress={ba ? () => setPeek(true) : undefined}
      onPressOut={ba ? () => setPeek(false) : undefined}
      delayLongPress={BA_THUMB_PRESS_MS}
      style={({ pressed }) => [s.card, pressed && !peek && s.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${shared.beforeAfter ? 'Before and after post' : 'Post'}${shared.title ? `: ${shared.title}` : ''}${shared.vendorName ? ` by ${shared.vendorName}` : ''}`}
    >
      {!!shared.vendorName && <Text variant="small" weight="600" numberOfLines={1} style={s.head}>{shared.vendorName}</Text>}
      {ba ? <BeforeAfterThumb before={before} after={shared.cover} peek={peek} style={s.photo} />
        : shared.cover ? <Photo uri={shared.cover} style={s.photo} /> : <View style={[s.photo, s.ph]}><ImageOff size={22} color={c.muted} /></View>}
      {(!!shared.title || !!shared.caption) && (
        <View style={s.body}>
          {!!shared.title && <Text variant="small" weight="600" numberOfLines={1}>{shared.title}</Text>}
          {!!shared.caption && <Text variant="tiny" muted numberOfLines={2}>{shared.caption}</Text>}
        </View>
      )}
    </Pressable>
  )
}

const useStyles = makeStyles((t) => ({
  card: { width: 228, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: t.c.line, backgroundColor: t.c.card },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  gone: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: t.c.soft, width: undefined },
  head: { paddingHorizontal: 10, paddingVertical: 8 },
  photo: { width: '100%', aspectRatio: 4 / 5, backgroundColor: t.c.soft },
  ph: { aspectRatio: 4 / 3, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10, gap: 2 },
  cover: { height: 84, backgroundColor: t.c.accentSoft },
  fill: { width: '100%', height: '100%' },
  // Only the avatar overlaps the cover; the name starts below it (readable on any photo, light or dark).
  vendor: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 12, marginTop: -22 },
  belowCover: { marginTop: 26 },
  vendorText: { flex: 1, minWidth: 0 },
  stats: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  shrink: { flexShrink: 1 },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 9, borderTopWidth: 1, borderTopColor: t.c.line, marginTop: 8 },
}))
