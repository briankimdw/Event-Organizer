import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users } from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import PeoplePicker from '../components/PeoplePicker.jsx'
import { Loading, SignInPrompt } from '../components/States.jsx'
import { useAuth } from '../auth.jsx'
import { useStore } from '../store.jsx'
import { createGroup, messageError, startDirectMessage } from '../api/messages.js'

// /inbox/new: pick one person for a direct message, or several for a group.
export default function NewMessage() {
  const navigate = useNavigate()
  const { user, loading } = useAuth()
  const { toast } = useStore()
  const [selected, setSelected] = useState([])
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const isGroup = selected.length > 1

  const start = async () => {
    if (!selected.length || busy) return
    setBusy(true)
    try {
      const id = isGroup ? await createGroup(title.trim(), selected.map((p) => p.profileId)) : await startDirectMessage(selected[0].profileId)
      navigate(`/inbox/${id}`, { replace: true })
    } catch (e) {
      console.warn(e)
      toast(messageError(e))
      setBusy(false)
    }
  }

  if (loading) return <Loading />
  if (!user) {
    return (
      <div>
        <TopBar title="New message" />
        <SignInPrompt title="Sign in to send messages" />
      </div>
    )
  }

  return (
    <div className="new-message">
      <TopBar
        title="New message"
        right={
          <button className="btn sm" disabled={!selected.length || busy} onClick={start}>
            {busy ? 'Opening…' : isGroup ? 'Create' : 'Chat'}
          </button>
        }
      />
      {isGroup && (
        <div className="nm-group pad-x">
          <span className="round-icon"><Users size={18} /></span>
          <input className="nm-title" placeholder="Group name (optional)" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
      )}
      <PeoplePicker selected={selected} onChange={setSelected} />
    </div>
  )
}
