import { createContext, useCallback, useContext, useRef, useState } from 'react'
import * as mock from './data/mock.js'

const StoreContext = createContext(null)

export function StoreProvider({ children }) {
  const [bookings, setBookings] = useState(mock.bookings)
  const [conversations, setConversations] = useState(mock.conversations)
  const [requests, setRequests] = useState(mock.incomingRequests)
  const [liked, setLiked] = useState(new Set(['post4']))
  const [saved, setSaved] = useState(new Set())
  const [following, setFollowing] = useState(new Set(['p1', 'p2', 'p5', 'u5']))
  const [mode, setMode] = useState('client') // client | provider
  const [identityStatus, setIdentityStatus] = useState('unverified') // unverified | verified
  const [discoverHistory, setDiscoverHistory] = useState([]) // [{ id, action: like | pass | save }]
  const [corrections, setCorrections] = useState(mock.tasteProfile.corrections)
  const [toastMsg, setToastMsg] = useState(null)
  const toastTimer = useRef()

  const toast = useCallback((msg) => {
    setToastMsg(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(null), 2600)
  }, [])

  const toggleIn = (setter) => (id) =>
    setter((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const updateBooking = (id, patch) =>
    setBookings((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b
        const history = patch.status ? [...b.history, { status: patch.status, at: 'Just now' }] : b.history
        return { ...b, ...patch, history }
      }),
    )

  const addBooking = (booking) => setBookings((prev) => [booking, ...prev])

  const sendMessage = (conversationId, message) =>
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId ? { ...c, messages: [...c.messages, { from: 'u0', time: 'Now', ...message }] } : c,
      ),
    )

  const startConversation = (providerId) => {
    const existing = conversations.find((c) => c.kind !== 'group' && c.memberIds.includes(providerId))
    if (existing) return existing.id
    const id = `c${Date.now()}`
    setConversations((prev) => [{ id, kind: 'inquiry', memberIds: [providerId], messages: [] }, ...prev])
    return id
  }

  const updateRequest = (id, patch) => setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const value = {
    bookings, updateBooking, addBooking,
    conversations, sendMessage, startConversation,
    requests, updateRequest,
    liked, toggleLike: toggleIn(setLiked),
    saved, toggleSave: toggleIn(setSaved),
    following, toggleFollow: toggleIn(setFollowing),
    discoverHistory, setDiscoverHistory,
    corrections,
    addCorrections: (tags) => setCorrections((prev) => [...new Set([...prev, ...tags])]),
    removeCorrection: (tag) => setCorrections((prev) => prev.filter((t) => t !== tag)),
    mode, setMode,
    identityStatus, setIdentityStatus,
    toast, toastMsg,
  }
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export const useStore = () => useContext(StoreContext)
