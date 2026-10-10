// A card for something shared in chat (message.shared from @shared/api/messages.js):
// a post, a vendor or an event; tapping opens it. Native twin of the web's
// components/share/ShareCard.jsx.
import { router, type Href } from 'expo-router'
import { CalendarDays, ChevronRight, ImageOff, MapPin, Star } from 'lucide-react-native'
import { Pressable, View } from 'react-native'

import { shareLink } from '@shared/api/messages.js'
import { Avatar, Photo, Text } from '@/components'
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
  date?: string | null
  startsAt?: string | null
  location?: string | null
}

const open = (s: SharedThing) => {
  if (!s.id) return
  if (s.kind === 'post' && s.providerId) router.push({ pathname: '/gallery/[personId]', params: { personId: s.providerId, post: s.id } })
  else if (s.kind === 'provider') router.push({ pathname: '/u/[id]', params: { id: s.id } })
  else router.push(shareLink(s as any) as Href)
}

export function ShareCard({ shared }: { shared: SharedThing | null | undefined }) {
  const s = useStyles()
  const { c } = useTheme()
  if (!shared) return null

  if (!shared.available && shared.kind !== 'event') {
    return (
      <View style={[s.card, s.gone]}>
        <ImageOff size={16} color={c.muted} />
        <Text variant="small" muted>{shared.kind === 'post' ? 'This post is no longer available' : 'This vendor is no longer available'}</Text>
      </View>
    )
  }

  if (shared.kind === 'post') {
    return (
      <Pressable onPress={() => open(shared)} style={({ pressed }) => [s.card, pressed && s.pressed]} accessibilityRole="button" accessibilityLabel={`Post${shared.title ? `: ${shared.title}` : ''}${shared.vendorName ? ` by ${shared.vendorName}` : ''}`}>
        {!!shared.vendorName && <Text variant="small" weight="600" numberOfLines={1} style={s.head}>{shared.vendorName}</Text>}
        {shared.cover ? <Photo uri={shared.cover} style={s.photo} /> : <View style={[s.photo, s.ph]}><ImageOff size={22} color={c.muted} /></View>}
        {(!!shared.title || !!shared.caption) && (
          <View style={s.body}>
            {!!shared.title && <Text variant="small" weight="600" numberOfLines={1}>{shared.title}</Text>}
            {!!shared.caption && <Text variant="tiny" muted numberOfLines={2}>{shared.caption}</Text>}
          </View>
        )}
      </Pressable>
    )
  }

  if (shared.kind === 'provider') {
    const meta = [shared.noun && shared.noun.replace(/^\w/, (x) => x.toUpperCase()), shared.city?.split(',')[0]].filter(Boolean).join(' · ')
    return (
      <Pressable onPress={() => open(shared)} style={({ pressed }) => [s.card, pressed && s.pressed]} accessibilityRole="button" accessibilityLabel={`Vendor: ${shared.name}`}>
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

  const d = shared.startsAt ? new Date(shared.startsAt) : null
  const inner = (
    <>
      {!!shared.cover && <Photo uri={shared.cover} style={s.eventCover} />}
      <View style={s.eventTop}>
        <View style={s.cal}>
          {d ? (
            <>
              <Text variant="caption" color="accent" style={s.calMonth}>{d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</Text>
              <Text weight="700" style={s.calDay}>{d.getDate()}</Text>
            </>
          ) : (
            <CalendarDays size={20} color={c.accent} />
          )}
        </View>
        <View style={s.vendorText}>
          <Text variant="caption" color="accent" style={s.kicker}>EVENT</Text>
          <Text weight="700" numberOfLines={2} style={s.eventTitle}>{shared.title}</Text>
        </View>
      </View>
      <View style={s.lines}>
        <View style={s.inline}>
          <CalendarDays size={12} color={c.muted} />
          <Text variant="tiny" muted>{shared.date || 'Date to be decided'}</Text>
        </View>
        {!!shared.location && (
          <View style={s.inline}>
            <MapPin size={12} color={c.muted} />
            <Text variant="tiny" muted numberOfLines={1} style={s.shrink}>{shared.location}</Text>
          </View>
        )}
      </View>
      <View style={s.cta}>
        <Text variant="tiny" weight="600" muted={!shared.available}>{shared.available ? 'View event' : 'This event was deleted'}</Text>
        {shared.available && <ChevronRight size={14} color={c.ink} />}
      </View>
    </>
  )
  return shared.available ? (
    <Pressable onPress={() => open(shared)} style={({ pressed }) => [s.card, s.event, pressed && s.pressed]} accessibilityRole="button" accessibilityLabel={`Event: ${shared.title}`}>
      {inner}
    </Pressable>
  ) : (
    <View style={[s.card, s.event]}>{inner}</View>
  )
}

export default ShareCard

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
  event: { backgroundColor: t.c.accentSoft },
  eventCover: { width: '100%', height: 110 },
  eventTop: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4 },
  cal: { width: 46, height: 50, borderRadius: 10, backgroundColor: t.c.bg, borderWidth: 1, borderColor: t.c.line, alignItems: 'center', justifyContent: 'center' },
  calMonth: { letterSpacing: 0.5 },
  calDay: { fontSize: 20, lineHeight: 22 },
  kicker: { letterSpacing: 0.6 },
  eventTitle: { fontSize: 15, lineHeight: 19 },
  lines: { gap: 3, paddingHorizontal: 12, paddingTop: 4 },
}))
