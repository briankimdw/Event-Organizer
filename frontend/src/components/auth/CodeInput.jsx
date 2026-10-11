import { useRef, useState } from 'react'
import { CODE_LENGTH } from './authKit.js'

// One-time code as a row of boxes. Under the boxes is ONE real input (autocomplete
// "one-time-code"), so autofill from the email / SMS, paste, and screen readers all see a
// single field; the boxes only draw its value. Typing fills the next box, Backspace clears the
// last, and onComplete fires when the last digit lands.
export default function CodeInput({ id, value, onChange, onComplete, disabled, invalid, describedBy, autoFocus, label }) {
  const ref = useRef(null)
  const [focused, setFocused] = useState(false)

  const set = (raw) => {
    const v = raw.replace(/\D/g, '').slice(0, CODE_LENGTH)
    onChange(v)
    if (v.length === CODE_LENGTH && v !== value) onComplete?.(v)
  }
  // Keep the caret at the end: the boxes fill left to right.
  const toEnd = () => {
    const el = ref.current
    if (el) requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length))
  }

  const active = Math.min(value.length, CODE_LENGTH - 1)
  return (
    <div className={`au-otp${invalid ? ' invalid' : ''}${focused ? ' focused' : ''}`} onClick={() => ref.current?.focus()}>
      <input
        ref={ref}
        id={id}
        className="au-otp-input"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        enterKeyHint="go"
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={(e) => set(e.target.value)}
        onPaste={(e) => {
          // "123 456" or "Your code: 123456" pastes as 123456 (maxLength would cut it first).
          e.preventDefault()
          set(e.clipboardData.getData('text'))
        }}
        onFocus={() => { setFocused(true); toEnd() }}
        onBlur={() => setFocused(false)}
        onClick={toEnd}
        onKeyUp={toEnd}
      />
      <div className="au-otp-boxes" aria-hidden="true">
        {Array.from({ length: CODE_LENGTH }, (_, i) => (
          <span key={i} className={`au-otp-box${value[i] ? ' filled' : ''}${focused && i === active ? ' active' : ''}`}>
            {value[i] || ''}
            {focused && i === value.length && <span className="au-otp-caret" />}
          </span>
        ))}
      </div>
    </div>
  )
}
