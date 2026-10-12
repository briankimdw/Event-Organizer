// The face of a vendor card in the swipe deck: for verticals with no posts yet (and the
// non-visual ones: DJs, planners, officiants, staff...) you swipe on the vendor itself.
// Top: their newest post covers (tap the edges to flip), or the vertical's tinted icon.
// Bottom: name + badges, what they are and where, rating, "from $X / unit", the vertical's
// key attributes (verticals/index.js attributeLines with the config's cardKeys) and a
// preview of their packages. Everything here is decorative for screen readers: the card
// (SwipeCard) speaks one label for all of it.
import { LinearGradient } from 'expo-linear-gradient'
import { CalendarCheck, Compass, Sparkles, Star, ThumbsDown } from 'lucide-react-native'
import { StyleSheet, View } from 'react-native'

import { freeDays } from '@shared/api/catalog.js'
import { addDays, toKey, today } from '@shared/lib/dates.js'
import { priceLabel } from '@shared/lib/format.js'
import { verticalMeta } from '@shared/verticals/index.js'
import { Avatar, IdVerified, Photo, ProBadge, Text, VerticalIcon } from '@/components'
import { fromPriceText } from '@/components/PriceLabel'
import useQuery from '@/hooks/useQuery'
import { makeStyles, useReadableTint, useTheme } from '@/theme'
import type { Package } from '@/types'
import { packagePreview } from './cards'
import type { VendorDeckCard } from './types'

const CAP = 1.4 // Dynamic Type cap inside the fixed-size card

/** When a vendor is next free in the coming 2 weeks: "Free today", "Free Sat, Oct 17",
 *  "Booked up for 2 weeks"; null while loading or when not `active` (only the top card asks). */
export function useNextFree(providerId: string, active = true) {
  const days = Array.from({ length: 14 }, (_, i) => addDays(today(), i))
  const free = useQuery<Set<string>>(active && providerId ? () => freeDays(providerId, days) : null, [providerId, active])
  if (!free.data) return null
  const first = days.find((d) => free.data!.has(toKey(d)))
  if (!first) return 'Booked up for 2 weeks'
  if (toKey(first) === toKey(today())) return 'Free today'
  return `Free ${first.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`
}

export function VendorFace({ card, shot, match, compact, nextFree }: { card: VendorDeckCard; shot: number; match: number | null; compact?: boolean; nextFree?: string | null }) {
  const s = useStyles()
  const { c } = useTheme()
  const readable = useReadableTint()
  const p = card.provider
  const meta = verticalMeta(p.vertical) as { name: string; noun: string; icon: string; tint: string }
  const tintInk = readable(meta.tint, 5) // 5:1 on the page, so 4.5:1+ on the card surface (dark card is a shade lighter)
  const cover = card.photos[shot] ?? card.photos[0]
  const attrs = card.lines || []
  const { packages, more: morePackages } = packagePreview(p)
  const from = fromPriceText(p)
  const where = (p.city || '').split(',')[0]

  return (
    <View style={s.root} pointerEvents="none">
      <View style={[s.cover, compact && s.coverCompact]}>
        {cover ? (
          <Photo uri={cover.src} style={StyleSheet.absoluteFill} />
        ) : (
          <LinearGradient colors={[`${meta.tint}40`, `${meta.tint}14`]} style={[StyleSheet.absoluteFill, s.fallback]}>
            <VerticalIcon name={meta.icon} tint={meta.tint} size={44} bubble bubbleSize={96} />
            <Text maxFontSizeMultiplier={CAP} variant="small" weight="700" style={{ color: c.ink }}>{meta.name}</Text>
          </LinearGradient>
        )}
        {card.photos.length > 1 && (
          <View style={s.bars}>
            {card.photos.map((ph, i) => <View key={ph.id} style={[s.bar, i === shot && s.barOn]} />)}
          </View>
        )}
        <View style={s.top}>
          {card.reason ? (
            <View style={[s.why, card.exploration && s.whyExplore]}>
              {card.exploration ? <Compass size={13} color="#e0e7ff" /> : <Sparkles size={13} color="#111" />}
              <Text maxFontSizeMultiplier={CAP} variant="tiny" weight="600" numberOfLines={1} style={[s.whyText, card.exploration && { color: '#e0e7ff' }]}>{card.reason}</Text>
            </View>
          ) : <View />}
          <View style={s.iconBtn}><ThumbsDown size={16} color="#fff" /></View>
        </View>
        {match != null && (
          <View style={s.match}>
            <Text maxFontSizeMultiplier={CAP} style={s.matchText}>{match}% match</Text>
          </View>
        )}
      </View>

      <View style={s.body}>
        <View style={s.head}>
          <Avatar uri={p.avatar} name={p.name} size={44} />
          <View style={s.grow}>
            <View style={s.row}>
              <Text maxFontSizeMultiplier={CAP} variant="h3" numberOfLines={1} style={s.shrink}>{p.name}</Text>
              {p.idVerified && <IdVerified />}
              {p.pro && <ProBadge />}
            </View>
            <View style={s.row}>
              <VerticalIcon name={meta.icon} size={12} color={tintInk} />
              <Text maxFontSizeMultiplier={CAP} variant="tiny" weight="600" numberOfLines={1} style={[s.shrink, { color: tintInk }]}>
                {cap(meta.noun)}{where ? <Text maxFontSizeMultiplier={CAP} variant="tiny" muted> · {where}</Text> : null}
              </Text>
            </View>
          </View>
        </View>

        <View style={s.statRow}>
          {p.rating != null ? (
            <View style={s.row}>
              <Star size={13} color={c.star} fill={c.star} />
              <Text maxFontSizeMultiplier={CAP} variant="small" weight="700">{p.rating.toFixed(1)}</Text>
              <Text maxFontSizeMultiplier={CAP} variant="tiny" muted>({p.reviewCount})</Text>
            </View>
          ) : (
            <View style={s.newTag}><Text maxFontSizeMultiplier={CAP} variant="tiny" weight="700">New</Text></View>
          )}
          {!!from && <Text maxFontSizeMultiplier={CAP} variant="small" weight="700" numberOfLines={1} style={s.shrink}>{from}</Text>}
        </View>

        {attrs.length > 0 && (
          <View style={s.attrs}>
            {attrs.map((a: string) => (
              <View key={a} style={s.attr}><Text maxFontSizeMultiplier={CAP} variant="tiny" weight="600" numberOfLines={1}>{a}</Text></View>
            ))}
          </View>
        )}

        {!compact && packages.length > 0 && (
          <View style={s.pkgs}>
            {packages.map((pkg: Package) => (
              <View key={pkg.id} style={s.pkg}>
                <Text maxFontSizeMultiplier={CAP} variant="tiny" numberOfLines={1} style={s.grow}>{pkg.name}</Text>
                <Text maxFontSizeMultiplier={CAP} variant="tiny" weight="700">{priceLabel(pkg)}</Text>
              </View>
            ))}
            {morePackages > 0 && <Text maxFontSizeMultiplier={CAP} variant="tiny" muted>+{morePackages} more package{morePackages === 1 ? '' : 's'}</Text>}
          </View>
        )}
        {!compact && packages.length === 0 && <Text maxFontSizeMultiplier={CAP} variant="tiny" muted>No packages listed yet. Ask for a quote.</Text>}
        {!!nextFree && (
          <View style={s.row}>
            <CalendarCheck size={13} color={c.ok} />
            <Text maxFontSizeMultiplier={CAP} variant="tiny" weight="600" style={{ color: c.ok }}>{nextFree}</Text>
          </View>
        )}
      </View>
    </View>
  )
}

const cap = (w: string) => (w ? w[0].toUpperCase() + w.slice(1) : w)

const useStyles = makeStyles((t) => ({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.c.card },
  cover: { height: '46%', overflow: 'hidden', backgroundColor: t.c.soft },
  coverCompact: { height: '38%' },
  fallback: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  bars: { position: 'absolute', top: 8, left: 10, right: 10, flexDirection: 'row', gap: 4 },
  bar: { flex: 1, height: 3, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.45)' },
  barOn: { backgroundColor: '#fff' },
  top: { position: 'absolute', top: 18, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  why: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.94)', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, flexShrink: 1 },
  whyExplore: { backgroundColor: '#1e1b4b' },
  whyText: { color: '#111', flexShrink: 1 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  match: { position: 'absolute', left: 12, bottom: 12, backgroundColor: t.c.accent, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  matchText: { color: t.c.onAccent, fontSize: 12, fontWeight: '800' },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16, gap: 10, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  newTag: { backgroundColor: t.c.soft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  attrs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, maxHeight: 64, overflow: 'hidden' },
  attr: { backgroundColor: t.c.soft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, maxWidth: '100%' },
  pkgs: { gap: 2, borderTopWidth: 1, borderTopColor: t.c.line, paddingTop: 8 },
  pkg: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
}))
