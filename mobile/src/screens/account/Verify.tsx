// /verify: native port of frontend/src/screens/Verify.jsx. Identity verification
// (Stripe Identity) isn't built yet: show the real status from the listing and say what's coming.
import { useRouter } from 'expo-router'
import { CheckCircle2, ShieldCheck } from 'lucide-react-native'
import { View } from 'react-native'

import { Button, Loading, Screen, SignInPrompt, Text } from '@/components'
import { useAuth } from '@/state/auth'
import { useStore } from '@/state/store'
import { makeStyles, useTheme } from '@/theme'
import { Callout } from './ui'

export default function Verify() {
  const s = useStyles()
  const { c } = useTheme()
  const router = useRouter()
  const { identityStatus, myProvider } = useStore()
  const { user, loading } = useAuth()
  const verified = identityStatus === 'verified'

  return (
    <Screen title="Verify identity" back padded>
      {loading ? (
        <Loading />
      ) : !user ? (
        <SignInPrompt title="Sign in to verify your identity" />
      ) : verified ? (
        <View style={s.col}>
          <CheckCircle2 size={56} color={c.ok} />
          <Text variant="h3" center>You’re verified</Text>
          <Text variant="small" muted center>An ID-verified badge appears on your profile, and you can accept paid bookings.</Text>
          <Button title="Back to profile" block onPress={() => router.replace('/me')} style={s.mt} />
        </View>
      ) : (
        <View style={s.col}>
          <ShieldCheck size={48} color={c.accent} />
          <Text variant="h3" center>Identity verification is coming soon</Text>
          <Text variant="small" muted center>
            {myProvider
              ? 'Vendors need to verify their identity before accepting paid bookings. You’ll scan a government ID and take a quick selfie. This is free and separate from Verified Pro.'
              : 'Verification is for vendors taking paid bookings. Clients don’t need it to book.'}
          </Text>
          <Callout style={s.stretch}>
            <Text variant="small">Verification will be handled by Stripe Identity. We’ll only keep whether you passed, never your ID images or face data.</Text>
          </Callout>
          <View style={s.status}>
            <Text variant="small" muted>Your status</Text>
            <Text variant="small" weight="700">{myProvider ? 'Not verified' : 'No listing yet'}</Text>
          </View>
          <Button title="Verify with Stripe (coming soon)" variant="accent" block disabled />
          {!myProvider && <Button title="List your services" variant="ghost" block onPress={() => router.push('/new-listing')} />}
        </View>
      )}
    </Screen>
  )
}

const useStyles = makeStyles((t) => ({
  col: { alignItems: 'center', gap: 12, paddingTop: t.space.xl },
  stretch: { alignSelf: 'stretch' },
  status: {
    alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-between', padding: t.space.md,
    borderWidth: 1, borderColor: t.c.line, borderRadius: t.radius.lg,
  },
  mt: { marginTop: t.space.md },
}))
