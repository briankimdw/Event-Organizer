import { Aperture, Camera, CircleDot, Calendar, Gauge, Timer, Zap, Ruler } from 'lucide-react'

export const exifLine = (e) => [e.body, e.focal, e.aperture, e.shutter, `ISO ${e.iso}`].join(' · ')

export default function ExifPanel({ exif }) {
  const rows = [
    { Icon: Camera, label: 'Body', value: exif.body },
    { Icon: CircleDot, label: 'Lens', value: exif.lens },
    { Icon: Ruler, label: 'Focal length', value: exif.focal },
    { Icon: Aperture, label: 'Aperture', value: exif.aperture },
    { Icon: Timer, label: 'Shutter', value: exif.shutter },
    { Icon: Gauge, label: 'ISO', value: exif.iso },
    { Icon: Zap, label: 'Flash', value: exif.flash },
    { Icon: Calendar, label: 'Taken', value: exif.date },
  ]
  return (
    <div className="exif-panel">
      {rows.map(({ Icon, label, value }) => (
        <div key={label} className={`exif-cell ${label === 'Body' || label === 'Lens' ? 'wide' : ''}`}>
          <Icon size={15} />
          <div>
            <div className="muted tiny">{label}</div>
            <div className="exif-value">{value}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
