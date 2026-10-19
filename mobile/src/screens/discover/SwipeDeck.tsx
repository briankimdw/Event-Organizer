// Discover -> "For you": the swipe deck of photo & video work, narrowed by service chips
// (photography only: no vertical picker, no occasions). Native port of
// frontend/src/components/discover/SwipeDeck.jsx with the same data flow, all from the
// shared api/discover.js:
//   getDeck() in small batches (photo cards where photographers have posted, vendor cards for
//   photographers who haven't), topped up as the deck runs low;
//   logSwipe / undoSwipe (vendor cards log provider_id only), getDeckMatches() for % match,
//   "Not into this" (tags / traits, or hide a photographer), the session history in the store.
//   The service chip is remembered with read/writeDeckChoice.
// The card itself (drag, fly-out, taps) is SwipeCard.tsx; the sheets are DeckSheets.tsx.
import { useRouter } from 'expo-router'
import { Bookmark, Camera, Compass, Heart, Info, RotateCcw, Send, Sparkles, X, type LucideIcon } from 'lucide-react-native'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { useSharedValue } from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'

import { listProviders } from '@shared/api/catalog.js'
import {
  EVERYTHING, deckWords, getDeck, getDeckMatches, getHiddenVendors, hideVendor, logSwipe, normalizeDeckChoice, readDeckChoice, undoSwipe,
  unhideVendor, writeDeckChoice,
} from '@shared/api/discover.js'
import { listPostIndex, postFacets } from '@shared/api/home.js'
import { startInquiry } from '@shared/api/messages.js'
import { SERVICE_CHIPS } from '@shared/verticals/catalog.js'
import { Button, Chip, EmptyState, ErrorState, Loading, iconByName } from '@/components'
import type { Provider } from '@/types'
import { useInvite } from '@/screens/home/Browse'
import useQuery from '@/hooks/useQuery'
import { useAuth } from '@/state/auth'
import { useStore } from '@/state/store'
import { announce } from '@/lib/a11y'
import { makeStyles, useTheme } from '@/theme'
import { CorrectSheet, DetailsSheet, MatchOverlay, ShortlistSheet, TasteSheet } from './DeckSheets'
import { DiscoverHeader, PillButton } from './DiscoverHeader'
import { BehindCard, SwipeCard, type TapZone } from './SwipeCard'
import type { DeckCard, HistoryEntry, SwipeAction } from './types'

const BATCH = 8 // cards per feed request (signed in: small batches so ranking keeps up with swipes; services/ml/eval: 8 vs 20 roughly triples early like rate)
const BATCH_SIGNED_OUT = 50 // signed out the feed doesn't change, so take as much as it gives
const LOW_WATER = 3 // fetch more when fewer cards than this are left

type SheetName = null | 'details' | 'correct' | 'taste' | 'shortlist'

type Choice = { vertical: string; service: string | null; occasion: null }
type ServiceChip = { slug: string; name: string; icon: string }
// Remembered on the device (the localStorage shim is backed by AsyncStorage).
const storage = (): Storage | null => {
  try {
    return (globalThis as any).localStorage ?? null
  } catch {
    return null
  }
}
// ?s= wins over the remembered choice.
const startChoice = (sv?: string): Choice => {
  if (!sv) return readDeckChoice(storage()) as Choice
  return normalizeDeckChoice({ vertical: EVERYTHING, service: sv, occasion: null }) as Choice
}

export function SwipeDeck({ tabs, initialService }: { tabs: ReactNode; initialService?: string }) {
  const s = useStyles()
  const router = useRouter()
  const { user } = useAuth()
  const uid = user?.id ?? null
  const store = useStore()
  const { toast, corrections, addCorrections, removeCorrection, shortlist, toggleShortlist } = store
  const history = store.discoverHistory as HistoryEntry[]
  const setHistory = store.setDiscoverHistory as unknown as React.Dispatch<React.SetStateAction<HistoryEntry[]>>
  const signIn = () => router.push({ pathname: '/sign-in', params: { next: '/discover' } })
  const invite = useInvite()

  const [choice, setChoiceState] = useState<Choice>(() => startChoice(initialService))
  const { service: category } = choice
  const setChoice = (next: Partial<Choice>) => {
    const c = normalizeDeckChoice({ ...choice, ...next }) as Choice
    setChoiceState(c)
    writeDeckChoice(storage(), c)
    syncParams(c)
  }
  // Mirror the choice in the route params (?s=), so Explore picks it up and back keeps it.
  const syncParams = (c: Choice) => {
    if (c.service === (initialService ?? null)) return
    try {
      router.setParams({ s: c.service ?? undefined, v: undefined, o: undefined } as any)
    } catch (e) {
      console.warn(e) // not mounted yet: the choice is still remembered on the device
    }
  }
  const [hiddenVendors, setHiddenVendors] = useState<Set<string>>(new Set())
  const [shot, setShot] = useState(0)
  const [tappedSides, setTappedSides] = useState(false)
  const [exit, setExit] = useState<SwipeAction | null>(null)
  const [sheet, setSheet] = useState<SheetName>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [match, setMatch] = useState<string | null>(null)
  const [matched, setMatched] = useState<Set<string>>(new Set())
  const lastMatchAt = useRef(-99) // history length when the last match moment showed
  const busy = useRef(false)
  const chipRow = useRef<ScrollView>(null)
  const dragProgress = useSharedValue(0)

  // A link into Discover with ?s= (a service) switches the deck.
  useEffect(() => {
    if (initialService) setChoice(startChoice(initialService))
  }, [initialService]) // eslint-disable-line react-hooks/exhaustive-deps

  const feedKey = category ?? ''
  const words = deckWords() as { plural: string; finding: string; empty: string }
  // Chip data: posts and photographers per service (shared postFacets).
  const posts = useQuery<any[]>(() => listPostIndex(), [])
  const providers = useQuery<Provider[]>(() => listProviders(), [])
  const facets = postFacets(posts.data || [], { service: category } as any) as { total: number; services: Record<string, number> }
  // Service chips (photo and video): the ones with posts or photographers offering them.
  const offered = new Set((providers.data || []).flatMap((p) => p.categorySlugs || []))
  const categories = (SERVICE_CHIPS as ServiceChip[]).filter((x) => x.slug === category || facets.services[x.slug] || offered.has(x.slug))
  const categoryName = categories.find((x) => x.slug === category)?.name
  const nobodyYet = providers.data?.length === 0 && posts.data?.length === 0
  const matches = useQuery<Map<string, number>>(uid ? () => getDeckMatches() : null, [uid])
  // Vendors hidden with "Not into this" (getDeck leaves them out too; this hides them at once).
  useEffect(() => {
    setHiddenVendors(new Set())
    if (uid) getHiddenVendors().then((ids: Set<string>) => setHiddenVendors(ids), (e: unknown) => console.warn(e))
  }, [uid])
  const matchOf = (providerId: string) => matches.data?.get(providerId) ?? null

  // ---- the feed ------------------------------------------------------------
  const [cards, setCards] = useState<DeckCard[]>([])
  const [feed, setFeed] = useState<{ loading: boolean; error: any; done: boolean }>({ loading: false, error: null, done: false })
  const [restartKey, setRestartKey] = useState(0)
  const generation = useRef(0)

  const seen = new Set(history.map((h) => h.id))
  const hidden = (c: DeckCard) => hiddenVendors.has(c.authorId) || c.tags.some((t: string) => corrections.includes(t))
  const deck = cards.filter((c) => !seen.has(c.id) && !hidden(c))
  const card = deck[0]
  const next = deck[1]

  const latest = useRef({ cards, seen, hidden })
  latest.current = { cards, seen, hidden }

  useEffect(() => {
    chipRow.current?.scrollTo({ x: 0, animated: false }) // keep the picker chip in view after a switch
    generation.current++
    setCards([])
    setFeed({ loading: false, error: null, done: false })
  }, [feedKey, uid, restartKey])

  const needMore = deck.length < LOW_WATER && !feed.loading && !feed.done && !feed.error
  useEffect(() => {
    if (!needMore) return
    const gen = generation.current
    setFeed((f) => ({ ...f, loading: true }))
    const { cards: had, seen: swipedBefore } = latest.current
    const seenCards = [...had, ...history.map((h) => h.card).filter(Boolean)]
    getDeck({ service: category, limit: uid ? BATCH : BATCH_SIGNED_OUT, exclude: [...swipedBefore], seen: seenCards } as any).then(
      (rows: DeckCard[]) => {
        if (gen !== generation.current) return
        const { cards: have, seen: swiped, hidden: isHidden } = latest.current
        const known = new Set(have.map((c) => c.id))
        const fresh = rows.filter((c) => !known.has(c.id) && !swiped.has(c.id) && !isHidden(c))
        setCards((prev) => [...prev, ...fresh.filter((c) => !prev.some((x) => x.id === c.id))])
        setFeed({ loading: false, error: null, done: fresh.length === 0 })
      },
      (error: unknown) => {
        if (gen !== generation.current) return
        console.warn(error)
        setFeed({ loading: false, error, done: false })
      },
    )
  }, [needMore, feedKey, uid, restartKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // How long each card was on screen (a taste signal).
  const shownAt = useRef(Date.now())
  useEffect(() => {
    shownAt.current = Date.now()
    dragProgress.value = 0
  }, [card?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const pendingSwipes = useRef(new Map<string, Promise<string | null>>())
  const swipeIds = useRef(new Map<string, string | null>())
  const likes = history.filter((h) => h.action === 'like' || h.action === 'save')
  const likedCardsFrom = (providerId: string) => likes.filter((h) => h.providerId === providerId).map((h) => h.card).filter(Boolean)

  // A swipe begins (button or drag past the threshold): lock the deck, close sheets.
  const begin = (action: SwipeAction) => {
    if (!card || busy.current) return false
    busy.current = true
    setSheet(null)
    setExit(action)
    announce(action === 'like' ? `Liked ${card.provider.name}` : action === 'save' ? `Shortlisted ${card.provider.name}` : 'Passed')
    return true
  }

  // The card has left the screen: record the swipe and move on.
  const commit = (action: SwipeAction) => {
    const c = card
    if (!c) return
    const liked = action === 'like' || action === 'save'
    const likedFromAuthor = likes.filter((h) => h.providerId === c.authorId).length + (liked ? 1 : 0)

    let addedToShortlist = false
    if (action === 'save' && uid && !shortlist.has(c.authorId)) addedToShortlist = toggleShortlist(c.authorId)

    const promise: Promise<string | null> = logSwipe(c, action, { dwellMs: Date.now() - shownAt.current, position: history.length } as any)
      .then((swipeId: string | null) => {
        swipeIds.current.set(c.id, swipeId)
        if (swipeId) setHistory((h) => h.map((e) => (e.id === c.id ? { ...e, swipeId } : e)))
        if (uid && liked) matches.reload()
        return swipeId
      })
      .catch((e: unknown) => {
        console.warn(e)
        toast('Couldn’t save that swipe')
        return null
      })
    pendingSwipes.current.set(c.id, promise)

    setHistory((h) => [...h, { id: c.id, action, swipeId: swipeIds.current.get(c.id) ?? null, providerId: c.authorId, card: c, addedToShortlist }])
    setExit(null)
    setShot(0)
    busy.current = false
    // The match moment. Photos: the second liked photo from one photographer. A vendor card is
    // liked once: celebrate the first liked vendor card (not more often than every 6 cards).
    const firstVendorLikeHere = c.kind === 'vendor' && liked &&
      !likes.some((h) => h.card?.kind === 'vendor') &&
      history.length - lastMatchAt.current >= 6
    if (liked && !matched.has(c.authorId) && ((c.kind !== 'vendor' && likedFromAuthor === 2) || firstVendorLikeHere)) {
      lastMatchAt.current = history.length + 1
      setMatched(new Set([...matched, c.authorId]))
      setMatch(c.authorId)
    }
  }

  const decide = (action: SwipeAction) => {
    begin(action)
  }

  const undo = async () => {
    const last = history[history.length - 1]
    if (!last || busy.current) return
    setHistory(history.slice(0, -1))
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

  const onTap = (zone: TapZone) => {
    if (!card) return
    if (zone === 'prev') {
      setShot((x) => Math.max(0, x - 1))
      setTappedSides(true)
    } else if (zone === 'next') {
      setShot((x) => (x + 1) % card.photos.length)
      setTappedSides(true)
    } else if (zone === 'correct') setSheet('correct')
    else if (zone === 'profile') router.push(`/u/${card.provider.id}`)
    else setSheet('details')
  }

  const submitCorrection = () => {
    if (!uid) return
    addCorrections([...picked])
    toast(`Got it. You’ll see less ${[...picked].join(', ')}.`)
    setSheet(null)
    setPicked(new Set())
    setShot(0)
    setTimeout(() => setRestartKey((k) => k + 1), 600)
  }

  const message = (providerId: string) => {
    if (!uid) return signIn()
    setSheet(null)
    startInquiry(providerId)
      .then((conversationId: string) => router.push(`/inbox/${conversationId}`))
      .catch((e: unknown) => {
        console.warn(e)
        toast('Couldn’t start a conversation. Try again.')
      })
  }

  const startOver = () => {
    if (!uid) setHistory([])
    setRestartKey((k) => k + 1)
  }
  const pickCategory = (slug: string | null) => {
    setChoice({ service: slug })
    setShot(0)
  }
  // "Not into this" on a vendor card: hide them from Discover (signed in; undo in Your taste).
  const hideCardVendor = () => {
    if (!uid || !card) return
    const id = card.authorId
    setHiddenVendors((h) => new Set([...h, id]))
    setSheet(null)
    setShot(0)
    toast(`${card.provider.name} is hidden from Discover. Undo it in Your taste.`)
    hideVendor(id).catch((e: unknown) => {
      console.warn(e)
      toast('Couldn’t save that. Try again.')
    })
  }
  const showVendorAgain = (id: string) => {
    setHiddenVendors((h) => new Set([...h].filter((x) => x !== id)))
    return unhideVendor(id)
  }

  const scopeName = categoryName || ''
  const cardMatch = card ? matchOf(card.provider.id) : null
  const matchProvider = match ? cards.find((c) => c.authorId === match)?.provider || likedCardsFrom(match)[0]?.provider : null

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <DiscoverHeader
        tabs={tabs}
        right={
          <>
            <PillButton icon={Sparkles} label="Your taste" onPress={() => setSheet('taste')} />
            <PillButton icon={Heart} label={`Shortlist, ${shortlist.size}`} text={String(shortlist.size)} onPress={() => setSheet('shortlist')} />
          </>
        }
      />

      <View>
        <ScrollView ref={chipRow} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          <Chip label="All" toggle select on={!category} onPress={() => pickCategory(null)} style={s.chip} accessibilityLabel="All photo and video work" />
          {categories.map((x) => (
            <Chip key={x.slug} label={x.name} icon={iconByName(x.icon)} toggle select on={category === x.slug} onPress={() => pickCategory(category === x.slug ? null : x.slug)} style={s.chip} />
          ))}
        </ScrollView>
      </View>

      <View style={s.deck}>
        {!card && (feed.error ? (
          <ErrorState error={feed.error} onRetry={() => setFeed((f) => ({ ...f, error: null }))} />
        ) : !feed.done ? (
          <Loading label={words.finding} />
        ) : nobodyYet && !history.length ? (
          <EmptyState
            icon={Camera}
            title="No photographers here yet"
            text="Be the first photographer or videographer on photomatch, or invite one you love. You’ll be able to swipe through their work here."
            action={
              <View style={s.emptyActions}>
                <Button title="List your work" icon={Camera} size="sm" onPress={() => router.push('/new-listing')} />
                <Button title="Invite a photographer" icon={Send} variant="ghost" size="sm" onPress={invite} />
              </View>
            }
          />
        ) : (
          <EmptyState
            icon={Compass}
            title={`You’ve seen everything${scopeName ? ` in ${scopeName}` : ''}`}
            text={
              uid
                ? `${words.empty} Check your shortlist, or try something else.`
                : 'Try something else, or start over. Sign in to save what you like and get matched.'
            }
            action={
              <View style={s.emptyActions}>
                {shortlist.size > 0 && <Button title={`See shortlist (${shortlist.size})`} size="sm" onPress={() => setSheet('shortlist')} />}
                {!!category && <Button title="All photo & video" variant="ghost" size="sm" onPress={() => pickCategory(null)} />}
                <Button title={uid ? 'Check again' : 'Start over'} variant="ghost" size="sm" onPress={startOver} />
              </View>
            }
          />
        ))}
        {next && <BehindCard key={`b-${next.id}`} card={next} progress={dragProgress} />}
        {card && (
          <SwipeCard
            key={card.id}
            card={card}
            shot={Math.max(0, Math.min(shot, card.photos.length - 1))}
            showHint={!tappedSides}
            match={cardMatch}
            exit={exit}
            onTap={onTap}
            onSwipeStart={(a) => begin(a)}
            onSwiped={commit}
            progress={dragProgress}
            onAction={decide}
            focusOnMount={history.length > 0}
          />
        )}
      </View>

      <View style={s.actions}>
        <RoundButton icon={RotateCcw} label="Undo" size="small" onPress={undo} disabled={!history.length || !!exit} />
        <RoundButton icon={X} label="Pass" color="#ef4444" onPress={() => decide('pass')} disabled={!card} />
        <RoundButton icon={Bookmark} label="Shortlist" size="mid" color="#3b82f6" onPress={() => decide('save')} disabled={!card} />
        <RoundButton icon={Heart} label="Like" color="#16a34a" onPress={() => decide('like')} disabled={!card} />
        <RoundButton icon={Info} label="Details" size="small" onPress={() => setSheet('details')} disabled={!card} />
      </View>

      <DetailsSheet card={card ?? null} shot={shot} match={cardMatch} open={sheet === 'details'} onClose={() => setSheet(null)} onMessage={message} />

      <CorrectSheet
        open={sheet === 'correct'}
        onClose={() => setSheet(null)}
        signedIn={!!uid}
        tags={card?.tags || []}
        vendor={card?.kind === 'vendor' ? card.provider : null}
        onHideVendor={hideCardVendor}
        picked={picked}
        onToggle={(t) => {
          const n = new Set(picked)
          if (n.has(t)) n.delete(t)
          else n.add(t)
          setPicked(n)
        }}
        onSubmit={submitCorrection}
        onSignIn={() => { setSheet(null); signIn() }}
      />
      <TasteSheet open={sheet === 'taste'} onClose={() => setSheet(null)} uid={uid} corrections={corrections} removeCorrection={removeCorrection} unhideVendor={showVendorAgain} onSignIn={() => { setSheet(null); signIn() }} />
      <ShortlistSheet
        open={sheet === 'shortlist'}
        onClose={() => setSheet(null)}
        uid={uid}
        shortlist={shortlist}
        likedCardsFrom={likedCardsFrom}
        matchOf={matchOf}
        onMessage={message}
        onRemove={toggleShortlist}
        onSignIn={() => { setSheet(null); signIn() }}
      />
      {match && (
        <MatchOverlay
          provider={matchProvider}
          cards={likedCardsFrom(match)}
          tasteMatch={matchOf(match)}
          signedIn={!!uid}
          shortlisted={shortlist.has(match)}
          onShortlist={() => toggleShortlist(match)}
          onClose={() => setMatch(null)}
          onMessage={() => { setMatch(null); message(match) }}
          onSignIn={() => { setMatch(null); signIn() }}
        />
      )}
    </SafeAreaView>
  )
}

function RoundButton({ icon: Icon, label, onPress, disabled, color, size = 'big' }: {
  icon: LucideIcon; label: string; onPress: () => void; disabled?: boolean; color?: string; size?: 'big' | 'mid' | 'small'
}) {
  const s = useStyles()
  const { c } = useTheme()
  const px = size === 'big' ? 56 : size === 'mid' ? 46 : 40
  const icon = size === 'big' ? 28 : size === 'mid' ? 22 : 18
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={Math.max(0, (48 - px) / 2)}
      style={({ pressed }) => [s.round, { width: px, height: px, borderRadius: px / 2 }, disabled && s.disabled, pressed && s.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
    >
      <Icon size={icon} color={color ?? c.muted} strokeWidth={size === 'big' ? 2.4 : 2} />
    </Pressable>
  )
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.c.bg },
  chips: { flexDirection: 'row', gap: 6, paddingHorizontal: t.space.lg, paddingVertical: 4, alignItems: 'center' },
  chip: { minHeight: 34, justifyContent: 'center' },
  deck: { flex: 1, marginHorizontal: 16, marginTop: 12, justifyContent: 'center' },
  emptyActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, paddingTop: 14, paddingBottom: 12 },
  round: {
    alignItems: 'center', justifyContent: 'center', backgroundColor: t.scheme === 'dark' ? t.c.card : '#fff',
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4,
    borderWidth: t.scheme === 'dark' ? 1 : 0, borderColor: t.c.line,
  },
  disabled: { opacity: 0.4 },
  pressed: { transform: [{ scale: 0.92 }] },
}))
