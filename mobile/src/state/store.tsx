// App-wide state for the signed-in user. Native port of frontend/src/store.jsx,
// same value shape (follows, shortlist, likes, saves, "Not into this" tags,
// the user's provider listings (one per vertical; one selected), toast), using the same shared api/* calls.
// Screen-specific data (bookings, messages, profiles) is loaded by each screen.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

import { invalidate } from '@shared/api/catalog.js'
import { addCorrections as saveCorrections, getTasteProfile, likePhoto, removeCorrection as deleteCorrection } from '@shared/api/discover.js'
import { getMyProviders } from '@shared/api/portfolio.js'
import * as social from '@shared/api/social.js'
import { useAuth } from './auth'

type Setter = React.Dispatch<React.SetStateAction<Set<string>>>
type PhotoRef = string | { id: string; albumId?: string; providerId?: string }

type StoreValue = {
  /** The selected listing (providers row + `vertical` slug), or null. */
  myProvider: any | null
  /** All of the user's listings (one per vertical), oldest first. */
  myProviders: any[]
  /** Reload my listings; pass a provider id to switch to it (e.g. one just created). */
  refreshProvider: (select?: string | null) => Promise<void>
  /** Switch the selected listing (remembered on this device). */
  selectProvider: (id: string) => void
  isProvider: boolean
  identityStatus: 'verified' | 'unverified'
  following: Set<string>
  toggleFollow: (providerId: string) => boolean
  shortlist: Set<string>
  toggleShortlist: (providerId: string) => boolean
  liked: Set<string>
  toggleLike: (photo: PhotoRef) => boolean
  saved: Set<string>
  toggleSave: (photoId: string) => boolean
  markSaved: (photoId: string) => void
  discoverHistory: any[]
  setDiscoverHistory: React.Dispatch<React.SetStateAction<any[]>>
  corrections: string[]
  addCorrections: (tags: string[]) => void
  removeCorrection: (tag: string) => void
  mode: 'client' | 'provider'
  setMode: (m: 'client' | 'provider') => void
  payoutsConnected: boolean
  setPayoutsConnected: (v: boolean) => void
  watermarkDefault: boolean
  setWatermarkDefault: (v: boolean) => void
  toast: (msg: string) => void
  toastMsg: string | null
}

const StoreContext = createContext<StoreValue | null>(null)

// Which listing is selected, remembered on this device (same key as the web).
const SELECTED_KEY = 'pm:selected-listing'

const toggled = (set: Set<string>, id: string, on: boolean) => {
  const next = new Set(set)
  if (on) next.add(id)
  else next.delete(id)
  return next
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const uid = user?.id ?? null

  const [myProviders, setMyProviders] = useState<any[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const myProvider = myProviders.find((p) => p.id === selectedId) || myProviders[0] || null
  const [following, setFollowing] = useState<Set<string>>(new Set())
  const [shortlist, setShortlist] = useState<Set<string>>(new Set())
  const [liked, setLiked] = useState<Set<string>>(new Set())
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [corrections, setCorrections] = useState<string[]>([])
  const [discoverHistory, setDiscoverHistory] = useState<any[]>([])
  const [mode, setMode] = useState<'client' | 'provider'>('client')
  const [payoutsConnected, setPayoutsConnected] = useState(false) // Stripe isn't connected yet
  const [watermarkDefault, setWatermarkDefault] = useState(true)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const toast = useCallback((msg: string) => {
    setToastMsg(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(null), 2600)
  }, [])

  useEffect(() => {
    AsyncStorage.getItem(SELECTED_KEY)
      .then((id) => id && setSelectedId((cur) => cur ?? id))
      .catch(() => {})
  }, [])

  const selectProvider = useCallback((id: string) => {
    setSelectedId(id)
    AsyncStorage.setItem(SELECTED_KEY, id).catch(() => {})
  }, [])

  const refreshProvider = useCallback(async (select: string | null = null) => {
    if (!uid) return setMyProviders([])
    try {
      setMyProviders(await getMyProviders(uid))
      if (typeof select === 'string') selectProvider(select)
    } catch (e) {
      console.warn(e)
    }
  }, [uid, selectProvider])

  // Load everything for the signed-in user; clear it on sign-out.
  useEffect(() => {
    setDiscoverHistory([])
    if (!uid) {
      setMyProviders([])
      setFollowing(new Set())
      setShortlist(new Set())
      setLiked(new Set())
      setSaved(new Set())
      setCorrections([])
      setMode('client')
      return
    }
    let live = true
    Promise.all([
      getMyProviders(uid),
      social.listFollowing(),
      social.listShortlist(),
      social.listLikedPhotoIds(),
      social.listSavedPhotoIds(),
      getTasteProfile(),
    ])
      .then(([providers, follows, short, likes, saves, taste]) => {
        if (!live) return
        setMyProviders(providers)
        setFollowing(new Set(follows))
        setShortlist(new Set(short))
        setLiked(new Set(likes))
        setSaved(new Set(saves))
        setCorrections(taste.corrections)
      })
      .catch((e) => console.warn('Could not load your data', e))
    return () => {
      live = false
    }
  }, [uid])

  // Optimistic toggle: update the UI now, write to the database, undo on failure.
  const optimistic = (setter: Setter, id: string, on: boolean, write: () => Promise<unknown>, verb: string) => {
    if (!uid) {
      toast(`Sign in to ${verb}`)
      return false
    }
    setter((s) => toggled(s, id, on))
    write().catch((e) => {
      console.warn(e)
      setter((s) => toggled(s, id, !on))
      toast('Couldn’t save that. Try again.')
    })
    return true
  }

  const toggleFollow = (providerId: string) => {
    const on = !following.has(providerId)
    return optimistic(setFollowing, providerId, on, () => {
      invalidate('providers') // follower counts
      return on ? social.follow(providerId) : social.unfollow(providerId)
    }, 'follow vendors')
  }

  const toggleShortlist = (providerId: string) => {
    const on = !shortlist.has(providerId)
    return optimistic(setShortlist, providerId, on, () => (on ? social.addToShortlist(providerId) : social.removeFromShortlist(providerId)), 'save vendors')
  }

  const toggleLike = (photo: PhotoRef) => {
    const id = typeof photo === 'object' ? photo.id : photo
    const on = !liked.has(id)
    return optimistic(setLiked, id, on, () => (on ? likePhoto(typeof photo === 'object' ? photo : { id }) : Promise.resolve()), 'like photos')
  }

  const toggleSave = (photoId: string) => {
    const on = !saved.has(photoId)
    return optimistic(setSaved, photoId, on, async () => {
      const col = await social.defaultCollection()
      return on ? social.addToCollection(col.id, photoId) : social.removeFromCollection(col.id, photoId)
    }, 'save photos')
  }
  const markSaved = (photoId: string) => setSaved((s) => toggled(s, photoId, true))

  const addCorrections = (tags: string[]) => {
    if (!uid) return toast('Sign in to tune your feed')
    setCorrections((prev) => [...new Set([...prev, ...tags])])
    saveCorrections(tags).catch((e: unknown) => console.warn(e))
  }
  const removeCorrection = (tag: string) => {
    setCorrections((prev) => prev.filter((t) => t !== tag))
    deleteCorrection(tag).catch((e: unknown) => console.warn(e))
  }

  const value: StoreValue = {
    myProvider, myProviders, refreshProvider, selectProvider,
    isProvider: !!myProvider,
    identityStatus: myProvider?.identity_verified ? 'verified' : 'unverified',
    following, toggleFollow,
    shortlist, toggleShortlist,
    liked, toggleLike,
    saved, toggleSave, markSaved,
    discoverHistory, setDiscoverHistory,
    corrections, addCorrections, removeCorrection,
    mode, setMode,
    payoutsConnected, setPayoutsConnected,
    watermarkDefault, setWatermarkDefault,
    toast, toastMsg,
  }
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>')
  return ctx
}
