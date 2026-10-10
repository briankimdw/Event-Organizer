// A vendor (provider) in a list, from the shared catalog's toProvider() shape.
// Three layouts, matching the web:
//   variant="row"    64px photo + text (Home "Available this weekend", lists)   .provider-row
//   variant="tile"   220px card with a big cover (horizontal shelves)            .match-tile
//   variant="result" 3-photo strip + avatar + details (Search results)           .result-card
// Tapping opens /u/[id] unless onPress is given. `footer` renders under a result card.
import { useRouter } from 'expo-router'
import type { ReactNode } from 'react'
import { Pressable, View } from 'react-native'

import { makeStyles } from '@/theme'
import type { Provider } from '@/types'
import { Avatar } from './Avatar'
import { IdVerified, ProBadge, RatingInline } from './Badges'
import { Photo } from './Photo'
import { PriceLabel, fromPriceText } from './PriceLabel'
import { Text } from './Text'

type Props = {
  provider: Provider
  variant?: 'row' | 'tile' | 'result'
  onPress?: () => void
  footer?: ReactNode
  meta?: string // extra muted text after the rating (e.g. "· 8 km")
}

export function ProviderCard({ provider: p, variant = 'row', onPress, footer, meta }: Props) {
  const s = useStyles()
  const router = useRouter()
  const open = onPress ?? (() => router.push(`/u/${p.id}`))
  const from = fromPriceText(p) // "from $65 / person" or null

  const name = (
    <View style={s.nameRow}>
      <Text variant={variant === 'result' ? 'body' : 'small'} weight="600" numberOfLines={1} style={s.shrink}>{p.name}</Text>
      {p.idVerified && <IdVerified />}
      {p.pro && <ProBadge />}
    </View>
  )

  if (variant === 'tile') {
    return (
      <Pressable onPress={open} style={({ pressed }) => [s.tile, pressed && s.pressed]} accessibilityRole="button" accessibilityLabel={p.name}>
        <View>
          <Photo uri={p.cover} style={s.tileImg} />
          {p.tasteMatch != null && <MatchBadge pct={p.tasteMatch} />}
        </View>
        <View style={s.tileBody}>
          {name}
          <Text variant="tiny" muted numberOfLines={1}>{p.specialties.slice(0, 2).join(' · ')}</Text>
          <View style={s.metaRow}>
            <RatingInline rating={p.rating} />
            {!!from && <Text variant="tiny" muted numberOfLines={1}>· {from}</Text>}
          </View>
        </View>
      </Pressable>
    )
  }

  if (variant === 'result') {
    const thumbs = p.covers.slice(0, 3)
    return (
      <View style={s.result}>
        <Pressable onPress={open} style={({ pressed }) => pressed && s.pressed} accessibilityRole="button" accessibilityLabel={p.name}>
          <View style={s.strip}>
            <Photo uri={thumbs[0]} style={s.stripBig} />
            <Photo uri={thumbs[1]} style={s.stripSmall} />
            <Photo uri={thumbs[2]} style={s.stripSmall} />
            {p.tasteMatch != null && <MatchBadge pct={p.tasteMatch} />}
          </View>
          <View style={s.resultInfo}>
            <Avatar uri={p.avatar} name={p.name} size={40} />
            <View style={s.grow}>
              <View style={s.between}>
                <View style={[s.grow, s.shrink]}>{name}</View>
                <PriceLabel provider={p} />
              </View>
              <Text variant="small" muted numberOfLines={1}>{p.specialties.join(' · ')}</Text>
              <View style={s.metaRow}>
                <RatingInline rating={p.rating} count={p.rating != null ? p.reviewCount : undefined} />
                {!!p.city && <Text variant="tiny" muted numberOfLines={1}>· {p.city}</Text>}
                {!!meta && <Text variant="tiny" muted>{meta}</Text>}
              </View>
            </View>
          </View>
        </Pressable>
        {footer}
      </View>
    )
  }

  return (
    <Pressable onPress={open} style={({ pressed }) => [s.row, pressed && s.pressed]} accessibilityRole="button" accessibilityLabel={p.name}>
      <Photo uri={p.covers[1] || p.cover} style={s.rowImg} />
      <View style={s.grow}>
        {name}
        <Text variant="tiny" muted numberOfLines={1}>{p.specialties.join(' · ')}</Text>
        <View style={s.metaRow}>
          <RatingInline rating={p.rating} count={p.rating != null ? p.reviewCount : undefined} />
          {!!from && <Text variant="tiny" muted numberOfLines={1}>· {from}</Text>}
          {!!meta && <Text variant="tiny" muted>{meta}</Text>}
        </View>
      </View>
      {p.tasteMatch != null && (
        <View style={s.match}>
          <Text variant="small" weight="700" color="accent">{p.tasteMatch}%</Text>
          <Text variant="caption" muted>match</Text>
        </View>
      )}
    </Pressable>
  )
}

export function MatchBadge({ pct }: { pct: number }) {
  const s = useStyles()
  return (
    <View style={s.badge}>
      <Text style={s.badgeText}>{pct}% match</Text>
    </View>
  )
}

const useStyles = makeStyles((t) => ({
  pressed: { opacity: 0.8 },
  grow: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'nowrap' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, flexWrap: 'wrap' },
  // row
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.c.line },
  rowImg: { width: 64, height: 64, borderRadius: t.radius.md },
  match: { alignItems: 'center' },
  // tile
  tile: { width: 220, borderWidth: 1, borderColor: t.c.line, borderRadius: t.radius.xl, overflow: 'hidden', backgroundColor: t.c.card },
  tileImg: { width: '100%', height: 140 },
  tileBody: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12, gap: 2 },
  // result
  result: { borderWidth: 1, borderColor: t.c.line, borderRadius: t.radius.xl, overflow: 'hidden', marginTop: 12, backgroundColor: t.c.card },
  strip: { flexDirection: 'row', height: 136, gap: 2 },
  stripBig: { flex: 2, height: '100%' },
  stripSmall: { flex: 1, height: '100%' },
  resultInfo: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12 },
  // badge
  badge: { position: 'absolute', left: 8, top: 8, backgroundColor: t.c.accent, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
}))
