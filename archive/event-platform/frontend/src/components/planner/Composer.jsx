import { useEffect, useRef } from 'react'
import { ArrowUp, CornerDownRight, X } from 'lucide-react'

// The planner's prompt box. `hero` is the big first-message version; otherwise
// it's the compact follow-up bar docked at the bottom. Enter sends, Shift+Enter
// adds a line. `replyTo` shows which planner question is being answered.
export default function Composer({ value, onChange, onSubmit, busy = false, hero = false, placeholder, replyTo, onClearReply, autoFocus = false }) {
  const ref = useRef(null)

  // Grow with the text, up to a few lines.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, hero ? 220 : 120)}px`
  }, [value, hero])

  useEffect(() => {
    if (replyTo) ref.current?.focus()
  }, [replyTo])

  const canSend = value.trim().length > 0 && !busy
  const submit = (e) => {
    e?.preventDefault()
    if (canSend) onSubmit(value.trim())
  }

  return (
    <form className={`plan-composer ${hero ? 'hero' : ''}`} onSubmit={submit}>
      {replyTo && (
        <div className="plan-replyto">
          <CornerDownRight size={14} />
          <span className="grow ellipsis">{replyTo}</span>
          <button type="button" className="icon-btn" onClick={onClearReply} aria-label="Stop replying">
            <X size={14} />
          </button>
        </div>
      )}
      <div className="plan-composer-box">
        <textarea
          ref={ref}
          rows={hero ? 3 : 1}
          value={value}
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-label="Describe your event"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e)
          }}
        />
        <button type="submit" className="plan-send" disabled={!canSend} aria-label="Send">
          <ArrowUp size={18} strokeWidth={2.5} />
        </button>
      </div>
    </form>
  )
}
