// The photos of one of your posts, editable in place (My work -> a post):
//   album: tap a photo to select it; hold and drag to reorder (the first is the cover); tools for the
//          selected photo: Edit (the photo editor on the private original + its saved recipe),
//          Studio (the layers editor on the public copy; a pixel edit, saved with recipe null),
//          Revert (back to the original), Replace (a new photo from the library), Make cover, Remove.
//   before & after: the comparison slider, then Edit / Revert / Replace for the before and the
//          after, and Swap.
// Data: the shared api/portfolio.js (getPostPhotos, reorderPostPhotos, setPostCover,
// replacePostPhoto, removePostPhoto, convertPost) and api/edits.js through ./postApi.
import * as ImagePicker from 'expo-image-picker'
import { ArrowLeftRight, ImageUp, Layers, RotateCcw, SlidersHorizontal, Star, Trash2 } from 'lucide-react-native'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Platform, Pressable, View } from 'react-native'

import { invalidate } from '@shared/api/catalog.js'
import { convertPost, getAlbum, getPostPhotos, removePostPhoto, replacePostPhoto, reorderPostPhotos, setPostCover, toViewerAlbum } from '@shared/api/portfolio.js'
import { BeforeAfter } from '@/components/BeforeAfter'
import { Button, ErrorState, Photo, Sheet, Text } from '@/components'
import { forgetBeforePhoto } from '@/lib/beforeAfter'
import { PhotoEditorModal, type PhotoEditorResult } from '@/screens/editor/PhotoEditor'
import { STUDIO_RECIPE_NOTE, studioUnavailableReason } from '@/screens/editor/studio/config'
import { StudioSheet, type StudioResult } from '@/screens/editor/studio/StudioSheet'
import { fileBlob, fileExtension, makeDisplayFile, readCameraSettings, toCompatible, type PickedPhoto } from '@/shims/images'
import { useStore } from '@/state/store'
import { makeStyles, useTheme } from '@/theme'
import { openForEdit, revertPhoto, saveReedit, saveStudioEdit } from './postApi'
import { SortableGrid } from './SortableGrid'

type Row = {
  id: string; album_id: string; position: number; display_path: string; original_path: string | null
  width: number | null; height: number | null; pair_role: string | null; exif_hidden?: string[] | null; edit_recipe: unknown | null; src: string
}
type ViewerAlbum = ReturnType<typeof toViewerAlbum>

const COLS = 4
const GAP = 6

export function PostPhotos({ album, userId, onUpdated }: { album: ViewerAlbum; userId: string; onUpdated: (a: ViewerAlbum) => void }) {
  const s = useStyles()
  const { c } = useTheme()
  const { toast } = useStore()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [selId, setSelId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null) // what's happening, e.g. "Saving your edit…"
  const [editing, setEditing] = useState<{ row: Row; url: string; recipe: any } | null>(null)
  const [studioFor, setStudioFor] = useState<{ row: Row; name: string } | null>(null) // Studio open on a posted photo
  const [confirmRemove, setConfirmRemove] = useState<Row | null>(null)
  const [width, setWidth] = useState(0)
  const ba = album.kind === 'before_after'

  const load = useCallback(async () => {
    setError(null)
    try {
      const list = (await getPostPhotos(album.id)) as Row[]
      setRows(list)
      return list
    } catch (e: any) {
      setError(e)
      return null
    }
  }, [album.id])
  useEffect(() => {
    load()
  }, [load])

  // After any change: fresh rows here, a fresh album for the viewer / grid.
  const refresh = async (message?: string) => {
    await load()
    invalidate('providers')
    forgetBeforePhoto(album.id)
    try {
      const row = await getAlbum(album.id)
      if (row) onUpdated(toViewerAlbum(row))
    } catch { /* the photos are saved either way */ }
    if (message) toast(message)
  }

  const run = async (label: string, work: () => Promise<unknown>, done?: string) => {
    setBusy(label)
    try {
      await work()
      await refresh(done)
    } catch (e: any) {
      console.warn(e)
      toast(e?.message || 'Something went wrong. Try again.')
    } finally {
      setBusy(null)
    }
  }

  if (error) return <ErrorState error={error} onRetry={load} />
  if (!rows) return <View style={s.loading}><ActivityIndicator color={c.muted} /></View>

  const sel = rows.find((r) => r.id === selId) ?? rows[0]
  const ids = rows.map((r) => r.id)
  const before = rows.find((r) => r.pair_role === 'before') ?? rows[0]
  const after = rows.find((r) => r.pair_role === 'after') ?? rows[1]

  const edit = async (row: Row) => {
    setBusy('Opening the original…')
    try {
      const src = await openForEdit(row.id)
      setEditing({ row, url: src.url, recipe: src.recipe })
    } catch (e: any) {
      toast(e?.message || 'Couldn’t open this photo.')
    } finally {
      setBusy(null)
    }
  }
  const onEdited = (r: PhotoEditorResult) => {
    const row = editing?.row
    setEditing(null)
    if (row) run('Saving your edit…', () => saveReedit(row.id, r), 'Edit saved')
  }
  // "Edit in Studio": the public copy (what clients see, with any slider edits in it) opens in Studio.
  // Saving is a pixel edit: recipe null replaces the slider recipe; the original stays private and
  // Revert still restores it.
  const openStudio = (row: Row, name: string) => {
    const reason = Platform.OS === 'web' ? null : studioUnavailableReason()
    if (reason) return Alert.alert('Studio isn’t available', reason)
    setStudioFor({ row, name })
  }
  const finishStudio = async (r: StudioResult) => {
    const row = studioFor?.row
    if (!row || !r.changed) return setStudioFor(null)
    await saveStudioEdit(row.id, r) // a throw keeps Studio open and shows the message
    setStudioFor(null)
    await run('Updating…', async () => {}, 'Studio edit saved')
  }
  const revert = (row: Row) => run('Going back to the original…', () => revertPhoto(row.id, row), 'Back to the original')
  const replace = async (row: Row) => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], exif: true, quality: 1 }).catch((e) => {
      toast(e?.message || 'Couldn’t open your photos.')
      return null
    })
    if (!res || res.canceled || !res.assets[0]) return
    run('Uploading the new photo…', async () => {
      const asset = await toCompatible(res.assets[0] as PickedPhoto)
      const display = await makeDisplayFile(asset)
      const [file, blob, settings] = await Promise.all([
        fileBlob(asset.uri, `photo.${fileExtension(asset)}`, asset.mimeType || 'image/jpeg'),
        fileBlob(display.uri, 'display.jpg', 'image/jpeg'),
        readCameraSettings(asset),
      ])
      await replacePostPhoto({ userId, albumId: album.id, photo: row, photos: rows, item: { file, display: { blob, width: display.width, height: display.height }, settings } } as any)
    }, 'Photo replaced')
  }
  const reorder = (next: string[]) => {
    if (next.join() === ids.join()) return
    setRows(next.map((id) => rows.find((r) => r.id === id)!)) // show it at once
    run('Saving the order…', () => reorderPostPhotos(album.id, next, { kind: album.kind } as any), 'Order saved')
  }
  const cover = (row: Row) => run('Saving…', () => setPostCover(album.id, ids, row.id), 'Cover set')
  const remove = (row: Row) => run('Removing…', () => removePostPhoto(album.id, row, rows), 'Photo removed')
  const swap = () => run('Swapping…', () => convertPost(album.id, 'before_after', { beforeId: after.id, afterId: before.id } as any), 'Swapped')

  const tools = (row: Row, label?: string) => (
    <View style={s.tools}>
      {!!label && <Text variant="label" style={s.toolLabel}>{label}</Text>}
      <Tool icon={SlidersHorizontal} text={row.edit_recipe ? 'Edit again' : 'Edit'} label={`${row.edit_recipe ? 'Edit again' : 'Edit'}${label ? ` the ${label.toLowerCase()}` : ''}`} onPress={() => edit(row)} />
      <Tool icon={Layers} text="Studio" label={`Edit${label ? ` the ${label.toLowerCase()}` : ' this photo'} in Studio`} onPress={() => openStudio(row, label || 'Photo')} />
      {(!!row.edit_recipe || !!row.original_path) && <Tool icon={RotateCcw} text="Revert" label={`Revert${label ? ` the ${label.toLowerCase()}` : ''} to the original`} onPress={() => revert(row)} />}
      <Tool icon={ImageUp} text="Replace" label={`Replace${label ? ` the ${label.toLowerCase()}` : ' this photo'}`} onPress={() => replace(row)} />
      {!ba && rows.length > 1 && (
        <>
          <Tool icon={Star} text={row.id === ids[0] ? 'Cover' : 'Make cover'} label="Make cover" onPress={() => cover(row)} disabled={row.id === ids[0]} fill={row.id === ids[0]} />
          <Tool icon={Trash2} label="Remove this photo" danger onPress={() => setConfirmRemove(row)} />
        </>
      )}
    </View>
  )

  const size = width ? Math.floor((width - GAP * (COLS - 1)) / COLS) : 0
  const ratio = (r?: Row) => (r?.width && r?.height ? Math.max(0.6, Math.min(1.6, r.width / r.height)) : 0.8)

  return (
    <View style={s.wrap}>
      {ba && before && after ? (
        <>
          <BeforeAfter before={before.src} after={after.src} aspectRatio={ratio(after)} rounded={14} accessibilityLabel={album.title} hint />
          {tools(before, 'Before')}
          {tools(after, 'After')}
          <Button title="Swap before and after" icon={ArrowLeftRight} variant="ghost" size="sm" onPress={swap} />
        </>
      ) : (
        <>
          <View style={[s.hero, { aspectRatio: ratio(sel) }]}>
            <Photo uri={sel?.src} style={s.fill} contentFit="cover" accessibilityLabel={`${album.title || 'Photo'}, photo ${ids.indexOf(sel.id) + 1} of ${rows.length}`} />
            {!!sel?.edit_recipe && <View style={s.badge}><Text variant="tiny" weight="700" style={s.white}>Edited</Text></View>}
          </View>
          {sel && tools(sel)}
          {rows.length > 1 && (
            <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
              {size > 0 && (
                <SortableGrid
                  ids={ids}
                  columns={COLS}
                  size={size}
                  gap={GAP}
                  onReorder={reorder}
                  onPress={setSelId}
                  a11yLabel={(id, i) => `Photo ${i + 1} of ${ids.length}${i === 0 ? ', cover' : ''}${rows.find((r) => r.id === id)?.edit_recipe ? ', edited' : ''}${id === sel.id ? ', selected' : ''}`}
                  actions={() => [{ name: 'edit', label: 'Edit' }]}
                  onAction={(id, _i, name) => {
                    const row = rows.find((r) => r.id === id)
                    if (row && name === 'edit') edit(row)
                  }}
                  renderItem={(id, i) => {
                    const r = rows.find((x) => x.id === id)!
                    return (
                      <View style={[s.thumb, id === sel.id && s.thumbOn]}>
                        <Photo uri={r.src} style={s.fill} />
                        <View style={s.num}>{i === 0 ? <Star size={9} color="#fff" fill="#fff" /> : <Text variant="caption" style={s.white}>{i + 1}</Text>}</View>
                      </View>
                    )
                  }}
                />
              )}
              <Text variant="tiny" muted style={s.mt}>Hold and drag to reorder · the first photo is the cover</Text>
            </View>
          )}
        </>
      )}

      <Text variant="tiny" muted>
        Studio (layers, brushes, clone, text) saves a pixel edit that replaces the slider edits. Edit starts again from your original, and Revert brings the original back.
      </Text>

      {!!busy && (
        <View style={s.busy} accessibilityLiveRegion="polite" accessibilityLabel={busy}>
          <ActivityIndicator color={c.ink} />
          <Text variant="small" weight="600">{busy}</Text>
        </View>
      )}

      {!!editing && (
        <PhotoEditorModal
          visible
          source={{ uri: editing.url, width: editing.row.width ?? undefined, height: editing.row.height ?? undefined }}
          initialRecipe={editing.recipe}
          mode="reedit"
          onDone={onEdited}
          onCancel={() => setEditing(null)}
        />
      )}

      {!!studioFor && (
        <StudioSheet
          visible
          source={{ uri: studioFor.row.src, width: studioFor.row.width ?? undefined, height: studioFor.row.height ?? undefined }}
          name={studioFor.name}
          doneLabel="Save"
          note={STUDIO_RECIPE_NOTE}
          onDone={finishStudio}
          onCancel={() => setStudioFor(null)}
        />
      )}

      <Sheet open={!!confirmRemove} onClose={() => setConfirmRemove(null)} title="Remove this photo?">
        <Text variant="small" muted>It’s taken out of this post for good.</Text>
        <View style={s.sheetActions}>
          <Button title="Remove photo" variant="danger" block onPress={() => { const r = confirmRemove; setConfirmRemove(null); if (r) remove(r) }} />
          <Button title="Keep it" variant="ghost" block onPress={() => setConfirmRemove(null)} />
        </View>
      </Sheet>
    </View>
  )
}

function Tool({ icon: Icon, label, text, onPress, disabled, danger, fill }: {
  icon: typeof Star; label: string; text?: string; onPress: () => void; disabled?: boolean; danger?: boolean; fill?: boolean
}) {
  const s = useStyles()
  const { c } = useTheme()
  const color = danger ? c.danger : c.ink
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} hitSlop={4}
      style={({ pressed }) => [s.tool, disabled && s.off, pressed && { opacity: 0.6 }]}>
      <Icon size={15} color={color} fill={fill ? color : 'none'} />
      {!!text && <Text variant="small" weight="600" style={{ color }}>{text}</Text>}
    </Pressable>
  )
}

const useStyles = makeStyles((t) => ({
  wrap: { paddingHorizontal: t.space.lg, paddingTop: t.space.sm, gap: t.space.sm },
  loading: { padding: t.space.xl, alignItems: 'center' },
  fill: { width: '100%', height: '100%' },
  white: { color: '#fff' },
  off: { opacity: 0.35 },
  mt: { marginTop: 6 },
  hero: { width: '100%', borderRadius: t.radius.lg, overflow: 'hidden', backgroundColor: t.c.soft },
  badge: { position: 'absolute', top: 10, left: 10, backgroundColor: t.c.overlay, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  tools: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  toolLabel: { width: 52 },
  tool: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 34, borderRadius: 17, backgroundColor: t.c.soft },
  thumb: { width: '100%', height: '100%', borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent', backgroundColor: t.c.soft },
  thumbOn: { borderColor: t.c.accent },
  num: { position: 'absolute', top: 4, left: 4, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3, backgroundColor: t.c.overlay, alignItems: 'center', justifyContent: 'center' },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: t.radius.md, backgroundColor: t.c.soft },
  sheetActions: { gap: 8, marginTop: t.space.md },
}))
