import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import {
  Bookmark, Briefcase, ChevronLeft, ChevronRight, Compass, Heart, Info, MessageCircle, RotateCcw, Sparkles, Star, ThumbsDown, X,
} from 'lucide-react'
import Sheet from '../components/Sheet.jsx'
import { IdVerified, ProBadge } from '../components/Badges.jsx'
import ProfileLink from '../components/ProfileLink.jsx'
import SearchLauncher from '../components/SearchLauncher.jsx'
import { money, priceLabel, startingPrice } from '../components/Booking.jsx'
import { AvailabilityStrip } from './Profile.jsx'
import { useStore } from '../store.jsx'
import { discoverCards, getProvider, img, serviceCategories, tasteProfile } from '../data/mock.js'

const THRESHOLD = 90
const CATEGORIES = serviceCategories.filter((c) => c !== 'Meetups')

export default function Discover() {
  const navigate = useNavigate()
  const {
    toast, discoverHistory: history, setDiscoverHistory: setHistory,
    corrections, addCorrections, removeCorrection, startConversation,
  } = useStore()

  const [category, setCategory] = useState(null)
  const [shot, setShot] = useState(0)
  const [tappedSides, setTappedSides] = useState(false) // hide the photo hint once used
  const [drag, setDrag] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [exit, setExit] = useState(null) // like | pass | save
  const [sheet, setSheet] = useState(null) // details | correct | taste | shortlist
  const [picked, setPicked] = useState(new Set())
  const [match, setMatch] = useState(null) // provider id
  const [matched, setMatched] = useState(new Set())
  const start = useRef(null)

  const seen = new Set(history.map((h) => h.id))
  const hidden = (c) => c.tags.some((t) => corrections.includes(t)) || corrections.includes(getProvider(c.authorId).name)
  const deck = discoverCards.filter((c) => !seen.has(c.id) && !hidden(c) && (!category || c.category === category))
  const card = deck[0]
  const next = deck[1]
  const p = card && getProvider(card.authorId)

  const likes = history.filter((h) => h.action === 'like' || h.action === 'save')
  const shortlist = Object.values(
    likes.reduce((acc, h) => {
      const c = discoverCards.find((x) => x.id === h.id)
      acc[c.authorId] ??= { provider: getProvider(c.authorId), cards: [] }
      acc[c.authorId].cards.push(c)
      return acc
    }, {}),
  ).sort((a, b) => b.cards.length - a.cards.length)

  const decide = (action) => {
    if (!card || exit) return
    setExit(action)
    setSheet(null)
    const liked = action === 'like' || action === 'save'
    const likedFromAuthor = likes.filter((h) => discoverCards.find((x) => x.id === h.id).authorId === card.authorId).length + (liked ? 1 : 0)
    setTimeout(() => {
      setHistory((h) => [...h, { id: card.id, action }])
      setExit(null)
      setDrag({ x: 0, y: 0 })
      setShot(0)
      if (liked && likedFromAuthor === 2 && !matched.has(card.authorId)) {
        setMatched(new Set([...matched, card.authorId]))
        setMatch(card.authorId)
      }
    }, 260)
  }

  const undo = () => {
    if (!history.length) return
    setHistory(history.slice(0, -1))
    setShot(0)
  }

  const onDown = (e) => {
    if (exit) return
    const rect = e.currentTarget.getBoundingClientRect()
    start.current = { x: e.clientX, y: e.clientY, left: rect.left, width: rect.width }
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e) => {
    if (!start.current) return
    setDrag({ x: e.clientX - start.current.x, y: e.clientY - start.current.y })
  }
  const onUp = (e) => {
    if (!start.current) return
    const { left, width } = start.current
    start.current = null
    setDragging(false)
    const { x, y } = drag
    if (Math.abs(x) < 6 && Math.abs(y) < 6) {
      const rel = (e.clientX - left) / width
      // Tap the edges to flip through photos; the last photo wraps back to the first.
      if (rel < 0.3) { setShot((s) => Math.max(0, s - 1)); setTappedSides(true) }
      else if (rel > 0.7) { setShot((s) => (s + 1) % card.seeds.length); setTappedSides(true) }
      else setSheet('details')
      setDrag({ x: 0, y: 0 })
    } else if (x > THRESHOLD) decide('like')
    else if (x < -THRESHOLD) decide('pass')
    else if (y < -THRESHOLD) decide('save')
    else setDrag({ x: 0, y: 0 })
  }

  const submitCorrection = () => {
    addCorrections([...picked])
    toast(`Got it. You'll see less ${[...picked].join(', ')}.`)
    setSheet(null)
    setPicked(new Set())
    setShot(0)
  }

  const message = (id) => navigate(`/inbox/${startConversation(id)}`)

  const exitTransform = {
    like: 'translate(140%, 0) rotate(20deg)',
    pass: 'translate(-140%, 0) rotate(-20deg)',
    save: 'translate(0, -140%)',
  }
  const transform = exit ? exitTransform[exit] : `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x / 18}deg)`
  const stop = (e) => e.stopPropagation()

  return (
    <div className="discover">
      <header className="home-header">
        <div className="title-lg">Discover</div>
        <div className="row gap-xs">
          <button className="pill-btn" onClick={() => setSheet('taste')}>
            <Sparkles size={14} /> Your taste
          </button>
          <button className="pill-btn" onClick={() => setSheet('shortlist')} aria-label="Shortlist">
            <Heart size={14} /> {shortlist.length}
          </button>
        </div>
      </header>

      <div className="pad-x mb-sm">
        <SearchLauncher />
      </div>

      <div className="chips scroll-x pad-x">
        <button className={`chip toggle ${!category ? 'on' : ''}`} onClick={() => { setCategory(null); setShot(0) }}>All styles</button>
        {CATEGORIES.map((c) => (
          <button key={c} className={`chip toggle ${category === c ? 'on' : ''}`} onClick={() => { setCategory(c); setShot(0) }}>
            {c}
          </button>
        ))}
      </div>

      <div className="deck mt-sm">
        {!card && (
          <div className="empty">
            <Compass size={40} />
            <h3>You've seen everything{category ? ` in ${category}` : ''}</h3>
            <p className="muted small">Check your shortlist, or try another category.</p>
            <div className="row gap-xs">
              {shortlist.length > 0 && <button className="btn" onClick={() => setSheet('shortlist')}>See shortlist ({shortlist.length})</button>}
              <button className="btn ghost" onClick={() => setHistory([])}>Start over</button>
            </div>
          </div>
        )}
        {next && (
          <div className="swipe-card behind">
            <img src={img(next.seeds[0], 600, 860)} alt="" draggable={false} />
          </div>
        )}
        {card && (
          <div
            key={card.id}
            className={`swipe-card ${dragging ? 'dragging' : ''}`}
            style={{ transform, transition: dragging ? 'none' : 'transform .26s ease' }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            <img src={img(card.seeds[shot], 600, 860)} alt="" draggable={false} />

            {card.seeds.length > 1 && (
              <>
                {shot > 0 && <span className="edge-hint left"><ChevronLeft size={18} /></span>}
                <span className="edge-hint right"><ChevronRight size={18} /></span>
              </>
            )}
            {!tappedSides && card.seeds.length > 1 && (
              <div className="tap-hint">Tap the edges for {card.seeds.length} photos · swipe to like or pass</div>
            )}

            <div className="shot-bars">
              {card.seeds.map((s, i) => (
                <span key={s} className={i === shot ? 'on' : ''} />
              ))}
            </div>
            <div className="card-top">
              <div className={`why-chip ${card.exploration ? 'explore' : ''}`}>
                {card.exploration ? <Compass size={13} /> : <Sparkles size={13} />}
                {card.reason}
              </div>
              <button className="card-icon" onPointerDown={stop} onClick={() => setSheet('correct')} aria-label="Not into this">
                <ThumbsDown size={16} />
              </button>
            </div>

            <span className="stamp like" style={{ opacity: exit === 'like' ? 1 : Math.max(0, drag.x / THRESHOLD) }}>LIKE</span>
            <span className="stamp pass" style={{ opacity: exit === 'pass' ? 1 : Math.max(0, -drag.x / THRESHOLD) }}>PASS</span>
            <span className="stamp save" style={{ opacity: exit === 'save' ? 1 : Math.max(0, -drag.y / THRESHOLD) }}>SHORTLIST</span>

            <div className="card-foot">
              <div className="row gap-xs">
                <ProfileLink id={p.id} className="card-profile">
                  <img className="avatar" src={p.avatar} alt="" />
                </ProfileLink>
                <div className="grow">
                  <div className="row gap-xs">
                    <ProfileLink id={p.id} className="card-profile"><b>{p.name}</b></ProfileLink>
                    {p.idVerified && <IdVerified />}
                    {p.pro && <ProBadge />}
                  </div>
                  <div className="tiny row gap-xs">
                    <Star size={11} fill="currentColor" className="star-on" /> {p.rating}
                    <span>· {card.category} · from {money(startingPrice(p))} · {p.distanceKm} km</span>
                  </div>
                </div>
                <div className="match light">
                  <b>{p.tasteMatch}%</b>
                  <span>match</span>
                </div>
              </div>
              <div className="exif-mono">{card.exif}</div>
            </div>
          </div>
        )}
      </div>

      <div className="swipe-actions">
        <button className="round-btn small" onClick={undo} disabled={!history.length} aria-label="Undo">
          <RotateCcw size={18} />
        </button>
        <button className="round-btn pass" onClick={() => decide('pass')} disabled={!card} aria-label="Pass">
          <X size={28} />
        </button>
        <button className="round-btn save" onClick={() => decide('save')} disabled={!card} aria-label="Shortlist">
          <Bookmark size={22} />
        </button>
        <button className="round-btn like" onClick={() => decide('like')} disabled={!card} aria-label="Like">
          <Heart size={28} />
        </button>
        <button className="round-btn small" onClick={() => setSheet('details')} disabled={!card} aria-label="Details">
          <Info size={18} />
        </button>
      </div>

      {/* Card details: who shot it, settings, packages and availability */}
      <Sheet open={sheet === 'details' && !!card} onClose={() => setSheet(null)}>
        {card && (
          <>
            <div className="detail-shots">
              {card.seeds.map((s) => (
                <img key={s} src={img(s, 300, 400)} alt="" />
              ))}
            </div>
            <Link to={`/u/${p.id}`} className="row gap-xs mt">
              <img className="avatar" src={p.avatar} alt="" />
              <div className="grow">
                <div className="person-name">
                  {p.name} {p.idVerified && <IdVerified />} {p.pro && <ProBadge />}
                </div>
                <div className="muted tiny">{p.city} · ★ {p.rating} ({p.reviewCount})</div>
              </div>
              <div className="match"><b>{p.tasteMatch}%</b><span>match</span></div>
            </Link>
            <div className="note mt-sm"><Sparkles size={14} /> {card.reason}</div>
            <div className="row between mt-sm small">
              <span className="muted">Settings</span>
              <span className="exif-mono dark">{card.exif}</span>
            </div>
            <div className="chips mt-sm">
              {card.tags.map((t) => <span key={t} className="chip">{t}</span>)}
            </div>
            <h4 className="section-title">Packages</h4>
            {p.packages.map((pkg) => (
              <div key={pkg.id} className="row between small line">
                <span>{pkg.name}</span>
                <b>{priceLabel(pkg)}</b>
              </div>
            ))}
            <h4 className="section-title">Next 2 weeks</h4>
            <AvailabilityStrip unavailable={p.unavailable} />
            <div className="row gap-xs mt">
              <button className="btn ghost grow" onClick={() => message(p.id)}><MessageCircle size={16} /> Ask</button>
              <Link className="btn ghost grow" to={`/u/${p.id}`}>Profile</Link>
              <Link className="btn accent grow" to={`/book/${p.id}`}>Book</Link>
            </div>
          </>
        )}
      </Sheet>

      <Sheet open={sheet === 'correct'} onClose={() => setSheet(null)} title="Not into this">
        <p className="muted small">Pick what you'd like to see less of. This counts more than a regular pass.</p>
        <div className="chips mt">
          {card &&
            [...card.tags, p.name].map((t) => (
              <button
                key={t}
                className={`chip toggle ${picked.has(t) ? 'on' : ''}`}
                onClick={() => {
                  const n = new Set(picked)
                  n.has(t) ? n.delete(t) : n.add(t)
                  setPicked(n)
                }}
              >
                {t === p.name ? `This photographer (${t})` : t}
              </button>
            ))}
        </div>
        <button className="btn block mt" disabled={!picked.size} onClick={submitCorrection}>Show me less of this</button>
      </Sheet>

      <Sheet open={sheet === 'taste'} onClose={() => setSheet(null)} title="Your taste">
        <p className="muted small">
          Learned from {tasteProfile.swipes + history.length} swipes. We use it to rank photographers for you.
        </p>
        <div className="mt">
          {tasteProfile.styles.map((s) => (
            <div key={s.tag} className="taste-row">
              <span>{s.tag}</span>
              <div className="taste-bar"><div style={{ width: `${s.weight * 100}%` }} /></div>
            </div>
          ))}
        </div>
        <h4 className="section-title">Showing you less</h4>
        {corrections.length === 0 && <div className="muted small">Nothing yet.</div>}
        <div className="chips">
          {corrections.map((t) => (
            <button key={t} className="chip" onClick={() => removeCorrection(t)}>
              {t} <X size={12} />
            </button>
          ))}
        </div>
        <div className="note mt">
          <Compass size={14} /> About 1 in 7 cards is something outside your usual taste, so you can find new styles.
        </div>
      </Sheet>

      <Sheet open={sheet === 'shortlist'} onClose={() => setSheet(null)} title="Your shortlist">
        {shortlist.length === 0 && (
          <div className="muted small">Swipe right or tap the bookmark to shortlist photographers whose work you like.</div>
        )}
        {shortlist.map(({ provider: sp, cards }) => (
          <div key={sp.id} className="shortlist-item">
            <Link to={`/u/${sp.id}`} className="row gap-xs">
              <img className="avatar" src={sp.avatar} alt="" />
              <div className="grow">
                <div className="person-name">{sp.name} {sp.pro && <ProBadge />}</div>
                <div className="muted tiny">
                  You liked {cards.length} shot{cards.length > 1 ? 's' : ''} · from {money(startingPrice(sp))}
                </div>
              </div>
              <div className="match"><b>{sp.tasteMatch}%</b><span>match</span></div>
            </Link>
            <div className="shortlist-shots">
              {cards.map((c) => <img key={c.id} src={img(c.seeds[0], 200, 200)} alt="" />)}
            </div>
            <div className="row gap-xs">
              <Link className="btn ghost sm grow" to={`/u/${sp.id}`}>Profile</Link>
              <button className="btn ghost sm grow" onClick={() => message(sp.id)}>Message</button>
              <Link className="btn sm grow" to={`/book/${sp.id}`}>Book</Link>
            </div>
          </div>
        ))}
      </Sheet>

      {match && <MatchOverlay provider={getProvider(match)} cards={shortlist.find((s) => s.provider.id === match)?.cards || []} onClose={() => setMatch(null)} onMessage={() => message(match)} />}
    </div>
  )
}

function MatchOverlay({ provider, cards, onClose, onMessage }) {
  return createPortal(
    <div className="match-overlay" onClick={onClose}>
      <div className="match-card" onClick={(e) => e.stopPropagation()}>
        <div className="match-shots">
          {cards.slice(0, 2).map((c, i) => (
            <img key={c.id} src={img(c.seeds[0], 300, 400)} alt="" className={i ? 'r' : 'l'} />
          ))}
          <Link to={`/u/${provider.id}`}>
            <img className="match-avatar" src={provider.avatar} alt="" />
          </Link>
        </div>
        <h2>You keep liking <Link to={`/u/${provider.id}`} className="underline-link">{provider.name.split(' ')[0]}</Link>'s work</h2>
        <p className="muted small">
          {provider.tasteMatch}% taste match · {provider.specialties.join(', ')} · from {money(startingPrice(provider))}
        </p>
        <Link to={`/book/${provider.id}`} className="btn accent block mt">
          <Briefcase size={16} /> See packages & book
        </Link>
        <button className="btn ghost block mt-sm" onClick={onMessage}>
          <MessageCircle size={16} /> Ask {provider.name.split(' ')[0]} a question
        </button>
        <button className="link-btn small mt-sm" onClick={onClose}>Keep swiping</button>
      </div>
    </div>,
    document.getElementById('phone'),
  )
}
