import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, Check, RotateCcw, Send, Sparkles } from 'lucide-react'
import ShareSheet from '../share/ShareSheet.jsx'

// Overall progress, weighting each photo by how much has to be uploaded.
// list: [{ size, fraction }] (usePostQueue's job.list).
export function overallFraction(list) {
  let sum = 0
  let total = 0
  for (const it of list) {
    const w = (it.size || 0) + 400_000 // the original plus roughly its public copy
    total += w
    sum += w * (it.state === 'done' ? 1 : it.fraction || 0)
  }
  return total ? sum / total : 0
}

function Ring({ fraction }) {
  const r = 9
  const c = 2 * Math.PI * r
  return (
    <svg className="ps-ring" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r={r} className="ps-ring-track" />
      <circle cx="12" cy="12" r={r} className="ps-ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - fraction)} />
    </svg>
  )
}

const photoWord = (n) => (n === 1 ? '1 photo' : `${n} photos`)

// While posting (and when some photos failed): overall bar + one tile per photo, each with
// its own progress and, if it failed, its own Retry. job: usePostQueue().job.
export function Posting({ job, kindLabel, onRetry, onCancel, onPublishPartial }) {
  const { list, phase } = job
  const done = list.filter((x) => x.state === 'done').length
  const failed = list.filter((x) => x.state === 'failed')
  const pct = Math.round(overallFraction(list) * 100)
  const cover = list[job.kind === 'before_after' ? 1 : 0] || list[0]
  const partial = phase === 'partial'
  const busy = phase === 'posting' || phase === 'creating' || phase === 'publishing'
  const retrying = list.find((x) => x.state === 'uploading' && x.attempt)
  const canPostPartial = partial && job.kind !== 'before_after' && done > 0

  let line
  if (phase === 'creating') line = job.resumed ? 'Picking up where you left off…' : 'Getting ready…'
  else if (phase === 'publishing') line = 'Finishing up…'
  else if (phase === 'cancelling') line = 'Cancelling…'
  else if (partial) line = `${done} of ${list.length} uploaded · ${photoWord(failed.length || list.length - done)} still to go`
  else line = `${list.length > 1 ? `Uploading ${Math.min(done + 1, list.length)} of ${list.length}` : 'Uploading'} · ${pct}%`

  return (
    <div className="ps">
      <div className={`ps-cover ${partial ? 'still' : ''}`}>{cover?.thumbUrl && <img src={cover.thumbUrl} alt="" />}</div>
      <h3 className="ps-title">{partial ? 'Almost there' : `Sharing your ${kindLabel}…`}</h3>
      <div className="muted small" aria-live="polite">{line}</div>
      {retrying && !partial && <div className="muted tiny">Connection hiccup, trying again…</div>}
      <div className="ps-bar" role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div style={{ width: `${Math.max(2, pct)}%` }} />
      </div>

      {(list.length > 1 || failed.length > 0) && (
        <ul className="ps-thumbs" aria-label="Photos">
          {list.map((it, i) => {
            const state = it.state === 'uploading' ? 'active' : it.state
            const label = `Photo ${i + 1}: ${it.state === 'done' ? 'uploaded' : it.state === 'failed' ? 'failed' : it.state === 'uploading' ? `${Math.round((it.fraction || 0) * 100)}%` : 'waiting'}`
            return (
              <li key={it.key} className={`ps-thumb ${state}`}>
                {it.thumbUrl && <img src={it.thumbUrl} alt="" />}
                <span className="ps-thumb-state" aria-hidden="true">
                  {state === 'done' ? <Check size={14} strokeWidth={3} /> : state === 'active' ? <Ring fraction={it.fraction || 0} /> : state === 'failed' ? <AlertCircle size={16} /> : null}
                </span>
                <span className="sr-only">{label}</span>
                {state === 'failed' && partial && (
                  <button type="button" className="ps-thumb-retry" onClick={() => onRetry(it.key)} aria-label={`Retry photo ${i + 1}`}>
                    <RotateCcw size={13} aria-hidden="true" />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {partial && failed.length > 0 && (
        <div className="ps-fail" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <div>
            <b>{failed.length === 1 ? '1 photo didn’t upload' : `${failed.length} photos didn’t upload`}</b>
            <div className="tiny">{failed[0].error}</div>
          </div>
        </div>
      )}
      {partial && job.error && <div className="small ps-error" role="alert">{job.error}</div>}

      <div className="ps-actions">
        {partial ? (
          <>
            {failed.length > 0 && <button type="button" className="btn accent block" onClick={() => onRetry(null)}><RotateCcw size={16} /> Retry {failed.length === 1 ? 'it' : `all ${failed.length}`}</button>}
            {failed.length === 0 && job.error && <button type="button" className="btn accent block" onClick={onPublishPartial}><RotateCcw size={16} /> Try again</button>}
            {canPostPartial && failed.length > 0 && (
              <button type="button" className="btn ghost block" onClick={onPublishPartial}>Post the {photoWord(done)} that worked</button>
            )}
            <button type="button" className="link-btn small muted ps-link" onClick={onCancel}>Cancel post</button>
          </>
        ) : (
          <>
            <div className="muted tiny ps-keep">
              {busy ? 'You can keep this tab open. If it closes, you can pick up where you left off.' : ''}
            </div>
            <button type="button" className="btn ghost sm ps-cancel" onClick={onCancel} disabled={phase === 'creating' || phase === 'publishing' || phase === 'cancelling'}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// Done: what was posted, and what to do next.
export function Posted({ cover, kindLabel, viewTo, onAnother, share, partial = false }) {
  const [sharing, setSharing] = useState(false)
  return (
    <div className="ps done">
      <div className="ps-check"><Check size={30} strokeWidth={3} /></div>
      <h3 className="ps-title" tabIndex={-1} data-autofocus>Posted</h3>
      <div className="muted small">Your {kindLabel} is live on your profile{partial ? ', without the photos that didn’t upload' : ''}.</div>
      {cover && <img className="ps-result" src={cover} alt="" />}
      <div className="note ps-tags"><Sparkles size={16} /> Style tags appear shortly, once your photos have been looked at.</div>
      <div className="ps-actions">
        <Link to={viewTo} className="btn accent block">View post</Link>
        <div className="ps-row">
          {share && <button type="button" className="btn ghost grow" onClick={() => setSharing(true)} aria-haspopup="dialog"><Send size={16} /> Share</button>}
          <button type="button" className="btn ghost grow" onClick={onAnother}>Post another</button>
        </div>
        <Link to="/my-work" className="link-btn small muted ps-link">Go to my work</Link>
      </div>
      {sharing && share && <ShareSheet item={share} onClose={() => setSharing(false)} />}
    </div>
  )
}

export function PostFailed({ error, onRetry, onEdit, retryLabel = 'Try again' }) {
  return (
    <div className="ps failed" role="alert">
      <div className="ps-check bad"><AlertCircle size={30} /></div>
      <h3 className="ps-title">Couldn’t post</h3>
      <div className="small ps-error">{error}</div>
      <div className="muted small">Nothing was published. Your photos and details are still here.</div>
      <div className="ps-actions">
        {onRetry && <button type="button" className="btn accent block" onClick={onRetry}><RotateCcw size={16} /> {retryLabel}</button>}
        <button type="button" className="btn ghost block" onClick={onEdit}>Back to editing</button>
      </div>
    </div>
  )
}
