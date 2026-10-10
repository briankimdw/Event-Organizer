// /upload: native port of frontend/src/screens/Upload.jsx. Post work to your
// portfolio: 1) photos (expo-image-picker multi-select, order, cover; or a
// before/after pair), 2) details (title, category, caption, place, date, camera
// settings), then posting through the shared api/portfolio.js postAlbum() with
// per-photo progress. The first time, it sets up a photography listing; with several
// listings, photos go to the one selected on the Me tab.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useNavigation, useRouter } from 'expo-router'
import { ChevronLeft, Lock, MapPinOff, X } from 'lucide-react-native'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

import { invalidate } from '@shared/api/catalog.js'
import { getMyProvider, getProviderServiceIds, getServicesOf, postAlbum } from '@shared/api/portfolio.js'
import { Button, ErrorState, KeyboardView, Loading, Photo, Segmented, Sheet, SignInPrompt, Text } from '@/components'
import { useAuth } from '@/state/auth'
import { useStore } from '@/state/store'
import { makeStyles, useTheme } from '@/theme'
import { ListingSetup } from './NewListing'
import PhotoPicker, { type PickMode } from './upload/PhotoPicker'
import { CameraSettings, CaptionField, CategoryField, Disclosure, PlaceDateFields, TitleField, prettyDay, readFields, settingsSummary, useHiddenSet, validatePost } from './upload/PostFields'
import { PostFailed, Posted, Posting, type PhotoProgress } from './upload/PostingStatus'
import usePhotoItems, { type PhotoItem } from './upload/usePhotoItems'

const lastCategoryKey = (providerId: string) => `pm:last-category:${providerId}`

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
  const [provider, setProvider] = useState<any | null | undefined>(undefined) // undefined = loading, null = none yet
  const [loadError, setLoadError] = useState<Error | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!user) return
    let live = true
    setLoadError(null)
    getMyProvider(user.id, selectedId as any)
      .then((p) => live && setProvider(p))
      .catch((e) => live && setLoadError(e))
    return () => { live = false }
  }, [user, tick, selectedId])

  if (!loading && !user) {
    return <Frame title="New post"><SignInPrompt title="Sign in to post your work" text="Share your work on your profile so clients can find and book you." /></Frame>
  }
  if (loadError) return <Frame title="New post"><ErrorState error={loadError} onRetry={() => setTick((t) => t + 1)} /></Frame>
  if (loading || provider === undefined || !user) return <Frame title="New post"><Loading /></Frame>
  if (provider === null) return <ListingSetup initialVertical="photography" lockVertical title="Become a photographer" onDone={setProvider} />
  return <Composer provider={provider} userId={user.id} />
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

function Composer({ provider, userId }: { provider: any; userId: string }) {
  const s = useStyles()
  const { c } = useTheme()
  const router = useRouter()
  const navigation = useNavigation()
  const photos = usePhotoItems()
  const { items } = photos
  const scroller = useRef<ScrollView>(null)

  const [step, setStep] = useState<1 | 2>(1)
  const [phase, setPhase] = useState<'edit' | 'posting' | 'done' | 'failed'>('edit')
  const [mode, setMode] = useState<PickMode>('photos')
  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
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

  // Categories, and a sensible default: the last one used, or the only one offered.
  useEffect(() => {
    let live = true
    Promise.all([getServicesOf(provider.vertical || 'photography'), getProviderServiceIds(provider.id).catch(() => []), AsyncStorage.getItem(lastCategoryKey(provider.id)).catch(() => null)])
      .then(([all, mine, last]: [any[], string[], string | null]) => {
        if (!live) return
        setServices([...all.filter((x) => mine.includes(x.id)), ...all.filter((x) => !mine.includes(x.id))])
        const pick = all.some((x) => x.id === last) ? last : mine.length === 1 ? mine[0] : null
        if (pick) setCategoryId((cur) => cur ?? pick)
      })
      .catch(() => live && setServices([]))
    return () => { live = false }
  }, [provider.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // The photos in this post (before/after uses the first two).
  const used = mode === 'before_after' ? items.slice(0, 2) : items
  const ready = used.length > 0 && used.every((i) => i.status === 'ready')
  const canContinue = ready && (mode === 'before_after' ? used.length === 2 : true)
  const kindLabel = mode === 'before_after' ? 'before & after' : used.length === 1 ? 'photo' : 'album'

  // Shoot date from the photos (earliest), unless you've set it yourself.
  const exifDate = useMemo(() => used.map((i) => i.settings?.taken_on).filter(Boolean).sort()[0] || '', [used])
  useEffect(() => {
    if (!dateTouched) setShotOn(exifDate)
  }, [exifDate, dateTouched])
  const fields = useMemo(() => readFields(used), [used])

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

  const post = async () => {
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
        title: title.trim(),
        caption: caption.trim(),
        location: place.trim(),
        shotOn,
        categoryId,
        files,
        hiddenFields: [...hidden],
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
          {phase === 'failed' && <PostFailed error={posting.error} onRetry={post} onEdit={() => setPhase('edit')} />}
        </ScrollView>
      </Frame>
    )
  }

  const subtitle = used.length ? (mode === 'before_after' ? 'Before & after' : used.length === 1 ? 'Single photo' : `Album · ${used.length} photos`) : null
  const moreSummary = [place.trim(), prettyDay(shotOn), caption.trim() && 'caption added'].filter(Boolean).join(' · ')
  const shownCount = fields.filter((f) => !hidden.has(f.key)).length
  const footer = step === 2 ? (
    <Button title={`Post ${kindLabel}`} variant="accent" block onPress={post} />
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
      <ScrollView ref={scroller} style={s.flex} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {step === 1 ? (
          <>
            <Segmented<PickMode>
              options={[{ value: 'photos', label: 'Photos' }, { value: 'before_after', label: 'Before / After' }]}
              value={mode}
              onChange={(m) => { setMode(m); photos.clearNotice() }}
            />
            <View style={s.mt}><PhotoPicker mode={mode} photos={photos} /></View>
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

            <TitleField value={title} onChange={(v) => { setTitle(v); if (errors.title) setErrors((e) => ({ ...e, title: undefined })) }} error={errors.title}
              placeholder={used.length > 1 ? 'e.g. Nguyen–Park wedding' : 'e.g. Golden hour portrait'} />
            <CategoryField value={categoryId} services={services} error={errors.category}
              onChange={(v) => { setCategoryId(v); if (errors.category) setErrors((e) => ({ ...e, category: undefined })) }} />

            <Disclosure title="More details" badge="optional" summary={moreSummary || 'Caption, location, date'} open={openMore} onToggle={() => setOpenMore((o) => !o)}>
              <CaptionField value={caption} onChange={setCaption} />
              <PlaceDateFields location={place} onLocation={setPlace} shotOn={shotOn}
                onShotOn={(v) => { setShotOn(v); setDateTouched(true); if (errors.shotOn) setErrors((e) => ({ ...e, shotOn: undefined })) }}
                dateError={errors.shotOn} dateHint={!dateTouched && exifDate ? 'Date read from your photos.' : null} />
            </Disclosure>

            <Disclosure title="Camera settings" badge={fields.length ? `${shownCount} of ${fields.length} shown` : undefined}
              summary={fields.length ? settingsSummary(fields, hidden) || 'All hidden' : 'None found in these photos'}
              open={openCamera} onToggle={() => setOpenCamera((o) => !o)}>
              <CameraSettings fields={fields} hidden={hidden} onToggle={toggleHidden} />
            </Disclosure>

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
  body: { padding: t.space.lg, paddingBottom: t.space.xxl },
  details: { gap: t.space.md },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: t.radius.lg, borderWidth: 1, borderColor: t.c.line },
  summaryThumbs: { flexDirection: 'row' },
  summaryThumb: { width: 44, height: 44, borderRadius: 8, borderWidth: 2, borderColor: t.c.bg },
  trust: { gap: 6, padding: 12, borderRadius: t.radius.md, backgroundColor: t.c.soft },
  sheetActions: { gap: 8, marginTop: t.space.md },
}))
