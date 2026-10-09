import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import {
  Bookmark, Briefcase, ChevronLeft, ChevronRight, Compass, Heart, Images, Info, MessageCircle, RotateCcw, Sparkles, Star, ThumbsDown, X,
} from 'lucide-react'
import Sheet from '../components/Sheet.jsx'
import { IdVerified, ProBadge } from '../components/Badges.jsx'
import ProfileLink from '../components/ProfileLink.jsx'
import SearchLauncher from '../components/SearchLauncher.jsx'
import { money, priceLabel, startingPrice } from '../components/Booking.jsx'
import { EmptyState, ErrorState, Loading } from '../components/States.jsx'
import { useStore } from '../store.jsx'
import { useAuth } from '../auth.jsx'
import useQuery from '../lib/useQuery.js'
import { addDays, toKey, today } from '../lib/dates.js'
import { freeDays, getCategories, getMatches, listProviders } from '../api/catalog.js'
import { getFeed, getTasteProfile, logSwipe, undoSwipe } from '../api/discover.js'
import { startInquiry } from '../api/messages.js'

const THRESHOLD = 90
const BATCH = 20 // cards per feed request (signed in: small batches so ranking keeps up with swipes)
const BATCH_SIGNED_OUT = 50 // signed out the feed doesn't change, so take as much as it gives
const LOW_WATER = 3 // fetch more when fewer cards than this are left
const signInLink = `/sign-in?next=${encodeURIComponent('/discover')}`

export default function Discover() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const uid = user?.id ?? null
  const {
    toast, discoverHistory: history, setDiscoverHistory: setHistory,
    corrections, addCorrections, removeCorrection, shortlist, toggleShortlist,
  } = useStore()

  const [category, setCategory] = useState(null) // service slug, or null for all
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

  const cats = useQuery(() => getCategories(), [])
  const categories = (cats.data || []).filter((c) => c.slug !== 'meetups')
  const categoryName = categories.find((c) => c.slug === category)?.name
  // % match per photographer (signed in, after a few likes).
  const matches = useQuery(uid ? () => getMatches() : null, [uid])
  const matchOf = (providerId) => matches.data?.get(providerId) ?? null

  // ---- the feed --------------------------------------------------------------
  // `cards` accumulates every card fetched for the current category; the deck is
  // the ones not swiped yet this session and not hidden by "Not into this".
  const [cards, setCards] = useState([])
  const [feed, setFeed] = useState({ loading: false, error: null, done: false })
  const [restartKey, setRestartKey] = useState(0)
  const generation = useRef(0)

  const seen = new Set(history.map((h) => h.id))
  const hidden = (c) => c.tags.some((t) => corrections.includes(t))
  const deck = cards.filter((c) => !seen.has(c.id) && !hidden(c))
  const card = deck[0]
  const next = deck[1]
  const p = card?.provider

  const latest = useRef({})
  latest.current = { cards, seen, hidden }

  // Start the feed over when the category or the user changes (or on request).
  useEffect(() => {
    generation.current++
    setCards([])
    setFeed({ loading: false, error: null, done: false })
  }, [category, uid, restartKey])

  // Top up the deck when it runs low. Signed in, the feed leaves out photos
  // already swiped; signed out it repeats, so only genuinely new cards count.
  const needMore = deck.length < LOW_WATER && !feed.loading && !feed.done && !feed.error
  useEffect(() => {
    if (!needMore) return
    const gen = generation.current
    setFeed((f) => ({ ...f, loading: true }))
    getFeed({ limit: uid ? BATCH : BATCH_SIGNED_OUT, category }).then(
      (rows) => {
        if (gen !== generation.current) return
        const { cards: have, seen: swiped, hidden: isHidden } = latest.current
        const known = new Set(have.map((c) => c.id))
        const fresh = rows.filter((c) => !known.has(c.id) && !swiped.has(c.id) && !isHidden(c))
        setCards((prev) => [...prev, ...fresh.filter((c) => !prev.some((x) => x.id === c.id))])
        setFeed({ loading: false, error: null, done: fresh.length === 0 })
      },
      (error) => {
        if (gen !== generation.current) return
        console.warn(error)
        setFeed({ loading: false, error, done: false })
      },
    )
  }, [needMore, category, uid, restartKey])

  // How long each card was on screen (a taste signal).
  const shownAt = useRef(Date.now())
  useEffect(() => {
    shownAt.current = Date.now()
  }, [card?.id])

  // Swipe ids arrive asynchronously; keep them so undo works even mid-request.
  const pendingSwipes = useRef(new Map()) // card id -> Promise<swipeId|null>
  const swipeIds = useRef(new Map()) // card id -> swipeId

  const likes = history.filter((h) => h.action === 'like' || h.action === 'save')
  const likedCardsFrom = (providerId) => likes.filter((h) => h.providerId === providerId).map((h) => h.card).filter(Boolean)

  const decide = (action) => {
    if (!card || exit) return
    const c = card
    setExit(action)
    setSheet(null)
    const liked = action === 'like' || action === 'save'
    const likedFromAuthor = likes.filter((h) => h.providerId === c.authorId).length + (liked ? 1 : 0)

    // Swiping up shortlists the photographer.
    let addedToShortlist = false
    if (action === 'save' && uid && !shortlist.has(c.authorId)) addedToShortlist = toggleShortlist(c.authorId)

    const promise = logSwipe(c, action, { dwellMs: Date.now() - shownAt.current, position: history.length })
      .then((swipeId) => {
        swipeIds.current.set(c.id, swipeId)
        if (swipeId) setHistory((h) => h.map((e) => (e.id === c.id ? { ...e, swipeId } : e)))
        if (uid && liked) matches.reload()
        return swipeId
      })
      .catch((e) => {
        console.warn(e)
        toast('Couldn’t save that swipe')
        return null
      })
    pendingSwipes.current.set(c.id, promise)

    setTimeout(() => {
      setHistory((h) => [
        ...h,
        { id: c.id, action, swipeId: swipeIds.current.get(c.id) ?? null, providerId: c.authorId, card: c, addedToShortlist },
      ])
      setExit(null)
      setDrag({ x: 0, y: 0 })
      setShot(0)
      if (liked && likedFromAuthor === 2 && !matched.has(c.authorId)) {
        setMatched(new Set([...matched, c.authorId]))
        setMatch(c.authorId)
      }
    }, 260)
  }

  const undo = async () => {
    const last = history[history.length - 1]
    if (!last || exit) return
    setHistory(history.slice(0, -1))
    // Put the card back on top of the deck (it may be gone after a category change).
    if (last.card && !cards.some((c) => c.id === last.id)) setCards((prev) => [last.card, ...prev])
    setShot(0)
    if (last.addedToShortlist && shortlist.has(last.providerId)) toggleShortlist(last.providerId)
    try {
      const swipeId = last.swipeId ?? (await pendingSwipes.current.get(last.id))
      if (swipeId) {
        await undoSwipe(swipeId)
        if (uid) matches.reload()
      }
    } catch (e) {
      console.warn(e)
      toast('Couldn’t undo that swipe')
    }
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
      else if (rel > 0.7) { setShot((s) => (s + 1) % card.photos.length); setTappedSides(true) }
      else setSheet('details')
      setDrag({ x: 0, y: 0 })
    } else if (x > THRESHOLD) decide('like')
    else if (x < -THRESHOLD) decide('pass')
    else if (y < -THRESHOLD) decide('save')
    else setDrag({ x: 0, y: 0 })
  }

  const submitCorrection = () => {
    if (!uid) return
    addCorrections([...picked])
    toast(`Got it. You'll see less ${[...picked].join(', ')}.`)
    setSheet(null)
    setPicked(new Set())
    setShot(0)
    // Refetch once the correction has been written, so the ranking accounts for it.
    // (Matching cards already in the deck are hidden right away.)
    setTimeout(() => setRestartKey((k) => k + 1), 600)
  }

  const message = (providerId) => {
    if (!uid) return navigate(signInLink)
    startInquiry(providerId)
      .then((conversationId) => navigate(`/inbox/${conversationId}`))
      .catch((e) => {
        console.warn(e)
        toast('Couldn’t start a conversation. Try again.')
      })
  }

  const startOver = () => {
    if (!uid) setHistory([])
    setRestartKey((k) => k + 1)
  }

  const pickCategory = (slug) => {
    setCategory(slug)
    setShot(0)
  }

  const exitTransform = {
    like: 'translate(140%, 0) rotate(20deg)',
    pass: 'translate(-140%, 0) rotate(-20deg)',
    save: 'translate(0, -140%)',
  }
  const transform = exit ? exitTransform[exit] : `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x / 18}deg)`
  const stop = (e) => e.stopPropagation()
  const photo = card?.photos[shot] ?? card?.photos[0]
  const cardMatch = p ? matchOf(p.id) : null

  return (
    <div className="discover">
      <header className="home-header">
        <div className="title-lg">Discover</div>
        <div className="row gap-xs">
          <button className="pill-btn" onClick={() => setSheet('taste')}>
            <Sparkles size={14} /> Your taste
          </button>
          <button className="pill-btn" onClick={() => setSheet('shortlist')} aria-label="Shortlist">
            <Heart size={14} /> {shortlist.size}
          </button>
        </div>
      </header>

      <div className="pad-x mb-sm">
        <SearchLauncher />
      </div>

      <div className="chips scroll-x pad-x">
        <button className={`chip toggle ${!category ? 'on' : ''}`} onClick={() => pickCategory(null)}>All styles</button>
        {categories.map((c) => (
          <button key={c.slug} className={`chip toggle ${category === c.slug ? 'on' : ''}`} onClick={() => pickCategory(c.slug)}>
            {c.name}
          </button>
        ))}
      </div>

      <div className="deck mt-sm">
        {!card && (feed.error ? (
          <ErrorState error={feed.error} onRetry={() => setFeed((f) => ({ ...f, error: null }))} />
        ) : !feed.done ? (
          <Loading label="Finding photos for you…" />
        ) : (
          <EmptyState
            icon={Compass}
            title={`You've seen everything${categoryName ? ` in ${categoryName}` : ''}`}
            text={
              uid
                ? 'New work shows up here as photographers post. Check your shortlist, or try another style.'
                : 'Try another style, or start over. Sign in to save what you like and get matched.'
            }
            action={
              <div className="row gap-xs wrap discover-empty-actions">
                {shortlist.size > 0 && <button className="btn" onClick={() => setSheet('shortlist')}>See shortlist ({shortlist.size})</button>}
                {category && <button className="btn ghost" onClick={() => pickCategory(null)}>All styles</button>}
                <button className="btn ghost" onClick={startOver}>{uid ? 'Check again' : 'Start over'}</button>
              </div>
            }
          />
        ))}
        {next && (
          <div className="swipe-card behind">
            <img src={next.photos[0]?.src} alt="" draggable={false} />
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
            <img src={photo?.src} alt={card.title || ''} draggable={false} />

            {card.photos.length > 1 && (
              <>
                {shot > 0 && <span className="edge-hint left"><ChevronLeft size={18} /></span>}
                <span className="edge-hint right"><ChevronRight size={18} /></span>
              </>
            )}
            {!tappedSides && card.photos.length > 1 && (
              <div className="tap-hint">Tap the edges for {card.photos.length} photos · swipe to like or pass</div>
            )}

            {card.photos.length > 1 && (
              <div className="shot-bars">
                {card.photos.map((ph, i) => (
                  <span key={ph.id} className={i === shot ? 'on' : ''} />
                ))}
              </div>
            )}
            <div className="card-top">
              {card.reason && (
                <div className={`why-chip ${card.exploration ? 'explore' : ''}`}>
                  {card.exploration ? <Compass size={13} /> : <Sparkles size={13} />}
                  {card.reason}
                </div>
              )}
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
                    {p.rating != null ? (
                      <><Star size={11} fill="currentColor" className="star-on" /> {p.rating.toFixed(1)}</>
                    ) : (
                      <span>New</span>
                    )}
                    <span>
                      {[card.category, startingPrice(p) != null && `from ${money(startingPrice(p))}`].filter(Boolean).map((s) => `· ${s}`).join(' ')}
                    </span>
                  </div>
                </div>
                {cardMatch != null && (
                  <div className="match light">
                    <b>{cardMatch}%</b>
                    <span>match</span>
                  </div>
                )}
              </div>
              {card.exif && <div className="exif-mono">{card.exif}</div>}
            </div>
          </div>
        )}
      </div>

      <div className="swipe-actions">
        <button className="round-btn small" onClick={undo} disabled={!history.length || !!exit} aria-label="Undo">
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
            {card.title && <h3 className="mb-sm">{card.title}</h3>}
            <div className="detail-shots">
              {card.photos.map((ph) => (
                <Link key={ph.id} to={`/gallery/${p.id}?post=${card.albumId}&photo=${ph.id}`}>
                  <img src={ph.src} alt="" />
                </Link>
              ))}
            </div>
            <Link to={`/gallery/${p.id}?post=${card.albumId}&photo=${photo?.id ?? card.photoId}`} className="small inline-icon mt-sm">
              <Images size={14} /> View the full album
            </Link>
            <Link to={`/u/${p.id}`} className="row gap-xs mt">
              <img className="avatar" src={p.avatar} alt="" />
              <div className="grow">
                <div className="person-name">
                  {p.name} {p.idVerified && <IdVerified />} {p.pro && <ProBadge />}
                </div>
                <div className="muted tiny">
                  {[p.city, p.rating != null ? `★ ${p.rating.toFixed(1)} (${p.reviewCount})` : 'New, no reviews yet'].filter(Boolean).join(' · ')}
                </div>
              </div>
              {cardMatch != null && <div className="match"><b>{cardMatch}%</b><span>match</span></div>}
            </Link>
            {card.reason && <div className="note mt-sm"><Sparkles size={14} /> {card.reason}</div>}
            {card.exif && (
              <div className="row between mt-sm small">
                <span className="muted">Settings</span>
                <span className="exif-mono dark">{card.exif}</span>
              </div>
            )}
            {card.tags.length > 0 && (
              <div className="chips mt-sm">
                {card.tags.map((t) => <span key={t} className="chip">{t}</span>)}
              </div>
            )}
            <h4 className="section-title">Packages</h4>
            {p.packages.length === 0 && <div className="muted small">No packages listed yet. Ask for a quote.</div>}
            {p.packages.map((pkg) => (
              <div key={pkg.id} className="row between small line">
                <span>{pkg.name}</span>
                <b>{priceLabel(pkg)}</b>
              </div>
            ))}
            <h4 className="section-title">Next 2 weeks</h4>
            <NextTwoWeeks providerId={p.id} />
            <div className="row gap-xs mt">
              <button className="btn ghost grow" onClick={() => message(p.id)}><MessageCircle size={16} /> Ask</button>
              <Link className="btn ghost grow" to={`/u/${p.id}`}>Profile</Link>
              <Link className="btn accent grow" to={`/book/${p.id}`}>Book</Link>
            </div>
          </>
        )}
      </Sheet>

      <Sheet open={sheet === 'correct'} onClose={() => setSheet(null)} title="Not into this">
        {!uid ? (
          <>
            <p className="muted small">Sign in to tune your feed. We'll hide styles you're not into and remember it next time.</p>
            <Link className="btn block mt" to={signInLink}>Sign in</Link>
          </>
        ) : card && card.tags.length > 0 ? (
          <>
            <p className="muted small">Pick what you'd like to see less of. This counts more than a regular pass.</p>
            <div className="chips mt">
              {card.tags.map((t) => (
                <button
                  key={t}
                  className={`chip toggle ${picked.has(t) ? 'on' : ''}`}
                  onClick={() => {
                    const n = new Set(picked)
                    n.has(t) ? n.delete(t) : n.add(t)
                    setPicked(n)
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
            <button className="btn block mt" disabled={!picked.size} onClick={submitCorrection}>Show me less of this</button>
          </>
        ) : (
          <p className="muted small">This photo hasn't been tagged yet. Swipe left to pass on it.</p>
        )}
      </Sheet>

      <Sheet open={sheet === 'taste'} onClose={() => setSheet(null)} title="Your taste">
        <TasteSheet open={sheet === 'taste'} uid={uid} corrections={corrections} removeCorrection={removeCorrection} />
      </Sheet>

      <Sheet open={sheet === 'shortlist'} onClose={() => setSheet(null)} title="Your shortlist">
        <ShortlistSheet
          open={sheet === 'shortlist'}
          uid={uid}
          shortlist={shortlist}
          likedCardsFrom={likedCardsFrom}
          matchOf={matchOf}
          onMessage={message}
          onRemove={toggleShortlist}
        />
      </Sheet>

      {match && (
        <MatchOverlay
          provider={cards.find((c) => c.authorId === match)?.provider || likedCardsFrom(match)[0]?.provider}
          cards={likedCardsFrom(match)}
          tasteMatch={matchOf(match)}
          signedIn={!!uid}
          shortlisted={shortlist.has(match)}
          onShortlist={() => toggleShortlist(match)}
          onClose={() => setMatch(null)}
          onMessage={() => message(match)}
        />
      )}
    </div>
  )
}

// Which of the next 14 days the photographer is free (working hours, time off and bookings).
function NextTwoWeeks({ providerId }) {
  const days = Array.from({ length: 14 }, (_, i) => addDays(today(), i))
  const free = useQuery(() => freeDays(providerId, days), [providerId])
  if (free.loading) return <Loading inline />
  if (free.error) return <ErrorState error={free.error} onRetry={free.reload} />
  return (
    <div className="avail-strip">
      {days.map((d) => {
        const busy = !free.data?.has(toKey(d))
        return (
          <div key={toKey(d)} className={`avail-day ${busy ? 'busy' : ''}`} title={busy ? 'Not available' : 'Available'}>
            <span>{d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2)}</span>
            <b>{d.getDate()}</b>
          </div>
        )
      })}
    </div>
  )
}

function TasteSheet({ open, uid, corrections, removeCorrection }) {
  const taste = useQuery(open && uid ? () => getTasteProfile() : null, [open, uid])
  if (!uid) {
    return (
      <>
        <p className="muted small">
          As you swipe, we learn the styles you like and use them to rank photographers for you. Sign in so your swipes are saved.
        </p>
        <Link className="btn block mt" to={signInLink}>Sign in</Link>
      </>
    )
  }
  if (taste.loading && !taste.data) return <Loading />
  if (taste.error) return <ErrorState error={taste.error} onRetry={taste.reload} />
  const t = taste.data
  if (!t) return null
  return (
    <>
      <p className="muted small">
        Learned from {t.swipes} swipe{t.swipes === 1 ? '' : 's'} ({t.likes} like{t.likes === 1 ? '' : 's'}). We use it to rank photographers for you.
      </p>
      <div className="mt">
        {t.styles.length === 0 && <div className="muted small">Like a few photos and the styles you like will show up here.</div>}
        {t.styles.map((s) => (
          <div key={s.tag} className="taste-row">
            <span>{s.tag}</span>
            <div className="taste-bar"><div style={{ width: `${s.weight * 100}%` }} /></div>
          </div>
        ))}
      </div>
      <h4 className="section-title">Showing you less</h4>
      {corrections.length === 0 && <div className="muted small">Nothing yet. Tap the thumbs-down on a photo to see less of a style.</div>}
      <div className="chips">
        {corrections.map((tag) => (
          <button key={tag} className="chip" onClick={() => removeCorrection(tag)}>
            {tag} <X size={12} />
          </button>
        ))}
      </div>
      <div className="note mt">
        <Compass size={14} /> About 1 in 7 cards is something outside your usual taste, so you can find new styles.
      </div>
    </>
  )
}

function ShortlistSheet({ open, uid, shortlist, likedCardsFrom, matchOf, onMessage, onRemove }) {
  const providers = useQuery(open && uid ? () => listProviders() : null, [open, uid])
  if (!uid) {
    return (
      <EmptyState
        icon={Bookmark}
        title="Keep a shortlist"
        text="Sign in to save photographers you like. Swipe up or tap the bookmark to add them."
        action={<Link className="btn" to={signInLink}>Sign in</Link>}
      />
    )
  }
  if (providers.loading && !providers.data) return <Loading />
  if (providers.error) return <ErrorState error={providers.error} onRetry={providers.reload} />
  const byId = new Map((providers.data || []).map((x) => [x.id, x]))
  const list = [...shortlist].map((id) => byId.get(id)).filter(Boolean)
  if (!list.length) {
    return (
      <EmptyState
        icon={Bookmark}
        title="No one shortlisted yet"
        text="Swipe up or tap the bookmark to shortlist photographers whose work you like."
      />
    )
  }
  return list.map((sp) => {
    const liked = likedCardsFrom(sp.id)
    const shots = liked.length ? liked.map((c) => ({ key: c.id, src: c.photos[0]?.src })) : sp.covers.slice(0, 4).map((src) => ({ key: src, src }))
    const m = matchOf(sp.id)
    return (
      <div key={sp.id} className="shortlist-item">
        <Link to={`/u/${sp.id}`} className="row gap-xs">
          <img className="avatar" src={sp.avatar} alt="" />
          <div className="grow">
            <div className="person-name">{sp.name} {sp.pro && <ProBadge />}</div>
            <div className="muted tiny">
              {[
                liked.length > 0 && `You liked ${liked.length} shot${liked.length > 1 ? 's' : ''}`,
                sp.rating != null ? `★ ${sp.rating.toFixed(1)}` : 'New',
                startingPrice(sp) != null && `from ${money(startingPrice(sp))}`,
              ].filter(Boolean).join(' · ')}
            </div>
          </div>
          {m != null && <div className="match"><b>{m}%</b><span>match</span></div>}
        </Link>
        {shots.length > 0 && (
          <div className="shortlist-shots">
            {shots.map((s) => <img key={s.key} src={s.src} alt="" />)}
          </div>
        )}
        <div className="row gap-xs">
          <Link className="btn ghost sm grow" to={`/u/${sp.id}`}>Profile</Link>
          <button className="btn ghost sm grow" onClick={() => onMessage(sp.id)}>Message</button>
          <Link className="btn sm grow" to={`/book/${sp.id}`}>Book</Link>
          <button className="btn ghost sm" onClick={() => onRemove(sp.id)} aria-label={`Remove ${sp.name} from shortlist`}><X size={14} /></button>
        </div>
      </div>
    )
  })
}

function MatchOverlay({ provider, cards, tasteMatch, signedIn, shortlisted, onShortlist, onClose, onMessage }) {
  if (!provider) return null
  const first = provider.name.split(' ')[0]
  return createPortal(
    <div className="match-overlay" onClick={onClose}>
      <div className="match-card" onClick={(e) => e.stopPropagation()}>
        <div className="match-shots">
          {cards.slice(0, 2).map((c, i) => (
            <img key={c.id} src={c.photos[0]?.src} alt="" className={i ? 'r' : 'l'} />
          ))}
          <Link to={`/u/${provider.id}`}>
            <img className="match-avatar" src={provider.avatar} alt="" />
          </Link>
        </div>
        <h2>You keep liking <Link to={`/u/${provider.id}`} className="underline-link">{first}</Link>'s work</h2>
        <p className="muted small">
          {[
            tasteMatch != null && `${tasteMatch}% taste match`,
            provider.specialties.join(', '),
            startingPrice(provider) != null && `from ${money(startingPrice(provider))}`,
          ].filter(Boolean).join(' · ')}
        </p>
        <Link to={`/book/${provider.id}`} className="btn accent block mt">
          <Briefcase size={16} /> See packages & book
        </Link>
        {signedIn ? (
          <>
            {!shortlisted && (
              <button className="btn ghost block mt-sm" onClick={onShortlist}>
                <Bookmark size={16} /> Add {first} to your shortlist
              </button>
            )}
            <button className="btn ghost block mt-sm" onClick={onMessage}>
              <MessageCircle size={16} /> Ask {first} a question
            </button>
          </>
        ) : (
          <div className="note mt-sm small">
            <span>
              Your swipes aren't saved while you're signed out. <Link to={signInLink} className="underline-link">Sign in</Link> to shortlist {first} and get matched to photographers like this.
            </span>
          </div>
        )}
        <button className="link-btn small mt-sm" onClick={onClose}>Keep swiping</button>
      </div>
    </div>,
    document.getElementById('phone'),
  )
}
