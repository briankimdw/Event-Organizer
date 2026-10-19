import { PlugZap, TriangleAlert } from 'lucide-react'
import { SignInPrompt } from '../States.jsx'
import { ML_URL } from '../../api/planner.js'

// What went wrong with the last planner call, with a way forward.
export default function PlanError({ error, onRetry }) {
  if (error?.kind === 'auth') {
    return <SignInPrompt title="Sign in again to keep planning" text="Your session ended. Sign in again, then send that message once more." />
  }
  const offline = error?.kind === 'offline'
  return (
    <div className="plan-card plan-error">
      <span className="plan-error-icon">{offline ? <PlugZap size={18} /> : <TriangleAlert size={18} />}</span>
      <div className="grow">
        <b>{offline ? 'The planner isn’t running' : 'That didn’t work'}</b>
        <div className="muted small">
          {offline
            ? import.meta.env.DEV
              ? `Couldn’t reach ${ML_URL}. Start it (dev):`
              : 'It’s taking a short break. Try again in a minute.'
            : error?.message || 'Something went wrong. Try again.'}
        </div>
        {offline && import.meta.env.DEV && (
          <code className="plan-cmd">cd services/ml &amp;&amp; uvicorn app.main:app --reload --port 8000</code>
        )}
        {onRetry && (
          <button type="button" className="btn sm mt-sm" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    </div>
  )
}
