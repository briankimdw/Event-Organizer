import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

// Bottom sheet rendered inside the phone frame.
export default function Sheet({ open, onClose, title, children }) {
  if (!open) return null
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        {title && (
          <div className="sheet-head">
            <h3>{title}</h3>
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <X size={20} />
            </button>
          </div>
        )}
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.getElementById('phone'),
  )
}
