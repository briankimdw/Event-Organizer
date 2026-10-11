import { Check, Eye, EyeOff } from 'lucide-react'
import { passwordRules, passwordStrength } from './authKit.js'

// Password input with a show / hide toggle. `meter` adds the live strength bar and the rules
// checklist for a new password. `labelRight` sits on the label row (e.g. "Forgot password?").
export default function PasswordField({
  id, label, value, onChange, autoComplete, show, onToggleShow, meter = false, labelRight, describedBy, invalid,
  autoFocus, placeholder, enterKeyHint, toggle = true,
}) {
  const rules = meter ? passwordRules(value) : []
  const strength = meter ? passwordStrength(value) : null
  const ids = [meter && `${id}-rules`, describedBy].filter(Boolean).join(' ') || undefined
  return (
    <div className="au-field">
      <div className="au-label-row">
        <label htmlFor={id}>{label}</label>
        {labelRight}
      </div>
      <div className={`au-input-wrap${invalid ? ' invalid' : ''}`}>
        <input
          id={id}
          className="au-input"
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint={enterKeyHint}
          placeholder={placeholder}
          aria-invalid={invalid || undefined}
          aria-describedby={ids}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus={autoFocus}
        />
        {toggle && (
          <button type="button" className="au-eye" onClick={onToggleShow} aria-label="Show password" aria-pressed={show}>
            {show ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        )}
      </div>
      {meter && (
        <div className="au-meter-wrap">
          <div className={`au-meter s${strength.score}`} aria-hidden="true">
            {[1, 2, 3, 4].map((n) => <span key={n} className={strength.score >= n ? 'on' : ''} />)}
          </div>
          <span className="au-meter-label" aria-hidden="true">{strength.label}</span>
          <ul className="au-rules" id={`${id}-rules`}>
            {rules.map((r) => (
              <li key={r.id} className={r.ok ? 'ok' : ''}>
                <span className="au-rule-dot" aria-hidden="true">{r.ok && <Check size={12} strokeWidth={3} />}</span>
                {r.label}
                {!r.required && <span className="au-rule-opt"> (recommended)</span>}
                <span className="sr-only">{r.ok ? ', done' : ', not yet'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
