import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, MapPinOff, ShieldAlert, Stamp } from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import Segmented from '../components/Segmented.jsx'
import { Carousel, BeforeAfter } from '../components/Media.jsx'
import { useStore } from '../store.jsx'
import { cameraRoll, genres, img } from '../data/mock.js'

const LIMITS = { single: 1, carousel: 10, beforeafter: 2 }

const exifDefaults = [
  { key: 'body', label: 'Body', value: 'Fujifilm X-T5' },
  { key: 'lens', label: 'Lens', value: 'XF 33mm f/1.4 R LM WR' },
  { key: 'focal', label: 'Focal length', value: '33mm' },
  { key: 'aperture', label: 'Aperture', value: 'f/2' },
  { key: 'shutter', label: 'Shutter', value: '1/250s' },
  { key: 'iso', label: 'ISO', value: '400' },
  { key: 'flash', label: 'Flash', value: 'Off' },
  { key: 'date', label: 'Date', value: 'Oct 5, 2026' },
]

export default function Upload() {
  const navigate = useNavigate()
  const { toast } = useStore()
  const [type, setType] = useState('carousel')
  const [selected, setSelected] = useState(['roll-2', 'roll-5'])
  const [exif, setExif] = useState(exifDefaults.map((f) => ({ ...f, hidden: false })))
  const [genre, setGenre] = useState('Street')
  const [tags, setTags] = useState('')
  const [location, setLocation] = useState('Little Tokyo, Los Angeles')
  const [caption, setCaption] = useState('')
  const [watermark, setWatermark] = useState(true)

  const limit = LIMITS[type]
  const changeType = (t) => {
    setType(t)
    setSelected(selected.slice(0, LIMITS[t]))
  }
  const toggle = (seed) => {
    if (selected.includes(seed)) setSelected(selected.filter((s) => s !== seed))
    else if (limit === 1) setSelected([seed])
    else if (selected.length < limit) setSelected([...selected, seed])
  }
  const updateExif = (key, patch) => setExif(exif.map((f) => (f.key === key ? { ...f, ...patch } : f)))
  const ready = type === 'beforeafter' ? selected.length === 2 : selected.length > 0

  const post = () => {
    toast('Uploading… your post goes live once processing finishes')
    navigate(-1)
  }

  return (
    <div>
      <TopBar
        title="New post"
        right={
          <button className="link-btn accent" disabled={!ready} onClick={post}>
            Share
          </button>
        }
      />
      <div className="pad">
        <Segmented
          options={[
            { value: 'single', label: 'Single' },
            { value: 'carousel', label: 'Carousel' },
            { value: 'beforeafter', label: 'Before / After' },
          ]}
          value={type}
          onChange={changeType}
        />

        <div className="mt">
          {ready ? (
            type === 'beforeafter' ? (
              <BeforeAfter seed={selected[1]} aspect="1 / 1" />
            ) : (
              <Carousel seeds={selected} aspect="1 / 1" />
            )
          ) : (
            <div className="placeholder">
              {type === 'beforeafter' ? 'Pick a before and an after photo' : 'Pick photos below'}
            </div>
          )}
        </div>

        <div className="row between mt-sm">
          <div className="muted small">
            {type === 'beforeafter' ? 'Before, then after' : `Up to ${limit} photo${limit > 1 ? 's' : ''}`}
          </div>
          <div className="small">{selected.length}/{limit}</div>
        </div>
        <div className="roll">
          {cameraRoll.map((seed) => {
            const i = selected.indexOf(seed)
            return (
              <button key={seed} className={`roll-item ${i >= 0 ? 'on' : ''}`} onClick={() => toggle(seed)}>
                <img src={img(seed, 200, 200)} alt="" loading="lazy" />
                {i >= 0 && (
                  <span className="roll-num">{type === 'beforeafter' ? (i === 0 ? 'B' : 'A') : i + 1}</span>
                )}
              </button>
            )
          })}
        </div>

        <textarea className="input mt" rows={3} placeholder="Write a caption…" value={caption} onChange={(e) => setCaption(e.target.value)} />

        <h4 className="section-title">Gear & settings</h4>
        <div className="muted small">Auto-filled from your photo's EXIF. Edit or hide any field.</div>
        <div className="exif-edit">
          {exif.map((f) => (
            <div key={f.key} className={`exif-edit-row ${f.hidden ? 'hidden' : ''}`}>
              <label>{f.label}</label>
              <input value={f.value} disabled={f.hidden} onChange={(e) => updateExif(f.key, { value: e.target.value })} />
              <button className="icon-btn" onClick={() => updateExif(f.key, { hidden: !f.hidden })} aria-label="Hide field">
                {f.hidden ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          ))}
        </div>
        <div className="note mt-sm">
          <MapPinOff size={16} /> GPS location is removed from your files automatically.
        </div>

        <h4 className="section-title">Genre</h4>
        <div className="chips">
          {genres.map((g) => (
            <button key={g} className={`chip toggle ${genre === g ? 'on' : ''}`} onClick={() => setGenre(g)}>
              {g}
            </button>
          ))}
        </div>

        <h4 className="section-title">Tags</h4>
        <input className="input" placeholder="#nightstreet #35mm" value={tags} onChange={(e) => setTags(e.target.value)} />
        <div className="muted tiny mt-xs">We'll also add auto-tags (subject, colors, mood) after upload.</div>

        <h4 className="section-title">Location</h4>
        <input className="input" placeholder="City or spot" value={location} onChange={(e) => setLocation(e.target.value)} />

        <div className="toggle-row mt">
          <Stamp size={18} />
          <div className="grow">
            <div>Watermark</div>
            <div className="muted tiny">Added to the public version. Your original stays private.</div>
          </div>
          <input type="checkbox" className="switch" checked={watermark} onChange={(e) => setWatermark(e.target.checked)} />
        </div>

        <div className="note mt">
          <ShieldAlert size={16} />
          Every upload is checked for AI generation. If a photo is flagged, you can verify it with the RAW file.
        </div>

        <button className="btn block mt-lg" disabled={!ready} onClick={post}>
          Share post
        </button>
      </div>
    </div>
  )
}
