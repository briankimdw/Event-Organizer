// Home's browse cards, mirroring the web's components/home/Browse.jsx and Home.jsx:
//   useInvite()      "Know a great caterer? Invite them": the native share sheet (RN Share)
//   ComingSoonCard   verticals with no providers yet, as one calm card (marketplace cold start)
//   ExploreTeaser    three real portfolio shots -> Discover's Explore grid
import { useRouter } from 'expo-router'
import { LayoutGrid, Send, Store } from 'lucide-react-native'
import { Pressable, Share, View } from 'react-native'

import { inviteMessage, pluralLower } from '@shared/api/home.js'
import { Button, Photo, Text, VerticalIcon } from '@/components'
import { useStore } from '@/state/store'
import { makeStyles } from '@/theme'
import type { Vertical } from '@/types'

// TODO(port): append the public web / store link once there is one (the web shares location.origin).

export function useInvite() {
  const { toast } = useStore()
  return async (vertical: Vertical | null = null) => {
    const { title, text } = inviteMessage(vertical)
    try {
      await Share.share({ title, message: text }, { dialogTitle: title, subject: title })
    } catch {
      toast('Couldn’t open the share sheet. Try again.')
    }
  }
}

export function ComingSoonCard({ soon }: { soon: Vertical[] }) {
  const s = useStyles()
  const router = useRouter()
  const invite = useInvite()
  if (!soon.length) return null
  const names = soon.slice(0, 3).map((v, i) => (i ? pluralLower(v) : v.plural))
  const more = soon.length - names.length
  const first = soon[0]
  return (
    <View style={s.soon}>
      <View style={s.icons} accessibilityElementsHidden>
        {soon.slice(0, 6).map((v) => (
          <View key={v.slug} style={s.iconRing}>
            <VerticalIcon name={v.icon} tint={v.tint} size={15} bubble bubbleSize={34} />
          </View>
        ))}
      </View>
      <Text variant="h4" style={s.mtSm}>Coming soon near you</Text>
      <Text variant="small" muted style={s.body}>
        {names.join(', ')}{more > 0 ? ` and ${more} more` : ''} are joining. Know a great {first.noun}? Invite them, and you’ll be able to book them here.
      </Text>
      <View style={s.row}>
        <Button title="Invite a vendor" icon={Send} size="sm" grow onPress={() => invite(first)} />
        <Button title="List your services" icon={Store} size="sm" variant="ghost" grow onPress={() => router.push('/new-listing')} />
      </View>
    </View>
  )
}

export function ExploreTeaser({ photos }: { photos: { id: string; src: string }[] }) {
  const s = useStyles()
  const router = useRouter()
  if (photos.length < 3) return null
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/discover', params: { mode: 'explore' } })}
      style={({ pressed }) => [s.teaser, pressed && s.pressed]}
      accessibilityRole="link"
      accessibilityLabel="Not sure what you want? Browse real work from local pros"
    >
      <View style={s.stack}>
        <Photo uri={photos[0].src} style={[s.stackImg, s.left]} />
        <Photo uri={photos[2].src} style={[s.stackImg, s.right]} />
        <Photo uri={photos[1].src} style={[s.stackImg, s.mid]} />
      </View>
      <View style={s.grow}>
        <Text variant="body" weight="700" style={s.white}>Not sure what you want?</Text>
        <Text variant="small" style={s.light}>Browse real work from local pros, then tap what you love.</Text>
      </View>
      <LayoutGrid size={20} color="#fff" />
    </Pressable>
  )
}

const useStyles = makeStyles((t) => ({
  soon: { borderWidth: 1, borderColor: t.c.line, borderRadius: t.radius.xl, padding: 16, backgroundColor: t.c.card },
  icons: { flexDirection: 'row' },
  iconRing: { marginRight: -8, borderRadius: 999, borderWidth: 2, borderColor: t.c.bg, backgroundColor: t.c.bg },
  mtSm: { marginTop: t.space.sm },
  body: { marginTop: 4, lineHeight: 19 },
  row: { flexDirection: 'row', gap: 8, marginTop: 14 },
  teaser: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: t.radius.xl, backgroundColor: '#111' },
  pressed: { transform: [{ scale: 0.985 }] },
  stack: { width: 76, height: 60 },
  stackImg: { position: 'absolute', top: 4, width: 40, height: 52, borderRadius: 8, borderWidth: 2, borderColor: '#111' },
  left: { left: 0, transform: [{ rotate: '-8deg' }] },
  right: { right: 0, transform: [{ rotate: '8deg' }] },
  mid: { left: 18, top: 0, zIndex: 1 },
  grow: { flex: 1, minWidth: 0 },
  white: { color: '#fff' },
  light: { color: '#cfcfcf', marginTop: 2 },
}))
