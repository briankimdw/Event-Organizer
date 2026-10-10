// /settings: native port of frontend/src/screens/Settings.jsx. Rows for features
// that aren't built yet say so instead of pretending to work. Appearance (light /
// dark / system, native-only) is shown signed in or not.
import { useRouter } from 'expo-router'
import { CreditCard, Download, KeyRound, LogOut, ShieldCheck, Stamp, Trash2 } from 'lucide-react-native'
import { useState } from 'react'

import { Button, Loading, Screen, Segmented, Sheet, SignInPrompt, Text } from '@/components'
import { useAuth } from '@/state/auth'
import { useStore } from '@/state/store'
import { makeStyles, useTheme, useThemePreference, type ThemePreference } from '@/theme'
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
      <Screen title="Settings" back padded>
        <AppearanceSection />
        {loading ? <Loading /> : <SignInPrompt title="Sign in to manage your account" />}
      </Screen>
    )
  }

  return (
    <Screen title="Settings" back padded>
      <AppearanceSection />

      <SectionLabel>Account</SectionLabel>
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

const APPEARANCE: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

// Light is the default (the web's look); System follows the phone's setting.
function AppearanceSection() {
  const s = useStyles()
  const { preference, setPreference } = useThemePreference()
  return (
    <>
      <SectionLabel style={s.first}>Appearance</SectionLabel>
      <Segmented options={APPEARANCE} value={preference} onChange={setPreference} />
      <Text variant="tiny" muted style={s.hint}>
        {preference === 'system' ? 'Matches your phone’s light or dark setting.' : 'System matches your phone’s light or dark setting.'}
      </Text>
    </>
  )
}

const useStyles = makeStyles((t) => ({
  first: { paddingTop: 0 },
  hint: { marginTop: t.space.sm },
  logout: { marginTop: t.space.xl },
}))
