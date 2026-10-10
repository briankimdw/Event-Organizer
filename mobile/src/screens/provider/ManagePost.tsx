// Owner-only sheets for a post (native port of the web's components/upload/ManagePost.jsx):
// a small menu, the edit form and the delete confirmation. sheet: null | 'menu' | 'edit' | 'delete'.
// album: a viewer album (toViewerAlbum). onUpdated(viewerAlbum), onDeleted(albumId).
import { Pencil, Trash2 } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import { View } from 'react-native'

import { invalidate } from '@shared/api/catalog.js'
import { creditsSupported, deleteAlbum, getServicesOf, toViewerAlbum, updateAlbum } from '@shared/api/portfolio.js'
import { autoPostTitle, getOccasion, occasionsFor, postConfig } from '@shared/verticals/index.js'
import { Button, Photo, Sheet, Text } from '@/components'
import { useStore } from '@/state/store'
import { makeStyles } from '@/theme'
import { FormError, Group, ListRow } from '../account/ui'
import { CreditsField, type CreditItem } from './upload/Credits'
import { CaptionField, CategoryField, OccasionField, PlaceDateFields, TitleField, validatePost } from './upload/PostFields'

export type ViewerAlbum = ReturnType<typeof toViewerAlbum>
export type ManageSheet = null | 'menu' | 'edit' | 'delete'

type Props = { album: ViewerAlbum; vertical?: string; sheet: ManageSheet; setSheet: (s: ManageSheet) => void; onUpdated: (a: ViewerAlbum) => void; onDeleted: (id: string) => void }

export default function ManagePostSheets({ album, vertical, sheet, setSheet, onUpdated, onDeleted }: Props) {
  const { myProviders } = useStore()
  // The listing's vertical: given, else looked up in your listings (photography by default).
  const slug: string = vertical || (myProviders as any[])?.find((p) => p.id === album.providerId)?.vertical || 'photography'
  const close = () => setSheet(null)
  // Switch sheets after the current one has closed (iOS can't swap modals mid-animation).
  const swap = (next: ManageSheet) => {
    setSheet(null)
    setTimeout(() => setSheet(next), 350)
  }
  return (
    <>
      <Sheet open={sheet === 'menu'} onClose={close} title="Your post">
        <Group>
          <ListRow icon={Pencil} title="Edit details" sub="Category, occasion, title, credits, caption…" onPress={() => swap('edit')} />
          <ListRow icon={Trash2} title="Delete post" danger chevron={false} onPress={() => swap('delete')} />
        </Group>
      </Sheet>
      {sheet === 'edit' && <EditSheet album={album} vertical={slug} onClose={close} onSaved={(a) => { onUpdated(a); close() }} />}
      {sheet === 'delete' && <DeleteSheet album={album} onClose={close} onDeleted={(id) => { close(); onDeleted(id) }} />}
    </>
  )
}

function EditSheet({ album, vertical = 'photography', onClose, onSaved }: { album: ViewerAlbum; vertical?: string; onClose: () => void; onSaved: (a: ViewerAlbum) => void }) {
  const s = useStyles()
  const { toast } = useStore()
  const [title, setTitle] = useState(album.title || '')
  const [categoryId, setCategoryId] = useState<string | null>(album.categoryId ?? null)
  const [occasion, setOccasion] = useState<string | null>(album.occasion?.slug ?? null)
  const [credits, setCredits] = useState<CreditItem[]>((album.credits || []) as CreditItem[])
  const [canCredit, setCanCredit] = useState(false)
  const post = postConfig(vertical)
  const [caption, setCaption] = useState(album.caption || '')
  const [place, setPlace] = useState(album.location || '')
  const [shotOn, setShotOn] = useState(album.shotOn || '')
  const [services, setServices] = useState<{ id: string; name: string }[] | null>(null)
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getServicesOf(vertical).then(setServices).catch(() => setServices([]))
    creditsSupported().then((ok: boolean) => setCanCredit(ok)).catch(() => {})
  }, [vertical])

  const fallbackTitle: string = autoPostTitle({ service: services?.find((x) => x.id === categoryId)?.name, occasion: occasion ? getOccasion(occasion)?.name : null, slug: vertical } as any)

  const save = async () => {
    const errs = validatePost({ title, categoryId, shotOn })
    if (!album.categoryId) delete errs.category // older posts may have none; don't block a quick fix
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    setError('')
    try {
      const row = await updateAlbum(album.id, {
        title: title.trim() || fallbackTitle, caption, location: place, shotOn, categoryId, occasion,
        ...(canCredit ? { credits } : {}),
      } as any)
      invalidate('providers')
      toast('Changes saved')
      onSaved(toViewerAlbum(row))
    } catch (err: any) {
      setError(err?.message || 'Couldn’t save. Try again.')
      setBusy(false)
    }
  }

  return (
    <Sheet open onClose={busy ? () => {} : onClose} title="Edit post">
      <View style={s.form}>
        <CategoryField label="What is it?" value={categoryId} onChange={setCategoryId} services={services} error={errors.category} />
        <OccasionField value={occasion} onChange={setOccasion} occasions={occasionsFor(vertical)} />
        <TitleField value={title} onChange={setTitle} error={errors.title} placeholder={post.title} fallback={categoryId ? fallbackTitle : null} />
        {canCredit && <CreditsField value={credits} onChange={setCredits} exclude={[album.providerId]} />}
        <CaptionField value={caption} onChange={setCaption} placeholder={post.caption} />
        <PlaceDateFields location={place} onLocation={setPlace} shotOn={shotOn} onShotOn={setShotOn} dateError={errors.shotOn} />
        {!!error && <FormError>{error}</FormError>}
        <Button title={busy ? 'Saving…' : 'Save changes'} variant="accent" block onPress={save} disabled={busy} />
        <Button title="Cancel" variant="ghost" block onPress={onClose} disabled={busy} />
      </View>
    </Sheet>
  )
}

function DeleteSheet({ album, onClose, onDeleted }: { album: ViewerAlbum; onClose: () => void; onDeleted: (id: string) => void }) {
  const s = useStyles()
  const { toast } = useStore()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const count = album.photoCount ?? album.photos?.length ?? 0
  const what = album.type === 'beforeafter' ? 'before & after pair' : count === 1 ? 'photo' : `${count} photos`

  const remove = async () => {
    setBusy(true)
    setError('')
    try {
      await deleteAlbum(album.id)
      invalidate('providers')
      toast('Post deleted')
      onDeleted(album.id)
    } catch (err: any) {
      setError(err?.message || 'Couldn’t delete. Try again.')
      setBusy(false)
    }
  }

  return (
    <Sheet open onClose={busy ? () => {} : onClose} title="Delete this post?">
      <View style={s.del}>
        {!!album.cover && <Photo uri={album.cover} style={s.delImg} />}
        <View style={s.grow}>
          <Text variant="small" weight="700">{album.title}</Text>
          <Text variant="tiny" muted>The {what} will be removed from your portfolio for good. This can’t be undone.</Text>
        </View>
      </View>
      {!!error && <FormError>{error}</FormError>}
      <View style={s.form}>
        <Button title={busy ? 'Deleting…' : 'Delete post'} variant="danger" block onPress={remove} disabled={busy} />
        <Button title="Cancel" variant="ghost" block onPress={onClose} disabled={busy} />
      </View>
    </Sheet>
  )
}

const useStyles = makeStyles((t) => ({
  form: { gap: t.space.md, marginTop: t.space.sm },
  grow: { flex: 1 },
  del: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  delImg: { width: 64, height: 64, borderRadius: 10 },
}))
