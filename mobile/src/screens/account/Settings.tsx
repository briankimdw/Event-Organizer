// /settings: native port of frontend/src/screens/Settings.jsx. Rows for features
// that aren't built yet say so instead of pretending to work.
import { useRouter } from 'expo-router'
import { CreditCard, Download, KeyRound, LogOut, ShieldCheck, Stamp, Trash2 } from 'lucide-react-native'
import { useState } from 'react'

import { Button, Loading, Screen, Sheet, SignInPrompt, Text } from '@/components'
import { useAuth } from '@/state/auth'
import { useStore } from '@/state/store'
import { makeStyles, useTheme } from '@/theme'
import { Group, ListRow, SectionLabel, SoonTag } from './ui'

export default function Settings() {
  const s = useStyles()
  const { c } = useTheme()
  const router = useRouter()
  const { identityStatus, myProvider, toast } = useStore()
  const { signOut, user, loading } = useAuth()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const verified = identityStatus === 'verified'

  const logOut = async () => {
    await signOut()
    toast('Signed out')
    if (router.canDismiss()) router.dismissAll()
    router.replace('/')
  }

  if (loading || !user) {
    return (
      <Screen title="Settings" back>
        {loading ? <Loading /> : <SignInPrompt title="Sign in to manage your account" />}
      </Screen>
    )
  }

  return (
    <Screen title="Settings" back padded>
      <SectionLabel style={s.first}>Account</SectionLabel>
      <Group>
        <ListRow icon={KeyRound} title="Set or change password" sub={`Signed in as ${user.email}`} onPress={() => router.push('/reset-password')} />
        <ListRow
          icon={ShieldCheck}
          title="Identity verification"
          sub={verified ? 'Verified' : myProvider ? 'Not verified' : 'Only needed to take paid bookings as a vendor'}
          subColor={verified ? c.ok : undefined}
          onPress={() => router.push('/verify')}
        />
        <ListRow icon={CreditCard} title="Payouts" sub="Not connected · bank payouts are coming soon" right={<SoonTag />} />
      </Group>

      {myProvider && (
        <>
          <SectionLabel>Your business</SectionLabel>
          <Group>
            <ListRow
              icon={Stamp}
              title="Watermark new uploads"
              sub="Coming soon. Public copies are resized and stripped of location data; originals stay private."
              right={<SoonTag />}
            />
          </Group>
        </>
      )}

      <SectionLabel>Privacy & data</SectionLabel>
      <Group>
        <ListRow icon={Download} title="Download my data" sub="Coming soon" right={<SoonTag />} />
        <ListRow icon={Trash2} title="Delete account" danger chevron={false} onPress={() => setConfirmDelete(true)} />
      </Group>

      <Button title="Log out" icon={LogOut} variant="ghost" block onPress={logOut} style={s.logout} />

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete your account">
        <Text variant="small" muted>
          Deleting your account from the app isn’t available yet. When it is, your profile, messages and saved items will be removed,
          and active bookings will need to be finished or cancelled first.
        </Text>
        <Button title="OK" variant="ghost" block onPress={() => setConfirmDelete(false)} style={s.logout} />
      </Sheet>
    </Screen>
  )
}

const useStyles = makeStyles((t) => ({
  first: { paddingTop: 0 },
  logout: { marginTop: t.space.xl },
}))
