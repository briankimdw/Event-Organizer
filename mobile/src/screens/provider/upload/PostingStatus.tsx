// While posting / posted / failed, for one upload-queue job (uploadQueue.ts).
//   <JobStatus job />     per-photo progress, retry, cancel; "you can leave this screen"
//   <Posted job />        View post / Share / Post another (a before & after shows its slider)
//   <QueueBanner />       a slim "Posting 2 of 5…" / "Paused" / "Couldn't post" line for other screens
import { useRouter } from 'expo-router'
import { AlertCircle, Check, CloudOff, RotateCcw, Send, Sparkles, X } from 'lucide-react-native'
import { useState } from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'

import { BeforeAfter } from '@/components/BeforeAfter'
import { ShareSheet } from '@/components/share/ShareSheet'
import { Button, Photo, Sheet, Text } from '@/components'
import { makeStyles, useTheme } from '@/theme'
import { cancelJob, jobFraction, retryJob, type Job, type QPhoto } from './uploadQueue'

const kindLabel = (j: Job) => (j.kind === 'before_after' ? 'before & after' : 'post')
const stageText = (p: QPhoto) =>
  p.stage === 'done' ? 'Done' : p.stage === 'failed' ? p.error || 'Didn’t upload' : p.stage === 'saving' ? 'Saving…' : p.stage === 'uploading' ? `${Math.round(p.fraction * 100)}%` : 'Waiting'

export function JobStatus({ job, onEdit }: { job: Job; onEdit?: () => void }) {
  const s = useStyles()
  const { c } = useTheme()
  const [confirm, setConfirm] = useState(false)
  const done = job.photos.filter((p) => p.stage === 'done').length
  const pct = Math.round(jobFraction(job) * 100)
  const cover = job.photos[job.kind === 'before_after' ? 1 : 0] ?? job.photos[0]
  const failed = job.status === 'failed'
  const paused = job.status === 'paused'
  const n = job.photos.length

  return (
    <View style={s.wrap} accessibilityLiveRegion="polite">
      <View style={s.cover}>{!!cover?.thumb && <Photo uri={cover.thumb} style={s.fill} />}</View>
      <Text variant="h3" center>
        {failed ? (job.offline ? 'Waiting for a connection' : 'Couldn’t finish posting') : paused ? 'Paused' : job.status === 'cancelling' ? 'Cancelling…' : `Sharing your ${kindLabel(job)}…`}
      </Text>
      <Text variant="small" muted center>
        {failed || paused
          ? `${done} of ${n} photo${n === 1 ? '' : 's'} uploaded · ${pct}%`
          : done === n ? 'Finishing up…' : `${n > 1 ? `Photo ${Math.min(done + 1, n)} of ${n} · ` : ''}${pct}%`}
      </Text>
      <View style={s.bar} accessibilityRole="progressbar" accessibilityLabel="Posting" accessibilityValue={{ min: 0, max: 100, now: pct }}>
        <View style={[s.barFill, { width: `${Math.max(2, pct)}%` }, failed && { backgroundColor: c.warn }]} />
      </View>
      {!!job.error && failed && (
        <View style={[s.note, { backgroundColor: job.offline ? c.soft : c.dangerSoft }]} accessibilityRole="alert">
          {job.offline ? <CloudOff size={16} color={c.ink} /> : <AlertCircle size={16} color={c.danger} />}
          <Text variant="small" style={s.grow}>{job.error}</Text>
        </View>
      )}

      <View style={s.rows}>
        {job.photos.map((p, i) => (
          <View key={p.key} style={s.row} accessible accessibilityLabel={`Photo ${i + 1}${p.pairRole ? `, ${p.pairRole}` : ''}: ${stageText(p)}`}>
            <View style={s.thumb}>
              {!!p.thumb && <Photo uri={p.thumb} style={s.fill} />}
              <View style={s.thumbState}>
                {p.stage === 'done' ? <Check size={14} strokeWidth={3} color="#fff" />
                  : p.stage === 'failed' ? <AlertCircle size={14} color="#fff" />
                  : p.stage === 'uploading' || p.stage === 'saving' ? <ActivityIndicator size="small" color="#fff" /> : null}
              </View>
            </View>
            <View style={s.grow}>
              <Text variant="tiny" weight="600" numberOfLines={1}>{p.pairRole ? (p.pairRole === 'before' ? 'Before' : 'After') : `Photo ${i + 1}`}{p.recipe ? ' · edited' : ''}</Text>
              <View style={s.miniBar}><View style={[s.miniFill, { width: `${Math.round((p.stage === 'done' ? 1 : p.fraction) * 100)}%` }, p.stage === 'failed' && { backgroundColor: c.danger }]} /></View>
              <Text variant="tiny" color={p.stage === 'failed' ? 'danger' : 'muted'} numberOfLines={2}>{stageText(p)}</Text>
            </View>
          </View>
        ))}
      </View>

      {(failed || paused) && <Button title={paused ? 'Resume' : 'Try again'} icon={RotateCcw} variant="accent" block onPress={() => retryJob(job.id)} />}
      {failed && onEdit && !job.albumId && <Button title="Back to editing" variant="ghost" block onPress={onEdit} />}
      {job.status !== 'cancelling' && <Button title="Cancel post" icon={X} variant="ghost" block onPress={() => setConfirm(true)} />}
      <Text variant="tiny" muted center>
        You can leave this screen. It keeps going while the app is open, and picks up where it left off if the app closes. Nothing is public until every photo is up.
      </Text>

      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Cancel this post?">
        <Text variant="small" muted>What’s been uploaded so far is deleted. Nothing was published.</Text>
        <View style={s.sheetActions}>
          <Button title="Cancel post" variant="danger" block onPress={() => { setConfirm(false); cancelJob(job.id) }} />
          <Button title="Keep posting" variant="ghost" block onPress={() => setConfirm(false)} />
        </View>
      </Sheet>
    </View>
  )
}

export function Posted({ job, ownerName, onAnother }: { job: Job; ownerName?: string; onAnother: () => void }) {
  const s = useStyles()
  const { c } = useTheme()
  const router = useRouter()
  const [sharing, setSharing] = useState(false)
  const ba = job.kind === 'before_after'
  const before = job.photos.find((p) => p.pairRole === 'before')
  const after = job.photos.find((p) => p.pairRole === 'after') ?? job.photos[0]
  const cover = ba ? after : job.photos[0]
  const view = () => router.replace({ pathname: '/gallery/[personId]', params: { personId: job.providerId, post: job.albumId! } })
  return (
    <View style={s.wrap}>
      <View style={[s.check, { backgroundColor: c.ok }]}><Check size={30} strokeWidth={3} color={c.onAccent} /></View>
      <Text variant="h3" center>Posted</Text>
      <Text variant="small" muted center>“{job.fields.title}” is live on your profile.</Text>
      {ba && before && after ? (
        <View style={s.result}>
          <BeforeAfter before={before.display.uri} after={after.display.uri} aspectRatio={after.display.width / after.display.height || 0.8} demo rounded={14} accessibilityLabel={job.fields.title} />
        </View>
      ) : !!cover && (
        <View style={s.result}>
          <Photo uri={cover.display.uri} style={[s.resultImg, { aspectRatio: Math.max(0.7, Math.min(1.5, cover.display.width / cover.display.height || 1)) }]} />
          {job.photos.length > 1 && <View style={s.count}><Text variant="tiny" weight="700" style={s.white}>{job.photos.length} photos</Text></View>}
        </View>
      )}
      <View style={s.note}>
        <Sparkles size={16} color={c.ink} />
        <Text variant="small" style={s.grow}>Style tags appear shortly, once your photos have been looked at.</Text>
      </View>
      <Button title="View post" variant="accent" block onPress={view} />
      <View style={s.pair}>
        <Button title="Share" icon={Send} variant="ghost" grow onPress={() => setSharing(true)} />
        <Button title="Post another" variant="ghost" grow onPress={onAnother} />
      </View>
      <Button title="Go to my work" variant="link" size="sm" onPress={() => router.replace('/my-work')} style={s.center} />
      {sharing && job.albumId && (
        <ShareSheet
          item={{ kind: 'post', id: job.albumId, providerId: job.providerId, title: job.fields.title, subtitle: ownerName ?? null, image: null }}
          onClose={() => setSharing(false)}
        />
      )}
    </View>
  )
}

// One line about unfinished posts, for the top of New post / My work.
export function QueueBanner({ jobs, onOpen }: { jobs: Job[]; onOpen?: (j: Job) => void }) {
  const s = useStyles()
  const { c } = useTheme()
  const open = jobs.filter((j) => j.status !== 'done')
  if (!open.length) return null
  const j = open[0]
  const pct = Math.round(jobFraction(j) * 100)
  const text = j.status === 'failed' ? (j.offline ? 'Waiting for a connection' : 'Couldn’t finish posting') : j.status === 'paused' ? 'Paused · resuming' : j.status === 'cancelling' ? 'Cancelling…' : `Posting · ${pct}%`
  return (
    <Pressable onPress={() => onOpen?.(j)} style={[s.banner, j.status === 'failed' && !j.offline && { backgroundColor: c.dangerSoft }]} accessibilityRole="button"
      accessibilityLabel={`${j.fields.title}: ${text}${open.length > 1 ? `, and ${open.length - 1} more` : ''}`}>
      <View style={s.bannerThumb}>{!!j.photos[0]?.thumb && <Photo uri={j.photos[0].thumb} style={s.fill} />}</View>
      <View style={s.grow}>
        <Text variant="small" weight="700" numberOfLines={1}>{j.fields.title}</Text>
        <Text variant="tiny" muted numberOfLines={1}>{text}{open.length > 1 ? ` · ${open.length - 1} more` : ''}</Text>
        <View style={s.miniBar}><View style={[s.miniFill, { width: `${Math.max(2, pct)}%` }]} /></View>
      </View>
      {j.status === 'running' ? <ActivityIndicator size="small" color={c.muted} /> : j.status === 'failed' ? <RotateCcw size={16} color={c.ink} /> : null}
    </Pressable>
  )
}

const useStyles = makeStyles((t) => ({
  wrap: { padding: t.space.xl, gap: 12, alignItems: 'center' },
  grow: { flex: 1, minWidth: 0 },
  center: { alignSelf: 'center' },
  white: { color: '#fff' },
  fill: { width: '100%', height: '100%' },
  cover: { width: 120, height: 120, borderRadius: t.radius.xl, overflow: 'hidden', backgroundColor: t.c.soft, marginBottom: 4 },
  bar: { alignSelf: 'stretch', height: 8, borderRadius: 4, backgroundColor: t.c.soft, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: t.c.accent, borderRadius: 4 },
  rows: { alignSelf: 'stretch', gap: 8, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { width: 44, height: 44, borderRadius: 8, overflow: 'hidden', backgroundColor: t.c.soft },
  thumbState: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' },
  miniBar: { height: 4, borderRadius: 2, backgroundColor: t.c.soft, overflow: 'hidden', marginVertical: 3 },
  miniFill: { height: '100%', backgroundColor: t.c.accent },
  check: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  result: { alignSelf: 'stretch' },
  resultImg: { width: '100%', borderRadius: t.radius.lg },
  count: { position: 'absolute', top: 10, right: 10, backgroundColor: t.c.overlay, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: t.radius.md, backgroundColor: t.c.soft, alignSelf: 'stretch' },
  pair: { flexDirection: 'row', gap: 8, alignSelf: 'stretch' },
  sheetActions: { gap: 8, marginTop: t.space.md },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: t.radius.lg, backgroundColor: t.c.soft },
  bannerThumb: { width: 40, height: 40, borderRadius: 8, overflow: 'hidden', backgroundColor: t.c.line },
}))
