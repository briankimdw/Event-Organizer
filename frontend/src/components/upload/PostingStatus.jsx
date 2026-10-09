import { Link } from 'react-router-dom'
import { AlertCircle, Check, RotateCcw, Sparkles } from 'lucide-react'

// Overall progress, weighting each photo by how much has to be uploaded.
export function overallFraction(items, perPhoto) {
  let sum = 0
  let total = 0
  items.forEach((it, i) => {
    const w = it.size + 400_000 // the original plus roughly its public copy
    total += w
    sum += w * (perPhoto[i]?.fraction ?? 0)
  })
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

// While posting: overall bar + one tile per photo with its own progress.
export function Posting({ items, perPhoto, kindLabel }) {
  const done = perPhoto.filter((p) => p?.stage === 'done').length
  const fraction = overallFraction(items, perPhoto)
  const pct = Math.round(fraction * 100)
  const cover = items[0]
  return (
    <div className="ps" aria-live="polite">
      <div className="ps-cover">{cover?.thumbUrl && <img src={cover.thumbUrl} alt="" />}</div>
      <h3 className="ps-title">Posting your {kindLabel}…</h3>
      <div className="muted small">
        {done === items.length ? 'Finishing up…' : items.length > 1 ? `Uploading photo ${Math.min(done + 1, items.length)} of ${items.length}` : 'Uploading'} · {pct}%
      </div>
      <div className="ps-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
      {items.length > 1 && (
        <div className="ps-thumbs">
          {items.map((it, i) => {
            const p = perPhoto[i]
            const state = p?.stage === 'done' ? 'done' : p ? 'active' : 'waiting'
            return (
              <div key={it.id} className={`ps-thumb ${state}`}>
                {it.thumbUrl && <img src={it.thumbUrl} alt="" />}
                <span className="ps-thumb-state">
                  {state === 'done' ? <Check size={14} strokeWidth={3} /> : state === 'active' ? <Ring fraction={p.fraction} /> : null}
                </span>
              </div>
            )
          })}
        </div>
      )}
      <div className="muted tiny ps-keep">Keep this screen open until it’s done.</div>
    </div>
  )
}

export function Posted({ cover, kindLabel, viewTo, onAnother }) {
  return (
    <div className="ps done">
      <div className="ps-check"><Check size={30} strokeWidth={3} /></div>
      <h3 className="ps-title">Posted</h3>
      <div className="muted small">Your {kindLabel} is live on your profile.</div>
      {cover && <img className="ps-result" src={cover} alt="" />}
      <div className="note ps-tags"><Sparkles size={16} /> Style tags appear shortly, once your photos have been looked at.</div>
      <div className="ps-actions">
        <Link to={viewTo} className="btn accent block">View post</Link>
        <button type="button" className="btn ghost block" onClick={onAnother}>Post another</button>
        <Link to="/my-work" className="link-btn small muted ps-link">Go to my work</Link>
      </div>
    </div>
  )
}

export function PostFailed({ error, onRetry, onEdit }) {
  return (
    <div className="ps failed" role="alert">
      <div className="ps-check bad"><AlertCircle size={30} /></div>
      <h3 className="ps-title">Couldn’t post</h3>
      <div className="small ps-error">{error}</div>
      <div className="muted small">Nothing was published. Your photos and details are still here.</div>
      <div className="ps-actions">
        <button type="button" className="btn accent block" onClick={onRetry}><RotateCcw size={16} /> Try again</button>
        <button type="button" className="btn ghost block" onClick={onEdit}>Back to editing</button>
      </div>
    </div>
  )
}
