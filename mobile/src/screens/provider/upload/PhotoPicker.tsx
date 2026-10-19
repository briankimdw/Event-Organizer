// Step 1 of posting: the photos. Pick from the library (multi-select in tap order) or take one
// with the camera; thumbnails show at once. The selected photo shows large with its hints (low
// resolution, large file, looks like a duplicate) and tools: Edit (the photo editor), Make
// cover, Remove, Move earlier / later. Below it, every photo in a grid you put in order by
// holding and dragging (or with the tile's screen-reader actions). The first photo is the cover.
//
// Before & after mode has two slots (before, after) you can fill, edit, swap or replace, a live
// preview with the slider once both are in, and "Make one from a single photo" (opens the
// editor with "Post as before & after" on: the untouched photo is the before, your edit the after).
import * as ImagePicker from 'expo-image-picker'
import { AlertCircle, ArrowLeftRight, Camera, ChevronLeft, ChevronRight, ImagePlus, Images, Plus, SlidersHorizontal, Star, Trash2, Wand2, X } from 'lucide-react-native'
import { useState } from 'react'
import { ActivityIndicator, Platform, Pressable, View } from 'react-native'

import { BeforeAfter } from '@/components/BeforeAfter'
import { Button, Chip, ChipRow, Photo, Text } from '@/components'
import { MAX_FILE_BYTES, MAX_PHOTOS, formatBytes } from '@/shims/images'
import { useStore } from '@/state/store'
import { makeStyles, useTheme } from '@/theme'
import { SortableGrid } from './SortableGrid'
import { hintsOf, type PickedAsset, type PhotoItem, type PhotoItems } from './usePhotoItems'

export type PickMode = 'photos' | 'before_after'

const PICK_OPTIONS = { mediaTypes: ['images'] as ImagePicker.MediaType[], exif: true, quality: 1 } // EXIF for camera settings; GPS is never read from it

// Open the photo library. limit: how many can still be added (multi-select when > 1).
async function pickFromLibrary(limit: number): Promise<PickedAsset[] | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    ...PICK_OPTIONS,
    allowsMultipleSelection: limit > 1,
    selectionLimit: Math.max(1, limit),
    orderedSelection: true,
  })
  if (result.canceled) return null
  return result.assets as PickedAsset[]
}

async function takePhoto(): Promise<PickedAsset[] | null> {
  if (Platform.OS !== 'web') {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) throw new Error('Allow camera access in Settings to take a photo here.')
  }
  const result = await ImagePicker.launchCameraAsync(PICK_OPTIONS)
  if (result.canceled) return null
  return result.assets as PickedAsset[]
}

type Props = {
  mode: PickMode
  photos: PhotoItems
  copy?: { headline: string; prompts: string[] } | null
  onEdit: (item: PhotoItem, opts?: { beforeAfter?: boolean }) => void
  onDragging?: (on: boolean) => void
  /** Open the editor (before & after on) on the first photo as soon as it's ready. */
  onEditWhenReady?: () => void
}

export default function PhotoPicker({ mode, photos, copy, onEdit, onDragging, onEditWhenReady }: Props) {
  const s = useStyles()
  const { c } = useTheme()
  const { toast } = useStore()
  const { items, rejected, notice, add, dismissRejected } = photos
  const max = mode === 'before_after' ? 2 : MAX_PHOTOS

  const open = async (source: 'library' | 'camera', at?: number) => {
    try {
      const room = at != null ? 1 : Math.max(1, max - items.length)
      const assets = source === 'camera' ? await takePhoto() : await pickFromLibrary(room)
      if (assets) add(assets, { max, at })
    } catch (e: any) {
      console.warn(e)
      toast(e?.message || (source === 'camera' ? 'Couldn’t open the camera.' : 'Couldn’t open your photos.'))
    }
  }

  // Before & after from one photo: pick it, then the editor (with "Post as before & after" on).
  const fromOne = async () => {
    try {
      const assets = await pickFromLibrary(1)
      if (!assets?.length) return
      photos.reset()
      add(assets, { max: 2 })
      onEditWhenReady?.() // the editor opens once the photo has been read
    } catch (e: any) {
      toast(e?.message || 'Couldn’t open your photos.')
    }
  }

  return (
    <View>
      {(!!notice || rejected.length > 0) && (
        <View style={s.alerts}>
          {!!notice && <View style={s.notice}><Text variant="small">{notice}</Text></View>}
          {rejected.map((r) => (
            <View key={r.id} style={s.rejected} accessibilityRole="alert">
              <AlertCircle size={16} color={c.danger} />
              <View style={s.grow}>
                <Text variant="small" weight="600" numberOfLines={1}>{r.name}</Text>
                <Text variant="tiny">{r.reason}</Text>
              </View>
              <Pressable onPress={() => dismissRejected(r.id)} hitSlop={15} accessibilityRole="button" accessibilityLabel={`Dismiss ${r.name}`}><X size={14} color={c.ink} /></Pressable>
            </View>
          ))}
        </View>
      )}

      {items.length === 0 ? (
        <View style={s.drop}>
          <View style={s.dropIcon}>{mode === 'before_after' ? <ArrowLeftRight size={26} color={c.accent} /> : <ImagePlus size={26} color={c.accent} />}</View>
          <Text variant="h3" center>{mode === 'before_after' ? 'Show your edit' : copy?.headline || 'Add photos'}</Text>
          <Text variant="small" muted center>
            {mode === 'before_after'
              ? 'Clients drag a slider between the two. Use one photo and edit it here, or pick a before and an after.'
              : `One photo, or up to ${MAX_PHOTOS} from the same shoot. Pick them in the order you want.`}
          </Text>
          {mode === 'before_after' ? (
            <View style={s.dropActions}>
              <Button title="Edit one photo" icon={Wand2} variant="accent" onPress={fromOne} />
              <Button title="Pick before & after" icon={Images} variant="ghost" onPress={() => open('library')} />
            </View>
          ) : (
            <View style={s.dropActions}>
              <Button title="Choose photos" icon={Images} variant="accent" onPress={() => open('library')} />
              <Button title="Take a photo" icon={Camera} variant="ghost" onPress={() => open('camera')} />
            </View>
          )}
          <Text variant="tiny" muted center>JPEG, PNG, WebP or HEIC · up to {formatBytes(MAX_FILE_BYTES)} each</Text>
        </View>
      ) : mode === 'before_after' ? (
        <BeforeAfterSlots photos={photos} onPick={(i) => open('library', i)} onEdit={onEdit} />
      ) : (
        <PhotoGrid photos={photos} onAdd={open} onEdit={onEdit} onDragging={onDragging} />
      )}
      {items.length === 0 && mode !== 'before_after' && !!copy?.prompts?.length && (
        <View style={s.ideas}>
          <Text variant="tiny" muted>Ideas</Text>
          <ChipRow>{copy.prompts.map((t) => <Chip key={t} label={t} />)}</ChipRow>
        </View>
      )}
    </View>
  )
}

function Hero({ item, label, onEdit }: { item: PhotoItem; label: string | null; onEdit?: () => void }) {
  const s = useStyles()
  const { c } = useTheme()
  const w = item.edit?.width || item.width
  const h = item.edit?.height || item.height
  const ratio = w && h ? Math.max(0.6, Math.min(1.6, w / h)) : 0.8
  return (
    <View style={[s.hero, { aspectRatio: ratio }]}>
      {item.status === 'loading' ? (
        <View style={s.heroLoading}><ActivityIndicator color={c.muted} /><Text variant="tiny" muted>Reading photo…</Text></View>
      ) : (
        <Photo uri={item.edit?.uri ?? item.asset.uri} style={s.fill} contentFit="cover" />
      )}
      {!!label && <View style={s.heroBadge}><Text variant="tiny" weight="700" style={s.white}>{label}</Text></View>}
      {!!item.edit && <View style={[s.heroBadge, s.heroBadgeLeft2]}><Text variant="tiny" weight="700" style={s.white}>Edited</Text></View>}
      {onEdit && item.status === 'ready' && (
        <Pressable onPress={onEdit} style={s.heroEdit} accessibilityRole="button" accessibilityLabel={item.edit ? 'Edit again' : 'Edit this photo'} hitSlop={6}>
          <SlidersHorizontal size={15} color="#111" />
          <Text variant="small" weight="700" style={{ color: '#111' }}>Edit</Text>
        </Pressable>
      )}
    </View>
  )
}

function Hints({ item, items }: { item: PhotoItem; items: PhotoItem[] }) {
  const s = useStyles()
  const hints = hintsOf(item, items)
  return (
    <View style={s.hints}>
      {hints.map((h) => (
        <View key={h.key} style={[s.hint, h.key === 'dup' && s.hintDup]}>
          <AlertCircle size={12} color="#fff" />
          <Text variant="tiny" weight="600" style={s.white}>{h.text}</Text>
        </View>
      ))}
      <ProcessedLine item={item} />
    </View>
  )
}

function ProcessedLine({ item }: { item: PhotoItem }) {
  if (item.status === 'loading') return null
  if (!item.processed) return <Text variant="tiny" muted>Preparing the version clients will see…</Text>
  const { width, height, size } = item.processed
  return <Text variant="tiny" muted>Clients see {width} × {height} · {formatBytes(size)} · location data removed</Text>
}

function Tool({ icon: Icon, label, onPress, disabled, danger, wide, fill }: {
  icon: typeof Star; label: string; onPress: () => void; disabled?: boolean; danger?: boolean; wide?: string; fill?: boolean
}) {
  const s = useStyles()
  const { c } = useTheme()
  const color = danger ? c.danger : c.ink
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} hitSlop={4}
      style={({ pressed }) => [s.tool, disabled && s.off, pressed && { opacity: 0.6 }]}>
      <Icon size={16} color={color} fill={fill ? color : 'none'} />
      {!!wide && <Text variant="small" weight="600" style={{ color }}>{wide}</Text>}
    </Pressable>
  )
}

const COLS = 4
const GAP = 6

function PhotoGrid({ photos, onAdd, onEdit, onDragging }: {
  photos: PhotoItems; onAdd: (source: 'library' | 'camera') => void; onEdit: Props['onEdit']; onDragging?: (on: boolean) => void
}) {
  const s = useStyles()
  const { c } = useTheme()
  const { items, remove, move, reorder } = photos
  const [selId, setSelId] = useState<string | null>(null)
  const [width, setWidth] = useState(0)
  const selIndex = Math.max(0, items.findIndex((i) => i.id === selId))
  const sel = items[selIndex]
  const last = items.length - 1
  if (!sel) return null
  const size = width ? Math.floor((width - GAP * (COLS - 1)) / COLS) : 0

  const removeOne = (id: string) => {
    const i = items.findIndex((x) => x.id === id)
    const next = items[i + 1] || items[i - 1]
    remove(id)
    if (id === sel.id) setSelId(next?.id ?? null)
  }

  return (
    <View>
      <Hero item={sel} label={items.length === 1 ? null : selIndex === 0 ? 'Cover' : `${selIndex + 1} of ${items.length}`} onEdit={() => onEdit(sel)} />
      <Hints item={sel} items={items} />
      <View style={s.tools}>
        <Tool icon={SlidersHorizontal} label={sel.edit ? 'Edit again' : 'Edit'} wide="Edit" onPress={() => onEdit(sel)} disabled={sel.status !== 'ready'} />
        {items.length > 1 && (
          <>
            <Tool icon={Star} label={selIndex === 0 ? 'Cover photo' : 'Make cover'} wide={selIndex === 0 ? 'Cover' : 'Cover'}
              fill={selIndex === 0} onPress={() => move(selIndex, 0)} disabled={selIndex === 0} />
            <Tool icon={ChevronLeft} label="Move earlier" onPress={() => move(selIndex, selIndex - 1)} disabled={selIndex === 0} />
            <Tool icon={ChevronRight} label="Move later" onPress={() => move(selIndex, selIndex + 1)} disabled={selIndex === last} />
          </>
        )}
        <View style={s.grow} />
        <Tool icon={Trash2} label="Remove this photo" danger onPress={() => removeOne(sel.id)} />
      </View>

      <View style={s.gridWrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {size > 0 && (
          <SortableGrid
            ids={items.map((i) => i.id)}
            columns={COLS}
            size={size}
            gap={GAP}
            onReorder={reorder}
            onPress={setSelId}
            onDragging={onDragging}
            a11yLabel={(id, i) => {
              const it = items.find((x) => x.id === id)!
              const hints = hintsOf(it, items).map((h) => h.text)
              return [`Photo ${i + 1} of ${items.length}`, i === 0 && 'cover', it.edit && 'edited', it.id === sel.id && 'selected', ...hints].filter(Boolean).join(', ')
            }}
            actions={() => [{ name: 'edit', label: 'Edit' }, { name: 'remove', label: 'Remove' }]}
            onAction={(id, _i, name) => {
              const it = items.find((x) => x.id === id)
              if (name === 'edit' && it) onEdit(it)
              else if (name === 'remove') removeOne(id)
            }}
            renderItem={(id, i) => {
              const it = items.find((x) => x.id === id)!
              const warn = it.dupOf ? c.danger : it.lowRes || it.huge ? c.warn : null
              return (
                <View style={[s.thumb, it.id === sel.id && s.thumbOn]}>
                  {it.thumbUrl || it.edit ? <Photo uri={it.edit?.uri ?? it.thumbUrl} style={s.fill} /> : <View style={[s.fill, s.thumbLoading]}><ActivityIndicator size="small" color={c.muted} /></View>}
                  <View style={s.num}>
                    {i === 0 ? <Star size={9} color="#fff" fill="#fff" /> : <Text variant="caption" style={s.white}>{i + 1}</Text>}
                  </View>
                  {!!it.edit && <View style={s.editDot}><SlidersHorizontal size={9} color="#fff" /></View>}
                  {!!warn && <View style={[s.warnDot, { backgroundColor: warn }]} />}
                </View>
              )
            }}
            trailing={items.length < MAX_PHOTOS ? (
              <Pressable onPress={() => onAdd('library')} style={[s.thumb, s.addThumb]} accessibilityRole="button" accessibilityLabel="Add more photos">
                <Plus size={22} color={c.ink} />
              </Pressable>
            ) : undefined}
          />
        )}
      </View>
      <View style={s.below}>
        <Text variant="tiny" muted style={s.grow}>
          {items.length === 1 ? 'Single photo · add more to make an album' : `${items.length} of ${MAX_PHOTOS} · hold and drag to reorder · the first is the cover`}
        </Text>
        {items.length < MAX_PHOTOS && <Button title="Camera" icon={Camera} variant="link" size="sm" onPress={() => onAdd('camera')} accessibilityLabel="Take a photo" />}
      </View>
    </View>
  )
}

function BeforeAfterSlots({ photos, onPick, onEdit }: { photos: PhotoItems; onPick: (i: number) => void; onEdit: Props['onEdit'] }) {
  const s = useStyles()
  const { c } = useTheme()
  const { items, remove, swapFirstTwo } = photos
  const [before, after] = items
  const extra = items.length - 2
  const ready = before?.status === 'ready' && after?.status === 'ready'
  const src = (it: PhotoItem) => it.edit?.uri ?? it.asset.uri

  const slot = (it: PhotoItem | undefined, i: number, label: string) => (
    <View style={s.slot}>
      <Text variant="label" style={s.slotLabel}>{label}</Text>
      {it ? (
        <View>
          <Pressable onPress={() => onPick(i)} style={s.slotImg} accessibilityRole="button" accessibilityLabel={`Replace the ${label.toLowerCase()} photo`}>
            {it.status === 'loading' ? <ActivityIndicator color={c.muted} /> : <Photo uri={src(it)} style={s.fill} />}
          </Pressable>
          <Pressable onPress={() => remove(it.id)} style={s.slotRemove} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove the ${label.toLowerCase()} photo`}>
            <X size={14} color="#fff" />
          </Pressable>
          {it.status === 'ready' && (
            <Pressable onPress={() => onEdit(it)} style={s.slotEdit} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Edit the ${label.toLowerCase()} photo`}>
              <SlidersHorizontal size={13} color="#111" />
              <Text variant="tiny" weight="700" style={{ color: '#111' }}>{it.edit ? 'Edited' : 'Edit'}</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <Pressable onPress={() => onPick(i)} style={[s.slotImg, s.slotEmpty]} accessibilityRole="button" accessibilityLabel={`Add the ${label.toLowerCase()} photo`}>
          <Plus size={20} color={c.ink} />
          <Text variant="small">Add {label.toLowerCase()}</Text>
        </Pressable>
      )}
    </View>
  )

  return (
    <View>
      {ready && (
        <View style={s.preview}>
          <BeforeAfter before={src(before)} after={src(after)} aspectRatio={Math.max(0.7, Math.min(1.4, (after.edit?.width || after.width) / (after.edit?.height || after.height) || 0.8))}
            demo rounded={14} accessibilityLabel="Preview" />
          <Text variant="tiny" muted style={s.mtSm}>Preview: this is what clients see. Drag the handle to compare.</Text>
        </View>
      )}
      <View style={s.slots}>
        {slot(before, 0, 'Before')}
        <Pressable onPress={swapFirstTwo} disabled={!after} style={[s.swap, !after && s.off]} accessibilityRole="button" accessibilityLabel="Swap before and after">
          <ArrowLeftRight size={16} color={c.ink} />
        </Pressable>
        {slot(after, 1, 'After')}
      </View>
      {before && !after && before.status === 'ready' && (
        <Button title="Make the after by editing this photo" icon={Wand2} variant="ghost" block onPress={() => onEdit(before, { beforeAfter: true })} style={s.mtSm} />
      )}
      {extra > 0 && <View style={[s.notice, s.mtSm]}><Text variant="small">Before / after uses the first 2 photos. Switch to Photos to post all {items.length}.</Text></View>}
      <Text variant="tiny" muted style={s.mtSm}>Tap a photo to replace it. Use ⇆ to swap them.</Text>
    </View>
  )
}

const useStyles = makeStyles((t) => ({
  grow: { flex: 1, minWidth: 0 },
  ideas: { gap: 6, marginTop: 14 },
  mtSm: { marginTop: t.space.sm },
  white: { color: '#fff' },
  fill: { width: '100%', height: '100%' },
  off: { opacity: 0.35 },
  alerts: { gap: 6, marginBottom: t.space.md },
  notice: { padding: 10, borderRadius: t.radius.md, backgroundColor: t.c.soft },
  rejected: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: t.radius.md, backgroundColor: t.c.dangerSoft },
  drop: {
    alignItems: 'center', gap: 10, paddingVertical: 32, paddingHorizontal: 18, borderRadius: t.radius.xl,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.c.line,
  },
  dropActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  dropIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: t.c.accentSoft, alignItems: 'center', justifyContent: 'center' },
  hero: { width: '100%', borderRadius: t.radius.lg, overflow: 'hidden', backgroundColor: t.c.soft },
  heroLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  heroBadge: { position: 'absolute', top: 10, left: 10, backgroundColor: t.c.overlay, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  heroBadgeLeft2: { top: 38 },
  heroEdit: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  hints: { gap: 4, marginTop: 8 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: '#b45309', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  hintDup: { backgroundColor: '#b91c1c' },
  tools: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: t.space.sm, marginBottom: t.space.sm },
  tool: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 36, borderRadius: 18, backgroundColor: t.c.soft },
  gridWrap: { width: '100%' },
  below: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  thumb: { width: '100%', height: '100%', borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent', backgroundColor: t.c.soft },
  thumbOn: { borderColor: t.c.accent },
  thumbLoading: { alignItems: 'center', justifyContent: 'center' },
  addThumb: { alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', borderColor: t.c.line },
  num: { position: 'absolute', top: 4, left: 4, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3, backgroundColor: t.c.overlay, alignItems: 'center', justifyContent: 'center' },
  editDot: { position: 'absolute', bottom: 4, left: 4, width: 16, height: 16, borderRadius: 8, backgroundColor: t.c.overlay, alignItems: 'center', justifyContent: 'center' },
  warnDot: { position: 'absolute', top: 5, right: 5, width: 9, height: 9, borderRadius: 5, borderWidth: 1, borderColor: '#fff' },
  preview: { marginBottom: t.space.md },
  slots: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  slot: { flex: 1 },
  slotLabel: { marginBottom: 4 },
  slotImg: { width: '100%', aspectRatio: 0.8, borderRadius: t.radius.lg, overflow: 'hidden', backgroundColor: t.c.soft, alignItems: 'center', justifyContent: 'center' },
  slotEmpty: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.c.line, gap: 4 },
  slotRemove: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: t.c.overlay, alignItems: 'center', justifyContent: 'center' },
  slotEdit: { position: 'absolute', bottom: 6, left: 6, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  swap: { width: 36, height: 36, borderRadius: 18, backgroundColor: t.c.soft, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
}))
