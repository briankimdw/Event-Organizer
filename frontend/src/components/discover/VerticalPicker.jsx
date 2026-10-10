import { Check, ChevronDown } from 'lucide-react'
import Sheet from '../Sheet.jsx'
import { Loading } from '../States.jsx'
import CatalogIcon, { TintIcon } from '../home/CatalogIcon.jsx'
import './discover.css'

// The swipe deck's "which kind of work" switch: a chip that opens a sheet.
export function VerticalPickerChip({ vertical, onClick }) {
  return (
    <button className="chip dc-vchip" style={{ '--tint': vertical.tint }} onClick={onClick} aria-haspopup="dialog" aria-label={`Showing ${vertical.name}. Change`}>
      <CatalogIcon name={vertical.icon} size={14} />
      {vertical.name}
      <ChevronDown size={14} />
    </button>
  )
}

// verticals: catalog verticals with visual portfolios, each with `count` (providers).
// Ones with no providers yet are listed but can't be picked.
export function VerticalPickerSheet({ open, onClose, verticals, loading, value, onPick }) {
  const live = verticals.filter((v) => v.count > 0)
  const soon = verticals.filter((v) => !v.count)
  return (
    <Sheet open={open} onClose={onClose} title="Swipe through">
      {loading ? (
        <Loading inline />
      ) : (
        <>
          <div className="dc-vlist" role="listbox" aria-label="Kind of work">
            {live.map((v) => (
              <button key={v.slug} role="option" aria-selected={v.slug === value} className={`dc-vrow ${v.slug === value ? 'on' : ''}`} onClick={() => onPick(v.slug)}>
                <TintIcon item={v} size={40} />
                <span className="grow left-text">
                  <b className="block">{v.name}</b>
                  <span className="muted tiny">{v.count} {v.count === 1 ? v.noun : v.plural.toLowerCase()}</span>
                </span>
                {v.slug === value && <Check size={18} />}
              </button>
            ))}
          </div>
          {soon.length > 0 && (
            <>
              <div className="section-label">Coming soon</div>
              <div className="dc-soon-grid">
                {soon.map((v) => (
                  <span key={v.slug} className="dc-soon-item" aria-disabled="true">
                    <TintIcon item={v} size={30} />
                    <span className="ellipsis">{v.name}</span>
                  </span>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Sheet>
  )
}
