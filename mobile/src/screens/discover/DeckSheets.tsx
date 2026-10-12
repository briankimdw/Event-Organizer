// The swipe deck's sheets (the web SwipeDeck.jsx): card details, "Not into this",
// "Your taste", "Your shortlist", and the "You keep liking X's work" match moment.
// Vertical-aware: vendor cards (no photo) show the vendor's covers or their vertical's icon,
// their attributes and packages with units; the shortlist mixes every kind of vendor.
import { useRouter } from 'expo-router'
import { Bookmark, Briefcase, ChevronRight, Compass, Images, MessageCircle, Sparkles, X } from 'lucide-react-native'
import { Modal, Pressable, ScrollView, View } from 'react-native'

import { listProviders } from '@shared/api/catalog.js'
import { cardWords, getTasteProfile, vendorFacts } from '@shared/api/discover.js'
import { callName, priceLabel } from '@shared/lib/format.js'
import { attributeEntries, attributeLines, verticalConfig, verticalMeta } from '@shared/verticals/index.js'
import {
  AvailabilityStrip, Avatar, Button, Chip, ChipRow, EmptyState, ErrorState, IdVerified, InA11yGroup, Loading, Photo, ProBadge, Sheet, Text,
  VerticalIcon, providerA11yLabel,
} from '@/components'
import { fromPriceText } from '@/components/PriceLabel'
import { useFocusOnShow, IMAGE_BUTTON_ROLE } from '@/lib/a11y'
import useQuery from '@/hooks/useQuery'
import { makeStyles, useTheme } from '@/theme'
import type { Package, Provider } from '@/types'
import type { DeckCard } from './types'

const gallery = (providerId: string, albumId?: string | null, photo?: string) =>
  ({ pathname: '/gallery/[personId]', params: { personId: providerId, ...(albumId ? { post: albumId } : {}), ...(photo ? { photo } : {}) } }) as const

// ---- details -----------------------------------------------------------------

type DetailsProps = { card: DeckCard | null; shot: number; match: number | null; open: boolean; onClose: () => void; onMessage: (providerId: string) => void }

export function DetailsSheet({ card, shot, match, open, onClose, onMessage }: DetailsProps) {
  const s = useStyles()
  const { c } = useTheme()
  const router = useRouter()
  const p = card?.provider
  const vendor = card?.kind === 'vendor'
  const go = (to: Parameters<typeof router.push>[0]) => {
    onClose()
    router.push(to)
  }
  const config = p ? (verticalConfig(p.vertical) as { providerFields: any[]; packageFields: any[]; packageKeys: string[] }) : null
  const about: { key: string; label: string; value: string }[] = p && config ? attributeEntries(config.providerFields.filter((f) => f.key !== 'specialties'), p.attributes) : []
  const meta = p ? (verticalMeta(p.vertical) as { name: string; noun: string; icon: string; tint: string }) : null
  const credit = card ? (card.photos[shot] ?? card.photos[0])?.credit : null
  return (
    <Sheet open={open && !!card} onClose={onClose} title={(vendor ? p?.name : card?.title) || 'Details'}>
      {card && p && meta && config && (
        <>
          {card.photos.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.shots}>
              {card.photos.map((ph, i) => (
                <Pressable
                  key={ph.id}
                  onPress={() => go(vendor ? gallery(p.id) : gallery(p.id, card.albumId, ph.id))}
                  accessibilityRole={IMAGE_BUTTON_ROLE}
                  accessibilityLabel={`${vendor ? 'Post' : 'Photo'} ${i + 1} of ${card.photos.length}, open in the gallery`}
                >
                  <Photo uri={ph.src} style={s.shot} />
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <View style={[s.noWork, { backgroundColor: `${meta.tint}1f` }]}>
              <VerticalIcon name={meta.icon} tint={meta.tint} size={22} bubble bubbleSize={44} />
              <Text variant="small" style={s.grow}>{p.shortName || p.name} hasn’t posted any work yet. Here’s what they offer.</Text>
            </View>
          )}
          {!!credit && <Text variant="tiny" muted style={s.mtXs}>{credit}</Text>}
          {card.photos.length > 0 && (
            <Pressable onPress={() => go(vendor ? gallery(p.id) : gallery(p.id, card.albumId, (card.photos[shot] ?? card.photos[0])?.id))} style={s.inline} accessibilityRole="link">
              <Images size={14} color={c.ink} />
              <Text variant="small" weight="600">{vendor ? 'See all their work' : 'View the full album'}</Text>
            </Pressable>
          )}

          <InA11yGroup value>
          <Pressable onPress={() => go(`/u/${p.id}`)} style={s.person} accessibilityRole="link" accessibilityLabel={providerA11yLabel({ ...p, tasteMatch: match } as Provider)} accessibilityHint="Opens their profile">
            <Avatar uri={p.avatar} name={p.name} size="md" />
            <View style={s.grow}>
              <View style={s.inline0}>
                <Text variant="body" weight="700" numberOfLines={1} style={s.shrink}>{p.name}</Text>
                {p.idVerified && <IdVerified />}
                {p.pro && <ProBadge />}
              </View>
              <Text variant="tiny" muted>
                {p.city}{p.city ? ' · ' : ''}
                {p.rating != null ? `★ ${p.rating.toFixed(1)} (${p.reviewCount} review${p.reviewCount === 1 ? '' : 's'})` : 'New, no reviews yet'}
              </Text>
            </View>
            {match != null && <MatchPct pct={match} />}
          </Pressable>
          </InA11yGroup>

          {!!card.reason && (
            <View style={s.note}>
              <Sparkles size={14} color={c.ink} />
              <Text variant="small" style={s.grow}>{card.reason}</Text>
            </View>
          )}
          {!!card.exif && (
            <View style={s.between}>
              <Text variant="small" muted>Settings</Text>
              <Text variant="tiny" style={s.mono}>{card.exif}</Text>
            </View>
          )}
          {!vendor && (card.tags.length > 0 || !!card.occasion || !!card.category) && (
            <ChipRow style={s.mtSm}>
              {!!card.category && <Chip label={card.category} />}
              {!!card.occasion && <Chip label={card.occasion.name} />}
              {card.tags.map((t: string) => <Chip key={t} label={t} />)}
            </ChipRow>
          )}

          {vendor && !!p.bio && <Text variant="small" style={s.mtSm}>{p.bio}</Text>}
          {vendor && p.categories.length > 0 && (
            <ChipRow style={s.mtSm}>
              {p.categories.map((x: string) => <Chip key={x} label={x} />)}
            </ChipRow>
          )}

          {about.length > 0 && (
            <>
              <Text variant="h4" style={s.section}>About {p.shortName || p.name}</Text>
              {about.map((e) => (
                <View key={e.key} style={s.fact} accessible accessibilityLabel={`${e.label}: ${e.value}`}>
                  <Text variant="small" muted style={s.factLabel}>{e.label}</Text>
                  <Text variant="small" style={s.grow}>{e.value}</Text>
                </View>
              ))}
            </>
          )}

          <Text variant="h4" style={s.section}>Packages</Text>
          {p.packages.length === 0 && <Text variant="small" muted>No packages listed yet. Ask for a quote.</Text>}
          {p.packages.map((pkg: Package) => {
            const facts = [pkg.hours && `${pkg.hours}h`, ...attributeLines(config.packageFields, pkg.attributes, config.packageKeys as any)].filter(Boolean).join(' · ')
            return (
              <Pressable
                key={pkg.id}
                onPress={() => go({ pathname: '/book/[providerId]', params: { providerId: p.id, pkg: pkg.id } })}
                style={s.pkg}
                accessibilityRole="button"
                accessibilityLabel={[`Book ${pkg.name}`, priceLabel(pkg), facts].filter(Boolean).join(', ')}
              >
                <View style={s.grow}>
                  <Text variant="small">{pkg.name}</Text>
                  {!!facts && <Text variant="tiny" muted numberOfLines={2}>{facts}</Text>}
                </View>
                <Text variant="small" weight="700">{priceLabel(pkg)}</Text>
                <ChevronRight size={14} color={c.muted} />
              </Pressable>
            )
          })}

          <Text variant="h4" style={s.section}>Next 2 weeks</Text>
          <AvailabilityStrip providerId={p.id} startToday />

          <View style={s.actions}>
            <Button title="Ask" icon={MessageCircle} variant="ghost" grow onPress={() => onMessage(p.id)} />
            <Button title="Profile" variant="ghost" grow onPress={() => go(`/u/${p.id}`)} />
            <Button title="Book" variant="accent" grow onPress={() => go({ pathname: '/book/[providerId]', params: { providerId: p.id } })} />
          </View>
        </>
      )}
    </Sheet>
  )
}

// ---- "Not into this" ------------------------------------------------------------
// Photo cards: pick auto-tags to see less of. Vendor cards: pick traits (cuisines, genres,
// services...) to see less of, or hide that vendor for good (shared hideVendor()).

type CorrectProps = {
  open: boolean; onClose: () => void; signedIn: boolean; tags: string[]; picked: Set<string>; vendor?: Provider | null
  onToggle: (tag: string) => void; onSubmit: () => void; onSignIn: () => void; onHideVendor?: () => void
}

export function CorrectSheet({ open, onClose, signedIn, tags, picked, vendor, onToggle, onSubmit, onSignIn, onHideVendor }: CorrectProps) {
  const s = useStyles()
  const name = vendor ? (vendor as any).shortName || vendor.name : ''
  return (
    <Sheet open={open} onClose={onClose} title="Not into this">
      {!signedIn ? (
        <>
          <Text variant="small" muted>Sign in to tune your feed. We’ll hide what you’re not into and remember it next time.</Text>
          <Button title="Sign in" block onPress={onSignIn} style={s.mt} />
        </>
      ) : (
        <>
          {tags.length > 0 ? (
            <>
              <Text variant="small" muted>
                {vendor ? 'Pick what isn’t for you and we’ll show you fewer vendors like this. This counts more than a regular pass.' : 'Pick what you’d like to see less of. This counts more than a regular pass.'}
              </Text>
              <ChipRow style={s.mt}>
                {tags.map((t) => <Chip key={t} label={t} toggle on={picked.has(t)} onPress={() => onToggle(t)} />)}
              </ChipRow>
              <Button title="Show me less of this" block disabled={!picked.size} onPress={onSubmit} style={s.mt} />
            </>
          ) : (
            <Text variant="small" muted>{vendor ? 'Nothing to tune on this one yet.' : 'This photo hasn’t been tagged yet. Swipe left to pass on it.'}</Text>
          )}
          {vendor && onHideVendor && (
            <Button title={`Don’t show me ${name} again`} variant="ghost" block onPress={onHideVendor} style={s.mtSm} />
          )}
        </>
      )}
    </Sheet>
  )
}

// ---- "Your taste" -----------------------------------------------------------------

type Weighted = { tag: string; weight: number }
type Taste = {
  swipes: number; likes: number; styles: Weighted[]; traits: Weighted[]
  verticals: { slug: string; name: string; likes: number }[]; vendorSwipes: number; hiddenVendors: { id: string; name: string }[]
}

function Bars({ items }: { items: Weighted[] }) {
  const s = useStyles()
  return (
    <>
      {items.map((st) => (
        <View key={st.tag} style={s.tasteRow} accessible accessibilityLabel={`${st.tag}, ${Math.round(st.weight * 100)}%`}>
          <Text variant="small" style={s.tasteTag} numberOfLines={1}>{st.tag}</Text>
          <View style={s.tasteBar}><View style={[s.tasteFill, { width: `${st.weight * 100}%` }]} /></View>
        </View>
      ))}
    </>
  )
}

export function TasteSheet({ open, onClose, uid, corrections, removeCorrection, unhideVendor, onSignIn }: {
  open: boolean; onClose: () => void; uid: string | null; corrections: string[]; removeCorrection: (t: string) => void
  unhideVendor: (providerId: string) => Promise<unknown>; onSignIn: () => void
}) {
  const s = useStyles()
  const { c } = useTheme()
  const taste = useQuery<Taste>(open && uid ? () => getTasteProfile() : null, [open, uid])
  const t = taste.data
  const unhide = (id: string) => {
    unhideVendor(id).then(() => taste.reload(), (e: unknown) => console.warn(e))
  }
  return (
    <Sheet open={open} onClose={onClose} title="Your taste">
      {!uid ? (
        <>
          <Text variant="small" muted>As you swipe, we learn what you like (styles, kinds of vendors, what they offer) and use it to rank vendors for you. Sign in so your swipes are saved.</Text>
          <Button title="Sign in" block onPress={onSignIn} style={s.mt} />
        </>
      ) : taste.loading && !t ? (
        <Loading />
      ) : taste.error ? (
        <ErrorState error={taste.error} onRetry={taste.reload} />
      ) : t ? (
        <>
          <Text variant="small" muted>
            Learned from {t.swipes} swipe{t.swipes === 1 ? '' : 's'} ({t.likes} like{t.likes === 1 ? '' : 's'}). We use it to rank vendors for you.
          </Text>
          {(t.verticals?.length ?? 0) > 0 && (
            <>
              <Text variant="h4" style={s.section}>What you’ve been liking</Text>
              <ChipRow>
                {t.verticals.map((v) => {
                  const m = verticalMeta(v.slug) as { icon: string; tint: string }
                  return (
                    <View key={v.slug} style={s.likeChip} accessible accessibilityLabel={`${v.name}, ${v.likes} like${v.likes === 1 ? '' : 's'}`}>
                      <VerticalIcon name={m.icon} tint={m.tint} size={13} />
                      <Text variant="tiny" weight="600">{v.name} · {v.likes}</Text>
                    </View>
                  )
                })}
              </ChipRow>
            </>
          )}
          <Text variant="h4" style={s.section}>Styles</Text>
          {t.styles.length === 0 && <Text variant="small" muted>Like a few photos and the styles you like will show up here.</Text>}
          <Bars items={t.styles} />
          {(t.traits?.length ?? 0) > 0 && (
            <>
              <Text variant="h4" style={s.section}>In vendors</Text>
              <Bars items={t.traits} />
            </>
          )}
          <Text variant="h4" style={s.section}>Showing you less</Text>
          {corrections.length === 0 && !t.hiddenVendors?.length && <Text variant="small" muted>Nothing yet. Tap the thumbs-down on a card to see less of something.</Text>}
          <ChipRow>
            {corrections.map((tag) => <Chip key={tag} label={tag} iconRight={X} onPress={() => removeCorrection(tag)} accessibilityLabel={`${tag}, hidden`} accessibilityHint="Double-tap to show it again" />)}
            {(t.hiddenVendors || []).map((v) => <Chip key={v.id} label={v.name} iconRight={X} onPress={() => unhide(v.id)} accessibilityLabel={`${v.name}, hidden`} accessibilityHint="Double-tap to show them again" />)}
          </ChipRow>
          <View style={[s.note, s.mt]}>
            <Compass size={14} color={c.ink} />
            <Text variant="small" style={s.grow}>About 1 in 7 cards is something outside your usual taste, so you can find new styles and vendors.</Text>
          </View>
        </>
      ) : null}
    </Sheet>
  )
}

// ---- shortlist ----------------------------------------------------------------------

type ShortlistProps = {
  open: boolean; onClose: () => void; uid: string | null; shortlist: Set<string>
  likedCardsFrom: (providerId: string) => DeckCard[]; matchOf: (id: string) => number | null
  onMessage: (id: string) => void; onRemove: (id: string) => void; onSignIn: () => void
}

export function ShortlistSheet({ open, onClose, uid, shortlist, likedCardsFrom, matchOf, onMessage, onRemove, onSignIn }: ShortlistProps) {
  const s = useStyles()
  const { c } = useTheme()
  const router = useRouter()
  const providers = useQuery<Provider[]>(open && uid ? () => listProviders() : null, [open, uid])
  const go = (to: Parameters<typeof router.push>[0]) => {
    onClose()
    router.push(to)
  }
  const byId = new Map((providers.data || []).map((x) => [x.id, x]))
  const list = [...shortlist].map((id) => byId.get(id)).filter(Boolean) as Provider[]
  return (
    <Sheet open={open} onClose={onClose} title="Your shortlist">
      {!uid ? (
        <EmptyState icon={Bookmark} title="Keep a shortlist" text="Sign in to save pros you like. Swipe up or tap the bookmark to add them."
          action={<Button title="Sign in" onPress={onSignIn} />} />
      ) : providers.loading && !providers.data ? (
        <Loading />
      ) : providers.error ? (
        <ErrorState error={providers.error} onRetry={providers.reload} />
      ) : !list.length ? (
        <EmptyState icon={Bookmark} title="No one shortlisted yet" text="Swipe up or tap the bookmark to shortlist pros whose work you like." />
      ) : (
        list.map((sp) => {
          const liked = likedCardsFrom(sp.id)
          const likedPhotos = liked.filter((cd) => cd.kind === 'photo')
          const shots = likedPhotos.length
            ? likedPhotos.map((cd) => ({ key: cd.id, src: cd.photos[0]?.src, to: gallery(sp.id, cd.albumId) }))
            : sp.covers.slice(0, 4).map((src: string) => ({ key: src, src, to: gallery(sp.id) }))
          const m = matchOf(sp.id)
          const from = fromPriceText(sp)
          const vm = verticalMeta(sp.vertical) as { noun: string; icon: string; tint: string }
          return (
            <View key={sp.id} style={s.shortItem}>
              <InA11yGroup value>
              <Pressable
                onPress={() => go(`/u/${sp.id}`)}
                style={s.person0}
                accessibilityRole="link"
                accessibilityLabel={providerA11yLabel({ ...sp, tasteMatch: m } as Provider, [likedPhotos.length > 0 && `you liked ${likedPhotos.length} shot${likedPhotos.length > 1 ? 's' : ''}`])}
                accessibilityHint="Opens their profile"
              >
                <Avatar uri={sp.avatar} name={sp.name} size="md" />
                <View style={s.grow}>
                  <View style={s.inline0}>
                    <Text variant="body" weight="700" numberOfLines={1} style={s.shrink}>{sp.name}</Text>
                    {sp.pro && <ProBadge />}
                  </View>
                  <Text variant="tiny" muted numberOfLines={2}>
                    {[
                      cap(vm.noun),
                      likedPhotos.length > 0 && `You liked ${likedPhotos.length} shot${likedPhotos.length > 1 ? 's' : ''}`,
                      sp.rating != null ? `★ ${sp.rating.toFixed(1)}` : 'New',
                      from,
                    ].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                {m != null && <MatchPct pct={m} />}
              </Pressable>
              </InA11yGroup>
              {shots.length === 0 && (
                <View style={[s.noWork, s.noWorkSmall, { backgroundColor: `${vm.tint}1f` }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                  <VerticalIcon name={vm.icon} tint={vm.tint} size={16} />
                  <Text variant="tiny" muted style={s.grow} numberOfLines={2}>{((vendorFacts(sp) as { lines: string[] }).lines || []).join(' · ') || 'No posts yet'}</Text>
                </View>
              )}
              {shots.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.shortShots}>
                  {shots.map((sh: { key: string; src?: string; to: any }, i: number) => (
                    <Pressable key={sh.key} onPress={() => go(sh.to)} accessibilityRole={IMAGE_BUTTON_ROLE} accessibilityLabel={`${sp.name}, photo ${i + 1} of ${shots.length}, open in the gallery`}>
                      <Photo uri={sh.src} style={s.shortShot} />
                    </Pressable>
                  ))}
                </ScrollView>
              )}
              <View style={[s.row, s.wrapRow]}>
                <Button title="Profile" size="sm" variant="ghost" grow style={s.fitBtn} onPress={() => go(`/u/${sp.id}`)} />
                <Button title="Message" size="sm" variant="ghost" grow style={s.fitBtn} onPress={() => onMessage(sp.id)} />
                <Button title="Book" size="sm" grow style={s.fitBtn} onPress={() => go({ pathname: '/book/[providerId]', params: { providerId: sp.id } })} />
                <Pressable onPress={() => onRemove(sp.id)} style={s.remove} hitSlop={5} accessibilityRole="button" accessibilityLabel={`Remove ${sp.name} from shortlist`}>
                  <X size={14} color={c.ink} />
                </Pressable>
              </View>
            </View>
          )
        })
      )}
    </Sheet>
  )
}

// ---- match moment ----------------------------------------------------------------------

type MatchProps = {
  provider: Provider | null | undefined; cards: DeckCard[]; tasteMatch: number | null; signedIn: boolean; shortlisted: boolean
  onShortlist: () => void; onClose: () => void; onMessage: () => void; onSignIn: () => void
}

export function MatchOverlay({ provider, cards, tasteMatch, signedIn, shortlisted, onShortlist, onClose, onMessage, onSignIn }: MatchProps) {
  const s = useStyles()
  const router = useRouter()
  const titleRef = useFocusOnShow(!!provider, 450)
  if (!provider) return null
  const first = (provider as any).shortName || callName(provider.name)
  const from = fromPriceText(provider)
  const go = (to: Parameters<typeof router.push>[0]) => {
    onClose()
    router.push(to)
  }
  // Photo likes: "You keep liking X's work". A liked vendor card: "X could be your DJ".
  const v = verticalMeta(provider.vertical) as { noun: string; icon: string; tint: string }
  const shots = cards.filter((cd) => cd.photos[0]?.src).slice(0, 2)
  const posts = cards.some((cd) => cd.kind !== 'vendor')
  const facts = posts ? provider.specialties.join(', ') : ((vendorFacts(provider) as { lines: string[] }).lines || []).slice(0, 2).join(' · ')
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {/* The dimmed backdrop closes it on tap; screen readers use "Keep swiping" or the escape gesture. */}
      <Pressable style={s.overlay} onPress={onClose} accessible={false} importantForAccessibility="no">
        <Pressable style={s.matchCard} onPress={() => {}} accessible={false} accessibilityViewIsModal onAccessibilityEscape={onClose}>
          <View style={s.matchShots}>
            {shots.length > 0 ? shots.map((cd, i) => (
              <Pressable key={cd.id} onPress={() => go(gallery(provider.id, cd.albumId))} style={[s.matchShot, i ? s.matchRight : s.matchLeft]} accessibilityRole={IMAGE_BUTTON_ROLE} accessibilityLabel={`${first}’s ${(cardWords(cd) as { thing: string }).thing}, open in the gallery`}>
                <Photo uri={cd.photos[0]?.src} style={s.matchImg} />
              </Pressable>
            )) : (
              <View style={[s.matchArt, { backgroundColor: `${v.tint}1f` }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                <VerticalIcon name={v.icon} tint={v.tint} size={60} />
              </View>
            )}
            <Pressable onPress={() => go(`/u/${provider.id}`)} style={s.matchAvatar} accessibilityRole="link" accessibilityLabel={provider.name}>
              <Avatar uri={provider.avatar} name={provider.name} size={64} ring />
            </Pressable>
          </View>
          <Text ref={titleRef as any} variant="h2" center>{posts ? `You keep liking ${first}’s work` : `${first} could be your ${v.noun}`}</Text>
          <Text variant="small" muted center style={s.mtXs}>
            {[tasteMatch != null && `${tasteMatch}% taste match`, facts, from].filter(Boolean).join(' · ')}
          </Text>
          <Button title="See packages & book" icon={Briefcase} variant="accent" block onPress={() => go({ pathname: '/book/[providerId]', params: { providerId: provider.id } })} style={s.mt} />
          {signedIn ? (
            <>
              {!shortlisted && <Button title={`Add ${first} to your shortlist`} icon={Bookmark} variant="ghost" block onPress={onShortlist} style={s.mtSm} />}
              <Button title={`Ask ${first} a question`} icon={MessageCircle} variant="ghost" block onPress={onMessage} style={s.mtSm} />
            </>
          ) : (
            <View style={[s.note, s.mtSm]}>
              <Text variant="small" style={s.grow}>
                Your swipes aren’t saved while you’re signed out.{' '}
                <Text variant="small" weight="700" style={s.underline} onPress={onSignIn} accessibilityRole="link">Sign in</Text> to shortlist {first} and get matched to pros like this.
              </Text>
            </View>
          )}
          <Button title="Keep swiping" variant="link" size="sm" onPress={onClose} style={s.center} />
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const cap = (w: string) => (w ? w[0].toUpperCase() + w.slice(1) : w)

export function MatchPct({ pct, light }: { pct: number; light?: boolean }) {
  return (
    <View style={{ alignItems: 'center' }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden /* inside cards whose label says it */>
      <Text weight="800" color={light ? '#fff' : 'accent'}>{pct}%</Text>
      <Text variant="caption" muted={!light} style={light ? { color: 'rgba(255,255,255,0.8)' } : undefined}>match</Text>
    </View>
  )
}

const useStyles = makeStyles((t) => ({
  grow: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  mt: { marginTop: t.space.md },
  mtSm: { marginTop: t.space.sm },
  mtXs: { marginTop: t.space.xs },
  center: { alignSelf: 'center', marginTop: t.space.sm },
  section: { marginTop: 20, marginBottom: 8 },
  shots: { gap: 6 },
  shot: { width: 92, height: 116, borderRadius: t.radius.md },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, alignSelf: 'flex-start' },
  inline0: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  person0: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: t.c.soft, borderRadius: t.radius.md, padding: 10, marginTop: 10 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, gap: 10 },
  mono: { fontFamily: 'monospace', color: t.c.ink },
  pkg: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: t.c.line },
  fact: { flexDirection: 'row', gap: 10, paddingVertical: 5 },
  factLabel: { width: 120 },
  noWork: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: t.radius.lg },
  noWorkSmall: { padding: 10, gap: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 18 },
  row: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  // Large text: the shortlist actions wrap to a second line rather than breaking "Message" mid-word.
  wrapRow: { flexWrap: 'wrap' },
  fitBtn: { flexBasis: 'auto' },
  likeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: t.c.soft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  tasteRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  tasteTag: { width: 110 },
  tasteBar: { flex: 1, height: 8, borderRadius: 999, backgroundColor: t.c.soft, overflow: 'hidden' },
  tasteFill: { height: '100%', borderRadius: 999, backgroundColor: t.c.accent },
  shortItem: { gap: 10, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: t.c.line },
  shortShots: { gap: 6 },
  shortShot: { width: 76, height: 96, borderRadius: t.radius.sm },
  remove: { width: 36, height: 36, borderRadius: t.radius.sm, backgroundColor: t.c.soft, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(17,17,17,0.82)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  matchCard: { width: '100%', maxWidth: 380, backgroundColor: t.c.bg, borderRadius: 24, padding: 20, paddingTop: 16 },
  matchShots: { height: 180, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  matchShot: { position: 'absolute', top: 6, width: 112, height: 150, borderRadius: 14, overflow: 'hidden', borderWidth: 3, borderColor: t.c.bg },
  matchLeft: { left: '50%', marginLeft: -122, transform: [{ rotate: '-7deg' }] },
  matchRight: { left: '50%', marginLeft: 10, transform: [{ rotate: '7deg' }] },
  matchArt: { position: 'absolute', top: 6, width: 200, height: 150, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  matchImg: { width: '100%', height: '100%' },
  matchAvatar: { position: 'absolute', bottom: -4 },
  underline: { textDecorationLine: 'underline' },
}))
