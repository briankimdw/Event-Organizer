import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowUp, Sparkles } from 'lucide-react'

// Home entry point to the AI planner: tap to open it, or type a first message.
export default function PlanCard() {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const submit = (e) => {
    e.preventDefault()
    const q = text.trim()
    navigate(q ? `/plan?q=${encodeURIComponent(q)}` : '/plan')
  }
  return (
    <div className="plan-promo">
      <Link to="/plan" className="plan-promo-head">
        <span className="plan-ai-mark lg"><Sparkles size={18} /></span>
        <span className="grow">
          <b>Plan an event with AI</b>
          <span className="muted small block">Say when, where and your budget. Get a draft plan and vendors who fit.</span>
        </span>
      </Link>
      <form className="plan-promo-input" onSubmit={submit}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="A wedding in Napa next June, $15k…" aria-label="Describe your event" />
        <button className="plan-send sm" aria-label="Plan it">
          <ArrowUp size={16} strokeWidth={2.5} />
        </button>
      </form>
    </div>
  )
}
