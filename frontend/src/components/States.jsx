import { Link, useLocation } from 'react-router-dom'
import { LogIn } from 'lucide-react'

// Shared loading / empty / error / signed-out states, so every screen handles
// "no data yet" the same way.

export function Loading({ label = 'Loading…', inline = false }) {
  return (
    <div className={`state ${inline ? 'inline' : ''}`} role="status">
      <span className="spinner" aria-hidden="true" />
      <span className="muted small">{label}</span>
    </div>
  )
}

// icon: a lucide icon component. action: optional element (button/link).
export function EmptyState({ icon: Icon, title, text, action, compact = false }) {
  return (
    <div className={`state empty ${compact ? 'compact' : ''}`}>
      {Icon && (
        <span className="state-icon">
          <Icon size={compact ? 20 : 26} />
        </span>
      )}
      {title && <div className="state-title">{title}</div>}
      {text && <div className="muted small state-text">{text}</div>}
      {action}
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="state empty">
      <div className="state-title">Couldn’t load this</div>
      <div className="muted small state-text">{error?.message || 'Check your connection and try again.'}</div>
      {onRetry && (
        <button className="btn sm ghost" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

// Shown in place of screens that need an account (Bookings, Inbox...).
export function SignInPrompt({ title = 'Sign in to continue', text }) {
  const { pathname, search } = useLocation()
  return (
    <div className="state empty">
      <span className="state-icon">
        <LogIn size={26} />
      </span>
      <div className="state-title">{title}</div>
      {text && <div className="muted small state-text">{text}</div>}
      <Link className="btn" to={`/sign-in?next=${encodeURIComponent(pathname + search)}`}>
        Sign in
      </Link>
    </div>
  )
}
