// "No caterers near you yet" (the web's components/verticals/EmptyVertical.jsx): a friendly
// state for a vertical with no vendors, with an invite (the system share sheet) and
// "I'm a <noun>" (start a listing).
import { lowerFirst, nounFor, verticalMeta } from '@shared/verticals/index.js'
import * as Linking from 'expo-linking'
import { useRouter } from 'expo-router'
import { UserPlus } from 'lucide-react-native'
import { Share, View } from 'react-native'

import { Button, Text, VerticalIcon } from '@/components'
import { makeStyles } from '@/theme'

export default function EmptyVertical({ vertical, compact = false, listing = true }: { vertical: string; compact?: boolean; listing?: boolean }) {
  const s = useStyles()
  const router = useRouter()
  const m = verticalMeta(vertical)
  const plural = nounFor(vertical, 2)
  const invite = () => {
    const link = Linking.createURL('/new-listing', { queryParams: { v: vertical } })
    Share.share({ message: `You should list your ${lowerFirst(m.name)} business here so clients can book you: ${link}` }).catch(() => {})
  }
  return (
    <View style={[s.wrap, compact && s.compact]}>
      <VerticalIcon name={m.icon} tint={m.tint} bubble size={compact ? 18 : 24} bubbleSize={compact ? 36 : 48} />
      <Text variant="h4" center>{`No ${plural} near you yet`}</Text>
      <Text variant="small" muted center style={s.text}>
        {`We’re just getting started with ${lowerFirst(m.name)}. Know a great ${m.noun}? Invite them, and they can set up a listing in minutes.`}
      </Text>
      <View style={s.row}>
        <Button title={`Invite a ${m.noun}`} icon={UserPlus} size="sm" onPress={invite} />
        {listing && <Button title={`I’m a ${m.noun}`} variant="ghost" size="sm" onPress={() => router.push({ pathname: '/new-listing', params: { v: vertical } })} />}
      </View>
    </View>
  )
}

const useStyles = makeStyles(() => ({
  wrap: { alignItems: 'center', gap: 8, paddingVertical: 24, paddingHorizontal: 16 },
  compact: { paddingVertical: 8, paddingHorizontal: 4 },
  text: { maxWidth: 300 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 4 },
}))
