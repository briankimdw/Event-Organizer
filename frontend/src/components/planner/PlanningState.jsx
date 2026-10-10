import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'

const STEPS = [
  'Reading your request',
  'Splitting the budget',
  'Checking photographers’ calendars',
  'Ranking by style, distance and price',
]

// Calm "thinking" state: what the planner is doing, plus skeletons where the plan will appear.
export default function PlanningState({ refining = false }) {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1100)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="plan-thinking" role="status" aria-live="polite">
      <div className="plan-reply">
        <span className="plan-ai-mark pulse"><Sparkles size={15} /></span>
        <div className="grow">
          <b>{refining ? 'Updating your plan…' : 'Planning…'}</b>
          <div className="muted small plan-step" key={step}>{STEPS[step]}</div>
        </div>
      </div>
      <div className="plan-skel-chips">
        {[64, 92, 70, 84].map((w, i) => <span key={i} className="skel" style={{ width: w }} />)}
      </div>
      <div className="plan-card">
        <span className="skel line" style={{ width: '40%' }} />
        <span className="skel bar" />
        <span className="skel line" />
        <span className="skel line" style={{ width: '80%' }} />
      </div>
      <div className="plan-card plan-skel-option">
        <span className="skel avatar" />
        <div className="grow">
          <span className="skel line" style={{ width: '55%' }} />
          <span className="skel line" style={{ width: '35%' }} />
        </div>
      </div>
    </div>
  )
}
