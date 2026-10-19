// /new-listing: native port of frontend/src/screens/NewListing.jsx. Straight to the
// photo & video listing setup (photography pivot: no "what do you offer?" vertical step;
// an old ?v= is ignored): the listing's name, link, city and services (photo and video).
// One listing per person. After it's created you post your first work.
import { useRouter } from 'expo-router'
import { ChevronLeft, Clock } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

import { getCategories, invalidate } from '@shared/api/catalog.js'
import { becomeProvider, slugify } from '@shared/api/portfolio.js'
import { PHOTO_VERTICAL, verticalMeta } from '@shared/verticals/index.js'
import { Button, Chip, ChipRow, ErrorState, KeyboardView, Loading, SignInPrompt, Text, TextField, VerticalIcon } from '@/components'
import useQuery from '@/hooks/useQuery'
import { useAuth } from '@/state/auth'
import { useStore } from '@/state/store'
import { makeStyles, useTheme } from '@/theme'
import { Callout, FieldHint, FormError } from '../account/ui'

const friendlyError = (err: any) => {
  const msg = err?.message || ''
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) return 'Network problem. Check your connection and try again.'
  if (/jwt|not authenticated|row-level security/i.test(msg)) return 'Your session expired. Sign in again, then retry.'
  if (/unknown category/i.test(msg)) return 'This service isn’t open for listings yet.'
  if (/duplicate key.*profile_id/i.test(msg)) return 'You already have a listing.'
  return msg || 'Something went wrong.'
}

export default function NewListing() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const { setMode } = useStore()

  if (loading) return <Shell title="Set up your listing"><Loading /></Shell>
  if (!user) {
    return (
      <Shell title="Set up your listing">
        <SignInPrompt title="Sign in to set up your listing" text="Set up your photo or video listing so clients can find and book you." />
      </Shell>
    )
  }
  return (
    <ListingSetup
      onDone={() => {
        setMode('provider')
        router.replace('/upload') // post your first work
      }}
    />
  )
}

// Header with a custom back action + safe areas + keyboard handling.
export function Shell({ title, onBack, children, footer }: { title: string; onBack?: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  const s = useStyles()
  const { c } = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/me')))
  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.topbar}>
        <Pressable onPress={back} hitSlop={10} style={s.iconBtn} accessibilityRole="button" accessibilityLabel="Back">
          <ChevronLeft size={26} color={c.ink} />
        </Pressable>
        <Text variant="h4" numberOfLines={1} style={s.title}>{title}</Text>
        <View style={s.iconBtn} />
      </View>
      <KeyboardView bottomInset={footer ? 0 : insets.bottom}>
        <ScrollView style={s.flex} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        {footer && <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>{footer}</View>}
      </KeyboardView>
    </SafeAreaView>
  )
}

type Props = {
  title?: string
  onDone: (provider: any) => void
}

const META = verticalMeta()

// The setup form. onDone(provider) gets the new providers row (+ `vertical`).
export function ListingSetup({ onDone, title }: Props) {
  const s = useStyles()
  const { c } = useTheme()
  const { profile } = useAuth()
  const { myProvider, refreshProvider, toast } = useStore()
  const cats = useQuery<any[]>(getCategories, [])
  const vertical = PHOTO_VERTICAL
  const [name, setName] = useState(profile?.display_name || '')
  const [slug, setSlug] = useState(slugify(profile?.display_name || profile?.username || ''))
  const [slugTouched, setSlugTouched] = useState(false)
  const [editLink, setEditLink] = useState(false)
  const [city, setCity] = useState(profile?.city || '')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const info = cats.data?.find((x) => x.slug === vertical)
  const services: { id: string; slug: string; name: string }[] = (info?.services || []).filter((x: any) => x.live)
  const isLive = !!info?.live
  const already = !!myProvider && !busy // (not while this form is creating it)

  const slugOk = /^[a-z0-9-]{3,40}$/.test(slug)
  const ready = name.trim().length > 0 && slugOk && isLive && !already

  const save = async () => {
    if (!ready) {
      setError(!name.trim() ? 'Add the name clients will see.' : !slugOk ? 'Your profile link needs 3–40 letters, numbers or dashes.' : '')
      if (!slugOk) setEditLink(true)
      return
    }
    setBusy(true)
    setError('')
    try {
      const ids = services.filter((x) => picked.has(x.slug)).map((x) => x.id)
      const provider = await becomeProvider({ displayName: name.trim(), slug, city: city.trim(), serviceIds: ids, vertical } as any)
      invalidate('providers')
      await refreshProvider(provider.id)
      toast('You’re set up. Now post your first work.')
      onDone({ ...provider, vertical })
    } catch (err: any) {
      if (err?.code === '23505' && /slug/i.test(err.message || '')) {
        setEditLink(true)
        setError('That profile link is taken. Try another.')
      } else if (err?.code === '23505') {
        setError('You already have a listing.')
      } else {
        setError(friendlyError(err))
      }
    } finally {
      setBusy(false)
    }
  }


  const showForm = !(cats.loading && !cats.data) && !already && isLive
  return (
    <Shell
      title={title || 'Set up your listing'}
      footer={showForm ? <Button title={busy ? 'Setting up…' : 'Continue'} variant="accent" block disabled={busy} onPress={save} /> : undefined}
    >
      <View style={s.hero}>
        <VerticalIcon name={META.icon} tint={META.tint} size={30} bubble bubbleSize={64} />
        <Text variant="h2" center>Get booked for your photo and video work</Text>
        <Text variant="small" muted center>
          Set up your profile once, then post your work and add packages. You can change any of this later.
        </Text>
      </View>

      {cats.loading && !cats.data ? (
        <Loading inline />
      ) : cats.error && !cats.data ? (
        <ErrorState error={cats.error} onRetry={cats.reload} />
      ) : already ? (
        <Callout>
          <Text variant="small" weight="700">You already have a listing.</Text>
          <Text variant="small" muted>Manage it, its packages and your portfolio from your profile.</Text>
          <View style={s.row}>
            <BackToMe />
          </View>
        </Callout>
      ) : !isLive ? (
        <Callout>
          <View style={s.inline}><Clock size={16} color={c.warn} /><Text weight="700">Listings are opening soon</Text></View>
          <Text variant="small" muted>We’re opening photo and video listings shortly. Check back soon.</Text>
        </Callout>
      ) : (
        <>
          <TextField
            label="Name clients will see"
            maxLength={80}
            placeholder="e.g. Alex Rivera Photo & Film"
            value={name}
            autoComplete="organization"
            onChangeText={(t) => {
              setName(t)
              if (!slugTouched) setSlug(slugify(t))
            }}
          />
          {editLink ? (
            <View style={s.mt}>
              <TextField
                label="Profile link"
                value={slug}
                maxLength={40}
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(t) => {
                  setSlugTouched(true)
                  setSlug(slugify(t))
                }}
              />
              {!!slug && !slugOk && <FieldHint error>3–40 characters: letters, numbers and dashes.</FieldHint>}
            </View>
          ) : (
            <View style={s.linkRow}>
              <Text variant="tiny" muted style={s.grow} numberOfLines={1}>Your link: photomatch.app/<Text variant="tiny" weight="700">{slug || '…'}</Text></Text>
              <Text variant="tiny" color="accent" weight="700" onPress={() => setEditLink(true)} accessibilityRole="button">Change</Text>
            </View>
          )}
          <TextField
            label="City (optional)"
            maxLength={80}
            placeholder="Los Angeles, CA"
            value={city}
            autoComplete="postal-address-locality"
            onChangeText={setCity}
            containerStyle={s.mt}
          />
          {services.length > 0 && (
            <View style={s.mt}>
              <Text variant="small" muted style={s.label}>What do you shoot? (optional)</Text>
              <ChipRow>
                {services.map((x) => (
                  <Chip
                    key={x.slug}
                    label={x.name}
                    toggle
                    on={picked.has(x.slug)}
                    onPress={() => setPicked((prev) => {
                      const n = new Set(prev)
                      if (n.has(x.slug)) n.delete(x.slug)
                      else n.add(x.slug)
                      return n
                    })}
                  />
                ))}
              </ChipRow>
            </View>
          )}
        </>
      )}
      {!!error && <FormError>{error}</FormError>}
    </Shell>
  )
}

function BackToMe() {
  const router = useRouter()
  return <Button title="Go to my profile" size="sm" onPress={() => router.replace('/me')} />
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.c.bg },
  flex: { flex: 1 },
  topbar: { flexDirection: 'row', alignItems: 'center', height: 48, paddingHorizontal: t.space.xs, borderBottomWidth: 1, borderBottomColor: t.c.line },
  iconBtn: { width: 40, padding: 6 },
  title: { flex: 1, textAlign: 'center' },
  body: { padding: t.space.lg, paddingBottom: t.space.xxl },
  footer: { paddingHorizontal: t.space.lg, paddingTop: 12, borderTopWidth: 1, borderTopColor: t.c.line, backgroundColor: t.c.bg },
  hero: { alignItems: 'center', gap: 8, marginBottom: t.space.xl },
  row: { flexDirection: 'row', gap: 8, marginTop: t.space.sm },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  grow: { flex: 1 },
  label: { marginBottom: 6 },
  mt: { marginTop: t.space.md },
}))
