// /new-listing?v=catering: native port of frontend/src/screens/NewListing.jsx.
// "What do you offer?" -> pick a vertical (grid by group), then the listing's name,
// link, city and services. A user can have one listing per vertical. After it's
// created, visual services go post their work; everyone else adds packages on Me.
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft, Clock } from 'lucide-react-native'
import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

import { getCategories, invalidate } from '@shared/api/catalog.js'
import { becomeProvider, slugify } from '@shared/api/portfolio.js'
import { getVertical, lowerFirst, nounFor, verticalMeta } from '@shared/verticals/index.js'
import { Button, Chip, ChipRow, ErrorState, KeyboardView, Loading, SignInPrompt, Text, TextField, VerticalIcon } from '@/components'
import useQuery from '@/hooks/useQuery'
import { useAuth } from '@/state/auth'
import { useStore } from '@/state/store'
import { makeStyles, useTheme } from '@/theme'
import { Callout, FieldHint, FormError } from '../account/ui'
import VerticalGrid from './VerticalGrid'

const friendlyError = (err: any) => {
  const msg = err?.message || ''
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) return 'Network problem. Check your connection and try again.'
  if (/jwt|not authenticated|row-level security/i.test(msg)) return 'Your session expired. Sign in again, then retry.'
  if (/unknown category/i.test(msg)) return 'This service isn’t open for listings yet.'
  if (/duplicate key.*profile_id/i.test(msg)) return 'You already have a listing for this service.'
  return msg || 'Something went wrong.'
}

export default function NewListing() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const { setMode } = useStore()
  const { v } = useLocalSearchParams<{ v?: string }>()
  const preset = v && getVertical(v) ? v : null

  if (loading) return <Shell title="List your services"><Loading /></Shell>
  if (!user) {
    return (
      <Shell title="List your services">
        <SignInPrompt title="Sign in to list your services" text="Set up a listing so clients can find and book you." />
      </Shell>
    )
  }
  return (
    <ListingSetup
      initialVertical={preset}
      onDone={(provider) => {
        setMode('provider')
        // Visual services post their work first; everyone else starts with packages.
        if (verticalMeta(provider.vertical).visual) router.replace('/upload')
        else router.replace({ pathname: '/me', params: { tab: 'packages' } })
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
  initialVertical?: string | null
  lockVertical?: boolean
  title?: string
  onDone: (provider: any) => void
}

// The setup form. Also used by /upload the first time someone posts
// (initialVertical 'photography', lockVertical). onDone(provider) gets the new providers row (+ `vertical`).
export function ListingSetup({ initialVertical = null, lockVertical = false, onDone, title }: Props) {
  const s = useStyles()
  const { c } = useTheme()
  const { profile } = useAuth()
  const { myProviders, refreshProvider, toast } = useStore()
  const cats = useQuery<any[]>(getCategories, [])
  const taken = useMemo(() => new Set((myProviders || []).map((p) => p.vertical as string)), [myProviders])
  const [step, setStep] = useState(initialVertical ? 2 : 1)
  const [vertical, setVertical] = useState<string | null>(initialVertical)
  const [name, setName] = useState(profile?.display_name || '')
  const [slug, setSlug] = useState(slugify(profile?.display_name || profile?.username || ''))
  const [slugTouched, setSlugTouched] = useState(false)
  const [editLink, setEditLink] = useState(false)
  const [city, setCity] = useState(profile?.city || '')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const live = useMemo(() => (cats.data ? new Set(cats.data.filter((x) => x.live).map((x) => x.slug as string)) : null), [cats.data])
  const info = cats.data?.find((x) => x.slug === vertical)
  const meta = verticalMeta(vertical)
  const services: { id: string; slug: string; name: string }[] = (info?.services || []).filter((x: any) => x.live)
  const isLive = !!info?.live
  const already = !!vertical && taken.has(vertical)
  const noun = nounFor(vertical)

  // A second listing gets its own link: suggest one with the vertical in it.
  useEffect(() => {
    if (!slugTouched && vertical && taken.size) setSlug(slugify(`${name || profile?.username || ''} ${vertical}`))
  }, [vertical]) // eslint-disable-line react-hooks/exhaustive-deps

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
      const provider = await becomeProvider({ displayName: name.trim(), slug, city: city.trim(), serviceIds: ids, vertical: vertical! } as any)
      invalidate('providers')
      await refreshProvider(provider.id)
      toast(meta.visual ? 'You’re set up. Now add your first photos.' : 'You’re set up. Now add a package.')
      onDone({ ...provider, vertical })
    } catch (err: any) {
      if (err?.code === '23505' && /slug/i.test(err.message || '')) {
        setEditLink(true)
        setError('That profile link is taken. Try another.')
      } else if (err?.code === '23505') {
        setError('You already have a listing for this service.')
      } else {
        setError(friendlyError(err))
      }
    } finally {
      setBusy(false)
    }
  }

  // ---- step 1: what do you offer? ----
  if (step === 1) {
    return (
      <Shell
        title={title || 'List your services'}
        footer={<Button title={vertical ? `Continue as a ${noun}` : 'Pick a service'} variant="accent" block disabled={!vertical} onPress={() => setStep(2)} />}
      >
        <Text variant="h2">What do you offer?</Text>
        <Text variant="small" muted style={s.lead}>Pick one. You can add more services later, each with its own listing.</Text>
        {cats.error && <ErrorState error={cats.error} onRetry={cats.reload} />}
        <VerticalGrid value={vertical} onChange={setVertical} live={live} taken={taken} />
      </Shell>
    )
  }

  // ---- step 2: details ----
  const showForm = !(cats.loading && !cats.data) && !already && isLive
  return (
    <Shell
      title={title || `Become a ${noun}`}
      onBack={lockVertical ? undefined : () => setStep(1)}
      footer={showForm ? <Button title={busy ? 'Setting up…' : 'Continue'} variant="accent" block disabled={busy} onPress={save} /> : undefined}
    >
      <View style={s.hero}>
        <VerticalIcon name={meta.icon} tint={meta.tint} size={30} bubble bubbleSize={64} />
        <Text variant="h2" center>{meta.visual ? 'Show clients your work' : `Get booked as a ${noun}`}</Text>
        <Text variant="small" muted center>
          {meta.visual ? `Set up your ${noun} profile once, then post your work.` : `Set up your ${noun} profile, then add your packages and prices.`} You can change any of this later.
        </Text>
      </View>

      {cats.loading && !cats.data ? (
        <Loading inline />
      ) : cats.error && !cats.data ? (
        <ErrorState error={cats.error} onRetry={cats.reload} />
      ) : already ? (
        <Callout>
          <Text variant="small" weight="700">You already have a {noun} listing.</Text>
          <Text variant="small" muted>Switch to it from your profile, or pick a different service.</Text>
          <View style={s.row}>
            <BackToMe />
            {!lockVertical && <Button title="Pick another" variant="ghost" size="sm" onPress={() => setStep(1)} />}
          </View>
        </Callout>
      ) : !isLive ? (
        <Callout>
          <View style={s.inline}><Clock size={16} color={c.warn} /><Text weight="700">{meta.name} is coming soon</Text></View>
          <Text variant="small" muted>
            We’re opening {lowerFirst(meta.name)} listings shortly. Check back soon{lockVertical ? '' : ', or pick another service you offer'}.
          </Text>
          {!lockVertical && <Button title="Pick another service" variant="ghost" size="sm" onPress={() => setStep(1)} style={s.mtSm} />}
        </Callout>
      ) : (
        <>
          <TextField
            label="Name clients will see"
            maxLength={80}
            placeholder={`e.g. ${placeholderName(vertical)}`}
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
              <Text variant="small" muted style={s.label}>What kinds of {lowerFirst(meta.name)}? (optional)</Text>
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

const PLACEHOLDER_NAMES: Record<string, string> = {
  photography: 'Alex Rivera Photography', catering: 'Casa Taco Catering', venue: 'The Glasshouse', music: 'DJ Nova',
  florals: 'Wild Poppy Florals', cakes: 'Sugar & Crumb', 'hair-makeup': 'Glow by Dana', planning: 'Golden Hour Events',
}
const placeholderName = (v: string | null) => (v && PLACEHOLDER_NAMES[v]) || `Your ${lowerFirst(verticalMeta(v).name)} business`

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.c.bg },
  flex: { flex: 1 },
  topbar: { flexDirection: 'row', alignItems: 'center', height: 48, paddingHorizontal: t.space.xs, borderBottomWidth: 1, borderBottomColor: t.c.line },
  iconBtn: { width: 40, padding: 6 },
  title: { flex: 1, textAlign: 'center' },
  body: { padding: t.space.lg, paddingBottom: t.space.xxl },
  footer: { paddingHorizontal: t.space.lg, paddingTop: 12, borderTopWidth: 1, borderTopColor: t.c.line, backgroundColor: t.c.bg },
  lead: { marginTop: 4, marginBottom: t.space.lg },
  hero: { alignItems: 'center', gap: 8, marginBottom: t.space.xl },
  row: { flexDirection: 'row', gap: 8, marginTop: t.space.sm },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  grow: { flex: 1 },
  label: { marginBottom: 6 },
  mt: { marginTop: t.space.md },
  mtSm: { marginTop: t.space.sm },
}))
