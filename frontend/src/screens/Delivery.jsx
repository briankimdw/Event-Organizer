import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, ChevronDown, Cloud, Download, Heart, HardDrive, Timer } from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import Sheet from '../components/Sheet.jsx'
import { useStore } from '../store.jsx'
import { findPackage, img } from '../data/mock.js'

const TARGETS = [
  { id: 'gdrive', name: 'Google Drive', Icon: HardDrive },
  { id: 'dropbox', name: 'Dropbox', Icon: Cloud },
  { id: 'onedrive', name: 'OneDrive', Icon: Cloud },
]

export default function Delivery() {
  const { id } = useParams()
  const { bookings, toast } = useStore()
  const b = bookings.find((x) => x.id === id)
  const { provider: p } = findPackage(b.packageId)
  const photos = Array.from({ length: 18 }, (_, i) => `${b.id}-delivery-${i}`)
  const [favs, setFavs] = useState(new Set())
  const [onlyFavs, setOnlyFavs] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [job, setJob] = useState(null) // { target, progress }
  const [advanced, setAdvanced] = useState(false)

  useEffect(() => {
    if (!job || job.progress >= 100) return
    const t = setTimeout(() => setJob({ ...job, progress: Math.min(100, job.progress + 9) }), 180)
    return () => clearTimeout(t)
  }, [job])

  const days = b.deliveryExpiresDays ?? 30
  const shown = onlyFavs ? photos.filter((s) => favs.has(s)) : photos
  const toggleFav = (s) => {
    const n = new Set(favs)
    n.has(s) ? n.delete(s) : n.add(s)
    setFavs(n)
  }

  return (
    <div>
      <TopBar title="Your gallery" subtitle={`by ${p.name} · ${photos.length} photos`} />
      <div className="pad-x">
        <div className={`callout ${days <= 7 ? 'danger' : ''}`}>
          <div className="inline-icon"><Timer size={15} /> <b>Available for {days} more days</b></div>
          <div className="muted small">Download or export before they're removed. We'll email you a reminder 7 days and 1 day before.</div>
        </div>
        <div className="row gap-xs mt-sm">
          <button className="btn grow" onClick={() => toast('Preparing zip… we’ll notify you when it’s ready')}>
            <Download size={16} /> Download all (.zip)
          </button>
          <button className="btn ghost grow" onClick={() => setExportOpen(true)}>
            <Cloud size={16} /> Export
          </button>
        </div>
        <div className="row between mt">
          <div className="small"><b>{favs.size}</b> favorites</div>
          <button className={`chip toggle ${onlyFavs ? 'on' : ''}`} onClick={() => setOnlyFavs(!onlyFavs)}>
            <Heart size={12} /> Favorites only
          </button>
        </div>
      </div>

      <div className="grid2 mt-sm">
        {shown.map((s) => (
          <div key={s} className="delivery-item">
            <img src={img(s, 400, 500)} alt="" loading="lazy" />
            <button className={`fav ${favs.has(s) ? 'on' : ''}`} onClick={() => toggleFav(s)} aria-label="Favorite">
              <Heart size={18} fill={favs.has(s) ? 'currentColor' : 'none'} />
            </button>
            <button className="dl" onClick={() => toast('Downloading full-resolution photo')} aria-label="Download">
              <Download size={16} />
            </button>
          </div>
        ))}
      </div>
      {shown.length === 0 && <div className="empty small">Tap the heart on photos you love.</div>}

      <Sheet open={exportOpen} onClose={() => setExportOpen(false)} title="Export to your cloud">
        {TARGETS.map(({ id: tid, name, Icon }) => {
          const active = job?.target === tid
          return (
            <div key={tid} className="list-row">
              <span className="round-icon"><Icon size={18} /></span>
              <div className="grow">
                <div>{name}</div>
                {active && (
                  <div className="progress">
                    <div style={{ width: `${job.progress}%` }} />
                  </div>
                )}
              </div>
              {active && job.progress >= 100 ? (
                <CheckCircle2 size={20} className="ok" />
              ) : (
                <button className="btn sm" disabled={!!job && job.progress < 100} onClick={() => setJob({ target: tid, progress: 0 })}>
                  {active ? `${job.progress}%` : 'Connect'}
                </button>
              )}
            </div>
          )
        })}
        <button className="link-btn small mt" onClick={() => setAdvanced(!advanced)}>
          Advanced: S3 / rclone <ChevronDown size={14} />
        </button>
        {advanced && (
          <pre className="code">{`# Presigned S3-compatible endpoint (valid 24h)
rclone copy \\
  :s3,provider=Other,endpoint=https://files.photomatch.app:${b.id} \\
  ./my-gallery --progress`}</pre>
        )}
      </Sheet>
    </div>
  )
}
