// /upload: native port of frontend/src/screens/Upload.jsx. Post work to one of your
// listings: 1) photos (expo-image-picker multi-select, order, cover; or a before/after
// pair where the vertical allows it), 2) details (category, occasion, title, credits,
// caption, place, date, and camera settings for photo / video), then posting through the
// shared api/portfolio.js postAlbum() with per-photo progress. Wording and options follow
// the listing's vertical (postConfig); with several listings you pick which one it's for.
// People without a listing get a short explanation and a way to set one up.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useNavigation, useRouter } from 'expo-router'
import { ChevronLeft, Lock, MapPinOff, Store, X } from 'lucide-react-native'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

import { invalidate } from '@shared/api/catalog.js'
import { creditsSupported, getMyProviders, getProviderServiceIds, getServicesOf, postAlbum } from '@shared/api/portfolio.js'
import { autoPostTitle, getOccasion, occasionsFor, postConfig } from '@shared/verticals/index.js'
import { Button, ErrorState, KeyboardView, Loading, Photo, Segmented, Sheet, SignInPrompt, Text, VerticalIcon } from '@/components'
import { useAuth } from '@/state/auth'
import { useStore } from '@/state/store'
import { makeStyles, useTheme } from '@/theme'
import { CreditsField, type CreditItem } from './upload/Credits'
import ListingPicker from './upload/ListingPicker'
import PhotoPicker, { type PickMode } from './upload/PhotoPicker'
import {
  CameraSettings, CaptionField, CategoryField, Disclosure, OccasionField, PlaceDateFields, SETTING_FIELDS, TitleField, prettyDay, readFields, settingsSummary,
  useHiddenSet, validatePost,
} from './upload/PostFields'
import { PostFailed, Posted, Posting, type PhotoProgress } from './upload/PostingStatus'
import usePhotoItems, { type PhotoItem } from './upload/usePhotoItems'

const lastCategoryKey = (providerId: string) => `pm:last-category:${providerId}`

// Camera settings are only kept for photo / video work; other vendors' posts save none.
const ALL_SETTINGS = SETTING_FIELDS.map(([key]) => key)

type Listing = { id: string; display_name: string; vertical: string; city?: string | null }

const friendlyError = (err: any) => {
  const msg = err?.message || ''
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) return 'Network problem. Check your connection and try again.'
  if (/jwt|not authenticated|row-level security/i.test(msg)) return 'Your session expired. Sign in again, then retry.'
  return msg || 'Something went wrong.'
}

export default function Upload() {
  const { user, loading } = useAuth()
  const { myProvider } = useStore()
  const selectedId: string | null = myProvider?.id ?? null
  const [providers, setProviders] = useState<Listing[] | undefined>(undefined) // undefined = loading
  const [loadError, setLoadError] = useState<Error | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!user) return
    let live = true
    setLoadError(null)
    getMyProviders(user.id)
      .then((list: Listing[]) => live && setProviders(list))
      .catch((e: Error) => live && setLoadError(e))
    return () => { live = false }
  }, [user, tick])

  if (!loading && !user) {
    return <Frame title="New post"><SignInPrompt title="Sign in to post your work" text="Share your work on your listing so people planning an event can find and book you." /></Frame>
  }
  if (loadError) return <Frame title="New post"><ErrorState error={loadError} onRetry={() => setTick((t) => t + 1)} /></Frame>
  if (loading || providers === undefined || !user) return <Frame title="New post"><Loading /></Frame>
  if (!providers.length) return <NotAVendor />
  const initial = providers.find((p) => p.id === selectedId) || providers[0]
  return <Composer providers={providers} initialId={initial.id} userId={user.id} />
}

// Header (back or close, title, subtitle) + safe area.
function Frame({ title, subtitle, onBack, close, children, footer }: {
  title: string; subtitle?: string | null; onBack?: (() => void) | false; close?: boolean; children: React.ReactNode; footer?: React.ReactNode
}) {
  const s = useStyles()
  const { c } = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const back = onBack === undefined ? () => (router.canGoBack() ? router.back() : router.replace('/me')) : onBack
  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.topbar}>
        <View style={s.side}>
          {back && (
            <Pressable onPress={back} hitSlop={10} style={s.iconBtn} accessibilityRole="button" accessibilityLabel={close ? 'Close' : 'Back'}>
              {close ? <X size={24} color={c.ink} /> : <ChevronLeft size={26} color={c.ink} />}
            </Pressable>
          )}
        </View>
        <View style={s.titleWrap}>
          <Text variant="h4" numberOfLines={1}>{title}</Text>
          {!!subtitle && <Text variant="tiny" muted numberOfLines={1}>{subtitle}</Text>}
        </View>
        <View style={s.side} />
      </View>
      <KeyboardView bottomInset={footer ? 0 : insets.bottom}>
        {children}
        {footer && <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>{footer}</View>}
      </KeyboardView>
    </SafeAreaView>
  )
}

// Signed in, but no listing: posting is for vendors.
function NotAVendor() {
  const s = useStyles()
  const { c } = useTheme()
  const router = useRouter()
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'))
  const examples: [string, string, string][] = [
    ['UtensilsCrossed', '#f97316', 'A caterer’s dishes'],
    ['Building', '#0ea5e9', 'A venue’s spaces'],
    ['Flower2', '#f43f5e', 'A florist’s arrangements'],
    ['Camera', '#6366f1', 'A photographer’s shoots'],
  ]
  return (
    <Frame title="New post" close onBack={back}>
      <ScrollView contentContainerStyle={s.uv}>
        <View style={[s.uvIcon, { backgroundColor: c.accentSoft }]}><Store size={28} color={c.accent} /></View>
        <Text variant="h2" center>Posting is for vendors</Text>
        <Text variant="small" muted center style={s.uvText}>
          Posts show off a vendor’s work on their listing, so people planning an event can see it and book them.
        </Text>
        <View style={s.uvGrid}>
          {examples.map(([icon, tint, text]) => (
            <View key={text} style={s.uvExample}>
              <VerticalIcon name={icon} tint={tint} size={15} bubble bubbleSize={28} />
              <Text variant="tiny" style={s.grow}>{text}</Text>
            </View>
          ))}
        </View>
        <Text variant="small" center style={s.uvText}>Offer a service? Set up a free listing in about a minute, then post your work.</Text>
        <View style={s.uvActions}>
          <Button title="Set up a listing" variant="accent" block onPress={() => router.push('/new-listing')} />
          <Button title="Not now" variant="ghost" block onPress={back} />
        </View>
        <Button title="Planning an event? Find vendors" variant="link" size="sm" onPress={() => router.push('/search')} style={s.uvLink} />
      </ScrollView>
    </Frame>
  )
}

function Composer({ providers, initialId, userId }: { providers: Listing[]; initialId: string; userId: string }) {
  const s = useStyles()
  const { c } = useTheme()
  const router = useRouter()
  const navigation = useNavigation()
  const photos = usePhotoItems()
  const { items } = photos
  const scroller = useRef<ScrollView>(null)

  const [providerId, setProviderId] = useState(initialId)
  const provider = providers.find((p) => p.id === providerId) || providers[0]
  const vertical = provider.vertical || 'photography'
  const post = postConfig(vertical)
  const occasions = useMemo(() => occasionsFor(vertical), [vertical])

  const [step, setStep] = useState<1 | 2>(1)
  const [phase, setPhase] = useState<'edit' | 'posting' | 'done' | 'failed'>('edit')
  const [mode, setMode] = useState<PickMode>('photos')
  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [occasion, setOccasion] = useState<string | null>(null)
  const [credits, setCredits] = useState<CreditItem[]>([])
  const [canCredit, setCanCredit] = useState(false)
  const [caption, setCaption] = useState('')
  const [place, setPlace] = useState<string>(provider.city || '')
  const [shotOn, setShotOn] = useState('')
  const [dateTouched, setDateTouched] = useState(false)
  const { hidden, setHidden, toggle: toggleHidden } = useHiddenSet()
  const [services, setServices] = useState<{ id: string; name: string }[] | null>(null)
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const [openMore, setOpenMore] = useState(false)
  const [openCamera, setOpenCamera] = useState(false)
  const [discarding, setDiscarding] = useState<null | (() => void)>(null)
  const [posting, setPosting] = useState<{ list: PhotoItem[]; perPhoto: (PhotoProgress | undefined)[]; error: string; albumId: string | null; cover: string | null } | null>(null)

  // Credits need the album_credits table (a migration); hide them until it's there.
  useEffect(() => {
    let live = true
    creditsSupported().then((ok: boolean) => { if (live) setCanCredit(ok) }).catch(() => {})
    return () => { live = false }
  }, [])

  // The listing's categories, and a sensible default: the last one used, or the only one it offers.
  useEffect(() => {
    let live = true
    setServices(null)
    setCategoryId(null)
    Promise.all([getServicesOf(vertical), getProviderServiceIds(provider.id).catch(() => []), AsyncStorage.getItem(lastCategoryKey(provider.id)).catch(() => null)])
      .then(([all, mine, last]: [any[], string[], string | null]) => {
        if (!live) return
        setServices([...all.filter((x) => mine.includes(x.id)), ...all.filter((x) => !mine.includes(x.id))])
        const pick = all.some((x) => x.id === last) ? last : mine.length === 1 ? mine[0] : all.length === 1 ? all[0].id : null
        if (pick) setCategoryId(pick)
      })
      .catch(() => live && setServices([]))
    return () => { live = false }
  }, [provider.id, vertical])

  // Switching listing: drop what the new vertical doesn't offer.
  const switchListing = (id: string) => {
    const next = providers.find((p) => p.id === id)
    if (!next || id === providerId) return
    setProviderId(id)
    setErrors({})
    setCredits((list) => list.filter((x) => x.providerId !== id))
    if (!postConfig(next.vertical).beforeAfter && mode === 'before_after') setMode('photos')
    if (!place.trim() || place === provider.city) setPlace(next.city || '')
  }

  // The photos in this post (before/after uses the first two).
  const used = mode === 'before_after' ? items.slice(0, 2) : items
  const ready = used.length > 0 && used.every((i) => i.status === 'ready')
  const canContinue = ready && (mode === 'before_after' ? used.length === 2 : true)
  const kindLabel = mode === 'before_after' ? 'before & after' : 'post'

  // Event date from the photos (earliest), unless you've set it yourself.
  const exifDate = useMemo(() => used.map((i) => i.settings?.taken_on).filter(Boolean).sort()[0] || '', [used])
  useEffect(() => {
    if (!dateTouched) setShotOn(exifDate)
  }, [exifDate, dateTouched])
  const fields = useMemo(() => (post.showCamera ? readFields(used) : []), [used, post.showCamera])
  const serviceName = services?.find((x) => x.id === categoryId)?.name
  const fallbackTitle: string = autoPostTitle({ service: serviceName, occasion: occasion ? getOccasion(occasion)?.name : null, slug: vertical } as any)

  // Leaving with unposted photos (back button, Android back, swipe): confirm first.
  // Mid-upload, the screen can't be left at all.
  const guard = useRef<'none' | 'confirm' | 'block'>('none')
  guard.current = phase === 'posting' ? 'block' : items.length > 0 && phase === 'edit' ? 'confirm' : 'none'
  useEffect(
    () =>
      (navigation as any).addListener('beforeRemove', (e: any) => {
        if (guard.current === 'none') return
        e.preventDefault()
        if (guard.current === 'confirm') setDiscarding(() => () => navigation.dispatch(e.data.action))
      }),
    [navigation],
  )

  const top = () => scroller.current?.scrollTo({ y: 0, animated: false })
  const goStep = (n: 1 | 2) => {
    setStep(n)
    top()
  }
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/me'))
  const onBack = () => (step === 2 ? goStep(1) : leave())

  const send = async () => {
    const errs = validatePost({ title, categoryId, shotOn })
    setErrors(errs)
    if (Object.keys(errs).length) {
      if (errs.shotOn) setOpenMore(true)
      return
    }
    const list = used
    setPosting({ list, perPhoto: [], error: '', albumId: null, cover: list[mode === 'before_after' ? 1 : 0]?.asset.uri || list[0]?.thumbUrl })
    setPhase('posting')
    top()
    try {
      const files = await photos.forUpload(list)
      const albumId = await postAlbum({
        userId,
        providerId: provider.id,
        kind: mode === 'before_after' ? 'before_after' : 'album',
        title: title.trim() || fallbackTitle,
        caption: caption.trim(),
        location: place.trim(),
        shotOn,
        categoryId,
        occasion,
        credits: canCredit ? credits : [],
        files,
        hiddenFields: post.showCamera ? [...hidden] : ALL_SETTINGS,
        onPhotoProgress: (i: number, p: PhotoProgress) => setPosting((st) => {
          if (!st) return st
          const perPhoto = [...st.perPhoto]
          perPhoto[i] = p
          return { ...st, perPhoto }
        }),
      } as any)
      if (categoryId) AsyncStorage.setItem(lastCategoryKey(provider.id), categoryId).catch(() => {})
      invalidate('providers')
      setPosting((st) => st && { ...st, albumId: String(albumId) })
      setPhase('done')
    } catch (err) {
      console.warn(err)
      setPosting((st) => st && { ...st, error: friendlyError(err) })
      setPhase('failed')
    }
  }

  const postAnother = () => {
    photos.reset()
    setTitle('')
    setCaption('')
    setOccasion(null)
    setCredits([])
    setDateTouched(false)
    setHidden(new Set())
    setErrors({})
    setOpenMore(false)
    setOpenCamera(false)
    setMode('photos')
    setPosting(null)
    setPhase('edit')
    goStep(1)
  }

  // ---- posting / done / failed ----
  if (phase !== 'edit' && posting) {
    return (
      <Frame title="New post" onBack={phase === 'posting' ? false : phase === 'failed' ? () => setPhase('edit') : leave} close={phase === 'done'}>
        <ScrollView ref={scroller}>
          {phase === 'posting' && <Posting items={posting.list} perPhoto={posting.perPhoto} kindLabel={kindLabel} />}
          {phase === 'done' && posting.albumId && (
            <Posted cover={posting.cover} kindLabel={kindLabel} providerId={provider.id} albumId={posting.albumId} onAnother={postAnother} />
          )}
          {phase === 'failed' && <PostFailed error={posting.error} onRetry={send} onEdit={() => setPhase('edit')} />}
        </ScrollView>
      </Frame>
    )
  }

  const countLine = (n: number) => (n === 1 ? '1 photo' : `${n} photos`)
  const subtitle = used.length ? (mode === 'before_after' ? 'Before & after' : countLine(used.length)) : providers.length > 1 ? null : provider.display_name
  const moreSummary = [place.trim(), prettyDay(shotOn), caption.trim() && 'caption added'].filter(Boolean).join(' · ')
  const shownCount = fields.filter((f) => !hidden.has(f.key)).length
  const footer = step === 2 ? (
    <Button title={mode === 'before_after' ? 'Post before & after' : 'Post'} variant="accent" block onPress={send} />
  ) : items.length > 0 ? (
    <Button
      title={items.some((i) => i.status === 'loading') ? 'Reading photos…' : mode === 'before_after' && used.length === 1 ? 'Add the after photo' : 'Next'}
      variant="accent"
      block
      disabled={!canContinue}
      onPress={() => goStep(2)}
    />
  ) : undefined

  return (
    <Frame title="New post" subtitle={subtitle} onBack={onBack} close={step === 1} footer={footer}>
      <View style={s.steps} accessibilityLabel={`Step ${step} of 2`}>
        {([1, 2] as const).map((n) => (
          <Pressable key={n} onPress={() => (n === 1 ? goStep(1) : canContinue && goStep(2))} disabled={n === 2 && !canContinue} style={s.step} accessibilityRole="button">
            <View style={[s.stepBar, step >= n && s.stepOn]} />
            <Text variant="tiny" weight="600" muted={step < n}>{n === 1 ? '1 · Photos' : '2 · Details'}</Text>
          </Pressable>
        ))}
      </View>
      {providers.length > 1 && (
        <View style={s.listing}><ListingPicker providers={providers} value={provider.id} onChange={switchListing} /></View>
      )}
      <ScrollView ref={scroller} style={s.flex} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {step === 1 ? (
          <>
            {post.beforeAfter && (
              <Segmented<PickMode>
                options={[{ value: 'photos', label: 'Photos' }, { value: 'before_after', label: 'Before / After' }]}
                value={mode}
                onChange={(m) => { setMode(m); photos.clearNotice() }}
              />
            )}
            <View style={post.beforeAfter ? s.mt : undefined}><PhotoPicker mode={mode} photos={photos} copy={post} /></View>
          </>
        ) : (
          <View style={s.details}>
            <Pressable onPress={() => goStep(1)} style={s.summary} accessibilityRole="button" accessibilityLabel="Edit photos">
              <View style={s.summaryThumbs}>
                {used.slice(0, 3).map((it, i) => <Photo key={it.id} uri={it.thumbUrl} style={[s.summaryThumb, { marginLeft: i ? -18 : 0, zIndex: 3 - i }]} />)}
              </View>
              <View style={s.grow}>
                <Text variant="small" weight="700">{subtitle}</Text>
                <Text variant="tiny" muted>{mode === 'before_after' ? 'Before first, then after' : used.length > 1 ? 'First photo is the cover' : 'Ready to post'}</Text>
              </View>
              <Text variant="small" color="accent" weight="700">Edit</Text>
            </Pressable>

            <CategoryField label="What is it?" value={categoryId} services={services} error={errors.category}
              onChange={(v) => { setCategoryId(v); if (errors.category) setErrors((e) => ({ ...e, category: undefined })) }} />
            <OccasionField value={occasion} onChange={setOccasion} occasions={occasions} />
            <TitleField value={title} onChange={(v) => { setTitle(v); if (errors.title) setErrors((e) => ({ ...e, title: undefined })) }} error={errors.title}
              placeholder={post.title} fallback={categoryId ? fallbackTitle : null} />
            {canCredit && <CreditsField value={credits} onChange={setCredits} exclude={[provider.id]} />}

            <Disclosure title="More details" badge="optional" summary={moreSummary || 'Caption, location, date'} open={openMore} onToggle={() => setOpenMore((o) => !o)}>
              <CaptionField value={caption} onChange={setCaption} placeholder={post.caption} />
              <PlaceDateFields location={place} onLocation={setPlace} shotOn={shotOn}
                onShotOn={(v) => { setShotOn(v); setDateTouched(true); if (errors.shotOn) setErrors((e) => ({ ...e, shotOn: undefined })) }}
                dateError={errors.shotOn} dateHint={!dateTouched && exifDate ? 'Date read from your photos.' : null} />
            </Disclosure>

            {post.showCamera && (
              <Disclosure title="Camera settings" badge={fields.length ? `${shownCount} of ${fields.length} shown` : undefined}
                summary={fields.length ? settingsSummary(fields, hidden) || 'All hidden' : 'None found in these photos'}
                open={openCamera} onToggle={() => setOpenCamera((o) => !o)}>
                <CameraSettings fields={fields} hidden={hidden} onToggle={toggleHidden} />
              </Disclosure>
            )}

            <View style={s.trust}>
              <View style={s.inline}><MapPinOff size={14} color={c.muted} /><Text variant="tiny" muted style={s.grow}>GPS location is never read, and it’s stripped from what clients see.</Text></View>
              <View style={s.inline}><Lock size={14} color={c.muted} /><Text variant="tiny" muted style={s.grow}>Your full-size originals are stored privately.</Text></View>
            </View>
          </View>
        )}
      </ScrollView>

      <Sheet open={!!discarding} onClose={() => setDiscarding(null)} title="Discard this post?">
        <Text variant="small" muted>The photos and details you’ve added won’t be saved.</Text>
        <View style={s.sheetActions}>
          <Button title="Discard" variant="danger" block onPress={() => {
            const go = discarding
            setDiscarding(null)
            photos.reset()
            guard.current = 'none'
            go?.()
          }} />
          <Button title="Keep editing" variant="ghost" block onPress={() => setDiscarding(null)} />
        </View>
      </Sheet>
    </Frame>
  )
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.c.bg },
  flex: { flex: 1 },
  grow: { flex: 1, minWidth: 0 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mt: { marginTop: t.space.md },
  topbar: { flexDirection: 'row', alignItems: 'center', height: 52, paddingHorizontal: t.space.xs, borderBottomWidth: 1, borderBottomColor: t.c.line },
  side: { width: 48 },
  iconBtn: { padding: 6 },
  titleWrap: { flex: 1, alignItems: 'center' },
  footer: { paddingHorizontal: t.space.lg, paddingTop: 12, borderTopWidth: 1, borderTopColor: t.c.line, backgroundColor: t.c.bg },
  steps: { flexDirection: 'row', gap: 8, paddingHorizontal: t.space.lg, paddingTop: t.space.sm },
  step: { flex: 1, gap: 4 },
  stepBar: { height: 3, borderRadius: 2, backgroundColor: t.c.line },
  stepOn: { backgroundColor: t.c.accent },
  listing: { paddingHorizontal: t.space.lg, paddingTop: t.space.sm },
  body: { padding: t.space.lg, paddingBottom: t.space.xxl },
  details: { gap: t.space.md },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: t.radius.lg, borderWidth: 1, borderColor: t.c.line },
  summaryThumbs: { flexDirection: 'row' },
  summaryThumb: { width: 44, height: 44, borderRadius: 8, borderWidth: 2, borderColor: t.c.bg },
  trust: { gap: 6, padding: 12, borderRadius: t.radius.md, backgroundColor: t.c.soft },
  sheetActions: { gap: 8, marginTop: t.space.md },
  uv: { padding: t.space.xl, gap: 12, alignItems: 'center' },
  uvIcon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  uvText: { maxWidth: 320 },
  uvGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignSelf: 'stretch' },
  uvExample: { width: '48%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: t.radius.md, borderWidth: 1, borderColor: t.c.line },
  uvActions: { alignSelf: 'stretch', gap: 8, marginTop: 4 },
  uvLink: { alignSelf: 'center' },
}))
