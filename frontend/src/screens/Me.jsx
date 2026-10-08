import { useState } from 'react'
import { ChevronRight, Settings, Trash2, Download } from 'lucide-react'
import Segmented from '../components/Segmented.jsx'
import Stars from '../components/Stars.jsx'
import { VerifiedClient } from '../components/Badges.jsx'
import Dashboard from './Dashboard.jsx'
import { useStore } from '../store.jsx'
import { collections, img, me } from '../data/mock.js'

export default function Me() {
  const { mode, setMode } = useStore()
  return (
    <div>
      <header className="home-header">
        <div className="title-lg">@{me.username}</div>
        <Segmented
          className="compact"
          options={[
            { value: 'client', label: 'Client' },
            { value: 'provider', label: 'Provider' },
          ]}
          value={mode}
          onChange={setMode}
        />
      </header>
      {mode === 'client' ? <ClientProfile /> : <Dashboard />}
    </div>
  )
}

function ClientProfile() {
  const { toast } = useStore()
  const [settings, setSettings] = useState(false)

  return (
    <>
      <div className="me-head">
        <img className="avatar xl" src={me.avatar} alt="" />
        <div className="grow">
          <h2>{me.name}</h2>
          <div className="row gap-xs small">
            <Stars value={me.clientRating} size={12} /> {me.clientRating}
            <span className="muted">as a client ({me.clientReviews})</span>
          </div>
          {me.verifiedClient && <div className="mt-xs"><VerifiedClient /></div>}
        </div>
      </div>
      <div className="pad-x muted small">
        Photographers see your client rating when you send a request.
      </div>

      <h4 className="section-title pad-x">Saved</h4>
      <div className="grid2 pad-x-only">
        {collections.map((c) => (
          <div key={c.id} className="collection">
            <img src={img(c.cover, 300, 300)} alt="" />
            <b className="small">{c.name}</b>
            <div className="muted tiny">{c.count} saved</div>
          </div>
        ))}
      </div>

      <div className="pad">
        <button className="list-row" onClick={() => setSettings(!settings)}>
          <span className="round-icon"><Settings size={18} /></span>
          <div className="grow">Settings & privacy</div>
          <ChevronRight size={16} />
        </button>
        {settings && (
          <>
            <button className="list-row" onClick={() => toast('We’ll email you a download of your data')}>
              <span className="round-icon"><Download size={18} /></span>
              <div className="grow">Download my data</div>
            </button>
            <button className="list-row danger" onClick={() => toast('Account scheduled for deletion. Data is purged within 30 days.')}>
              <span className="round-icon"><Trash2 size={18} /></span>
              <div className="grow">Delete account</div>
            </button>
          </>
        )}
      </div>
    </>
  )
}
