import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BookmarkCheck, BookmarkPlus, Cake, Clock, FolderOpen, GraduationCap, Heart, MessageCircleQuestion, PlugZap, SquarePen, Sparkles, UserSquare } from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import Sheet from '../components/Sheet.jsx'
import { Loading, SignInPrompt } from '../components/States.jsx'
import Composer from '../components/planner/Composer.jsx'
import BriefChips from '../components/planner/BriefChips.jsx'
import BudgetBreakdown from '../components/planner/BudgetBreakdown.jsx'
import Recommendations from '../components/planner/Recommendations.jsx'
import PlanningState from '../components/planner/PlanningState.jsx'
import PlanError from '../components/planner/PlanError.jsx'
import MyEvents from '../components/planner/MyEvents.jsx'
import { followUpFor } from '../components/planner/brief.js'
import { useAuth } from '../auth.jsx'
import { useStore } from '../store.jsx'
import useQuery from '../lib/useQuery.js'
import { listProviders } from '../api/catalog.js'
import { createEvent, listMyEvents, titleFor, updateEvent } from '../api/events.js'
import { ML_URL, mockEnabled, planEvent, plannerHealth } from '../api/planner.js'

// Example prompts on the empty screen (dates computed so they're always ahead).
function examples() {
  const now = new Date()
  const juneYear = now.getMonth() >= 5 ? now.getFullYear() + 1 : now.getFullYear()
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString('en-US', { month: 'long' })
  return [
    { icon: Heart, text: `A wedding in Napa, June 11–13 ${juneYear}, about $15k all in, 120 guests` },
    { icon: GraduationCap, text: `Grad photos at UCLA the first week of June ${juneYear}, under $400` },
    { icon: UserSquare, text: `Team headshots for 12 people at our SF office in ${next}, $1,500` },
    { icon: Cake, text: 'A backyard birthday for 40 in Pasadena next month, with catering and a DJ, $3,000' },
  ]
}

let turnId = 0
const nextId = () => ++turnId

export default function Planner() {
  const { user, loading: authLoading } = useAuth()
  if (authLoading) return <><TopBar title="Plan with AI" /><Loading /></>
  if (!user) {
    return (
      <div className="planner">
        <TopBar title="Plan with AI" />
        <div className="plan-intro pad-x">
          <span className="plan-ai-mark xl"><Sparkles size={24} /></span>
          <h2>Plan your event in a sentence</h2>
          <p className="muted small">Tell me the occasion, dates, place and budget. I’ll draft a budget and find vendors who are free and fit. You approve every booking.</p>
        </div>
        <SignInPrompt title="Sign in to plan with AI" text="Plans are saved to your account so you can come back to them." />
      </div>
    )
  }
  return <PlannerChat />
}

function PlannerChat() {
  const { user } = useAuth()
  const { toast } = useStore()
  const [params, setParams] = useSearchParams()

  const [turns, setTurns] = useState([]) // { id, role: 'user'|'assistant'|'note', text, plan? }
  const [plan, setPlan] = useState(null) // latest planner response
  const [pending, setPending] = useState(null) // { refining }
  const [error, setError] = useState(null)
  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState(null) // a planner question being answered
  const [saved, setSaved] = useState(null) // { id, briefJson } of the event this plan is saved as
  const [saving, setSaving] = useState(false)
  const [eventsOpen, setEventsOpen] = useState(false)
  const [health, setHealth] = useState(undefined) // undefined: checking, null: down
  const abortRef = useRef(null)
  const lastReq = useRef(null)
  const scrollRef = useRef(null)
  const mock = mockEnabled()

  const providers = useQuery(() => listProviders(), [])
  const providerMap = useMemo(() => new Map((providers.data || []).map((p) => [p.id, p])), [providers.data])
  const events = useQuery(() => listMyEvents(), [user.id])

  useEffect(() => {
    let live = true
    plannerHealth().then((h) => live && setHealth(h))
    return () => {
      live = false
    }
  }, [])

  // Keep the newest message in view.
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [turns.length, !!pending, !!error])

  // fresh: start a new conversation (ignore what's on screen).
  async function send(message, { previous = plan?.brief ?? null, note = null, syncSaved = false, fresh = false } = {}) {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    lastReq.current = { message, opts: { previous, note, syncSaved, fresh } }

    const history = fresh ? [] : turns.filter((t) => t.role !== 'note' && !t.failed).slice(-12).map(({ role, text }) => ({ role, text }))
    if (replyTo && !fresh) history.push({ role: 'assistant', text: replyTo })
    setTurns((ts) => [...ts, note ? { id: nextId(), role: 'note', text: note } : { id: nextId(), role: 'user', text: message }])
    setDraft('')
    setReplyTo(null)
    setError(null)
    setPending({ refining: !!previous })
    try {
      const result = await planEvent({ message, previous, history, signal: ctrl.signal })
      if (ctrl.signal.aborted) return
      const next = { ...result, brief: result.brief ?? previous }
      setPlan(next)
      setTurns((ts) => [...ts, { id: nextId(), role: 'assistant', text: next.reply, plan: next }])
      if (syncSaved && next.brief) setSaved((s) => (s ? { ...s, briefJson: JSON.stringify(next.brief) } : s))
    } catch (err) {
      if (err.name === 'AbortError' || ctrl.signal.aborted) return
      console.warn(err)
      setError(err)
      // Mark the message as not sent (Try again removes it and sends it again).
      setTurns((ts) => ts.map((t, i) => (i === ts.length - 1 && t.role !== 'assistant' ? { ...t, failed: true } : t)))
    } finally {
      if (abortRef.current === ctrl) setPending(null)
    }
  }

  const retry = () => {
    const req = lastReq.current
    if (!req) return
    setTurns((ts) => (ts[ts.length - 1]?.failed ? ts.slice(0, -1) : ts)) // drop the failed message; send() adds it back
    send(req.message, req.opts)
  }

  // Open with a message from Home (/plan?q=...), once.
  const startedFromQuery = useRef(false)
  useEffect(() => {
    const q = params.get('q')
    if (!q || startedFromQuery.current) return
    startedFromQuery.current = true
    const rest = new URLSearchParams(params)
    rest.delete('q')
    setParams(rest, { replace: true })
    send(q)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const editField = (field, brief) => send(followUpFor(field, brief), { previous: brief })

  const reset = () => {
    abortRef.current?.abort()
    setTurns([])
    setPlan(null)
    setPending(null)
    setError(null)
    setSaved(null)
    setReplyTo(null)
    setDraft('')
  }

  const openEvent = (ev) => {
    setEventsOpen(false)
    reset()
    setSaved({ id: ev.id, briefJson: JSON.stringify(ev.brief) })
    send('Show me the plan for this event.', { previous: ev.brief, note: `Opened “${ev.title}”`, syncSaved: true, fresh: true })
  }

  const brief = plan?.brief
  const dirty = !!saved && !!brief && JSON.stringify(brief) !== saved.briefJson
  async function save() {
    if (!brief || saving) return
    setSaving(true)
    try {
      const ev = saved ? await updateEvent(saved.id, { brief }) : await createEvent(brief)
      setSaved({ id: ev.id, briefJson: JSON.stringify(brief) })
      events.reload()
      toast(saved ? 'Saved your changes' : 'Saved to My events')
    } catch (err) {
      console.warn(err)
      toast('Couldn’t save this plan. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const started = turns.length > 0
  const lastAssistant = [...turns].reverse().find((t) => t.role === 'assistant')
  // Scroll anchor: the newest thing the user did (a message or opening a saved plan).
  const anchorIndex = turns.reduce((last, t, i) => (t.role === 'assistant' ? last : i), -1)

  const topRight = (
    <>
      {started && (
        <button className="icon-btn" onClick={reset} aria-label="New plan">
          <SquarePen size={19} />
        </button>
      )}
      <button className="icon-btn" onClick={() => setEventsOpen(true)} aria-label="My events">
        <FolderOpen size={19} />
      </button>
    </>
  )

  return (
    <div className={`planner ${started ? 'chatting' : ''}`}>
      <TopBar title="Plan with AI" subtitle={brief ? titleFor(brief) : null} right={topRight} />

      {!started ? (
        <div className="plan-intro pad-x">
          <span className="plan-ai-mark xl"><Sparkles size={24} /></span>
          <h2>What are you planning?</h2>
          <p className="muted small">Tell me the occasion, dates, place and budget. I’ll draft a budget and find vendors who are free and fit. You approve every booking.</p>
          <Composer
            hero
            autoFocus
            value={draft}
            onChange={setDraft}
            onSubmit={(text) => send(text, { previous: null, fresh: true })}
            placeholder="Describe your event…"
          />
          {health === null && (
            <div className="note mt-sm">
              <PlugZap size={14} />
              <span>
                The planner isn’t running{import.meta.env.DEV ? ` at ${ML_URL}` : ''}.
                {import.meta.env.DEV && <> Start it with <code>uvicorn app.main:app --port 8000</code> in services/ml, or add <code>?mock=1</code>.</>}
              </span>
            </div>
          )}

          <div className="plan-label mt-lg">Try one of these</div>
          <div className="plan-examples">
            {examples().map(({ icon: Icon, text }) => (
              <button key={text} type="button" className="plan-example" onClick={() => send(text, { previous: null, fresh: true })}>
                <Icon size={16} />
                <span>{text}</span>
              </button>
            ))}
          </div>

          <div className="plan-label mt-lg">My events</div>
          <MyEvents query={events} onOpen={openEvent} />
          {(health || mock) && <EngineTag engine={health?.claude ? 'claude' : 'rules'} mock={mock} />}
        </div>
      ) : (
        <>
          <div className="plan-thread pad-x">
            {turns.map((t, i) => {
              const anchor = i === anchorIndex ? scrollRef : null
              if (t.role === 'note') return <div key={t.id} ref={anchor} className="plan-divider"><span>{t.text}</span></div>
              if (t.role === 'user') {
                return (
                  <div key={t.id} ref={anchor} className={`plan-msg user ${t.failed ? 'failed' : ''}`}>
                    {t.text}
                    {t.failed && <span className="plan-msg-failed">Not sent</span>}
                  </div>
                )
              }
              if (t === lastAssistant) {
                return (
                  <PlanResult
                    key={t.id}
                    plan={t.plan}
                    mock={mock}
                    busy={!!pending}
                    providers={providerMap}
                    providersState={providers}
                    onEdit={editField}
                    onAnswer={setReplyTo}
                    save={{ onSave: save, saving, saved: !!saved, dirty }}
                  />
                )
              }
              return (
                <div key={t.id} className="plan-msg ai">
                  {t.text || 'Updated the plan.'}
                </div>
              )
            })}
            {pending && <PlanningState refining={pending.refining} />}
            {error && <PlanError error={error} onRetry={retry} />}
          </div>
          <div className="plan-dock">
            <Composer
              value={draft}
              onChange={setDraft}
              onSubmit={(text) => send(text)}
              busy={!!pending}
              replyTo={replyTo}
              onClearReply={() => setReplyTo(null)}
              placeholder={replyTo ? 'Your answer…' : brief ? 'Refine it: “make it cheaper”, “what about July?”' : 'Describe your event…'}
            />
          </div>
        </>
      )}

      <Sheet open={eventsOpen} onClose={() => setEventsOpen(false)} title="My events">
        {started && (
          <button type="button" className="btn ghost block" onClick={() => { reset(); setEventsOpen(false) }}>
            <SquarePen size={15} /> Start a new plan
          </button>
        )}
        <div className="mt-sm">
          <MyEvents query={events} onOpen={openEvent} activeId={saved?.id} />
        </div>
      </Sheet>
    </div>
  )
}

function PlanResult({ plan, mock, busy, providers, providersState, onEdit, onAnswer, save }) {
  const { brief, questions, budget, recommendations, coming_soon: comingSoon } = plan
  return (
    <div className="plan-result">
      <div className="plan-reply">
        <span className="plan-ai-mark"><Sparkles size={15} /></span>
        <div className="grow">
          <p>{plan.reply || 'Here’s what I put together.'}</p>
          <EngineTag engine={plan.engine} mock={mock} />
        </div>
      </div>

      <BriefChips brief={brief} onEdit={onEdit} disabled={busy} />

      {questions.length > 0 && (
        <div className="plan-questions">
          <div className="plan-label">To sharpen the plan</div>
          <div className="chips">
            {questions.map((q) => (
              <button key={q} type="button" className="plan-q" onClick={() => onAnswer(q)} disabled={busy}>
                <MessageCircleQuestion size={14} /> {q}
              </button>
            ))}
          </div>
        </div>
      )}

      <BudgetBreakdown budget={budget} total={brief?.budget_total_cents} />

      {providersState.loading && !providersState.data ? (
        <Loading inline label="Loading vendors…" />
      ) : (
        <Recommendations recommendations={recommendations} providers={providers} brief={brief} />
      )}

      {comingSoon.length > 0 && (
        <div className="plan-card plan-soon">
          <Clock size={16} className="muted" />
          <div className="grow">
            <b className="small">Not bookable here yet: {comingSoon.map((c) => c.label).join(', ')}</b>
            <div className="muted tiny">Their share stays in the budget so the numbers add up. Know someone great? Invite them from Search.</div>
          </div>
        </div>
      )}

      {brief && (
        <div className="plan-save">
          {save.saved && !save.dirty ? (
            <div className="plan-saved"><BookmarkCheck size={16} /> Saved to My events</div>
          ) : (
            <button type="button" className="btn block" onClick={save.onSave} disabled={save.saving || busy}>
              <BookmarkPlus size={16} />
              {save.saving ? 'Saving…' : save.saved ? 'Save changes to this event' : 'Save as event'}
            </button>
          )}
          <div className="muted tiny plan-fineprint">The planner only drafts. Nothing is booked until you send a request and the vendor accepts.</div>
        </div>
      )}
    </div>
  )
}

// Dev aid: which engine answered.
function EngineTag({ engine, mock }) {
  if (!engine && !mock) return null
  return (
    <span className={`plan-engine ${engine === 'claude' ? 'claude' : ''}`} title="Which planner engine answered">
      {mock ? 'Mock · ' : ''}
      {engine === 'claude' ? 'Claude' : 'Rules engine'}
    </span>
  )
}
