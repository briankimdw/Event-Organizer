// Home's browse cards (the web Home.jsx):
//   useInvite()      "Know a great photographer? Invite them": the native share sheet (RN Share)
//   JoinCard         "Shoot photo or video?": list your work, or invite a photographer (cold start)
//   ExploreTeaser    three real portfolio shots -> Discover's Explore grid
import { useRouter } from 'expo-router'
import { Camera, LayoutGrid, Send } from 'lucide-react-native'
import { Pressable, Share, View } from 'react-native'

import { inviteMessage } from '@shared/api/home.js'
import { Button, Photo, Text } from '@/components'
import { useStore } from '@/state/store'
import { makeStyles, useTheme } from '@/theme'

// TODO(port): append the public web / store link once there is one (the web shares location.origin).

export function useInvite() {
  const { toast } = useStore()
  return async () => {
    const { title, text } = inviteMessage(null)
    try {
      await Share.share({ title, message: text }, { dialogTitle: title, subject: title })
    } catch {
      toast('Couldn’t open the share sheet. Try again.')
    }
  }
}

export function JoinCard() {
  const s = useStyles()
  const { c } = useTheme()
  const router = useRouter()
  const invite = useInvite()
  const { isProvider } = useStore()
  return (
    <View style={s.soon}>
      <View style={s.badge} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Camera size={18} color={c.accent} />
      </View>
      <Text variant="h4" style={s.mtSm}>{isProvider ? 'Know a great photographer?' : 'Shoot photo or video?'}</Text>
      <Text variant="small" muted style={s.body}>
        {isProvider
          ? 'Invite them to photomatch. The more great work here, the more clients come looking.'
          : 'List your work for free and get booked by clients near you. Or invite a photographer or videographer you love.'}
      </Text>
      <View style={s.row}>
        <Button title="Invite" accessibilityLabel="Invite a photographer" icon={Send} size="sm" grow style={s.half} variant={isProvider ? 'primary' : 'ghost'} onPress={invite} />
        {!isProvider && <Button title="List your work" icon={Camera} size="sm" grow style={s.half} onPress={() => router.push('/new-listing')} />}
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
  badge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: t.c.accentSoft },
  mtSm: { marginTop: t.space.sm },
  body: { marginTop: 4, lineHeight: 19 },
  // Side by side when both labels fit (>= 2 x 140), otherwise one full-width button per line.
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  half: { flexBasis: 140 },
  teaser: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: t.radius.xl, backgroundColor: t.scheme === 'dark' ? '#1c1c1f' : '#111', borderWidth: t.scheme === 'dark' ? 1 : 0, borderColor: t.c.line },
  pressed: { transform: [{ scale: 0.985 }] },
  stack: { width: 76, height: 60 },
  stackImg: { position: 'absolute', top: 4, width: 40, height: 52, borderRadius: 8, borderWidth: 2, borderColor: t.scheme === 'dark' ? '#1c1c1f' : '#111' },
  left: { left: 0, transform: [{ rotate: '-8deg' }] },
  right: { right: 0, transform: [{ rotate: '8deg' }] },
  mid: { left: 18, top: 0, zIndex: 1 },
  grow: { flex: 1, minWidth: 0 },
  white: { color: '#fff' },
  light: { color: '#cfcfcf', marginTop: 2 },
}))
