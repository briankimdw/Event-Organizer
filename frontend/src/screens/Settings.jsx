import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, CreditCard, Download, LogOut, ShieldCheck, Stamp, Trash2 } from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import Sheet from '../components/Sheet.jsx'
import { useStore } from '../store.jsx'
import { useAuth } from '../auth.jsx'

export default function Settings() {
  const {
    identityStatus, payoutsConnected, setPayoutsConnected, watermarkDefault, setWatermarkDefault, toast,
  } = useStore()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const logOut = async () => {
    await signOut()
    toast('Signed out')
    navigate('/', { replace: true })
  }
  const verified = identityStatus === 'verified'

  return (
    <div>
      <TopBar title="Settings" />
      <div className="pad">
        <div className="section-label">Account</div>
        <div className="settings-group">
          <Link to={verified ? '#' : '/verify'} className="list-row" onClick={(e) => verified && e.preventDefault()}>
            <span className="round-icon"><ShieldCheck size={18} /></span>
            <div className="grow">
              <div>Identity verification</div>
              <div className={`tiny ${verified ? 'ok' : 'muted'}`}>{verified ? 'Verified' : 'Not verified'}</div>
            </div>
            {!verified && <ChevronRight size={16} className="muted" />}
          </Link>
          <div className="list-row">
            <span className="round-icon"><CreditCard size={18} /></span>
            <div className="grow">
              <div>Payouts</div>
              <div className="muted tiny">{payoutsConnected ? 'Bank account ••6789' : 'Not set up'}</div>
            </div>
            {!payoutsConnected && (
              <button className="btn sm" onClick={() => { setPayoutsConnected(true); toast('Payout account connected') }}>Set up</button>
            )}
          </div>
        </div>

        <div className="section-label">Photographer</div>
        <div className="settings-group">
          <div className="list-row">
            <span className="round-icon"><Stamp size={18} /></span>
            <div className="grow">
              <div>Watermark new uploads</div>
              <div className="muted tiny">Added to public versions. Originals stay private.</div>
            </div>
            <input type="checkbox" className="switch" checked={watermarkDefault} onChange={(e) => setWatermarkDefault(e.target.checked)} />
          </div>
        </div>

        <div className="section-label">Privacy & data</div>
        <div className="settings-group">
          <button className="list-row" onClick={() => toast('We’ll email you a download of your data')}>
            <span className="round-icon"><Download size={18} /></span>
            <div className="grow">Download my data</div>
          </button>
          <button className="list-row danger" onClick={() => setConfirmDelete(true)}>
            <span className="round-icon"><Trash2 size={18} /></span>
            <div className="grow">Delete account</div>
          </button>
        </div>

        <button className="btn ghost block mt-lg" onClick={logOut}>
          <LogOut size={16} /> Log out
        </button>
      </div>

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete your account?">
        <p className="small muted">
          Your profile, messages and saved items are removed, and all data is purged within 30 days. Active bookings must be finished or cancelled first.
        </p>
        <button
          className="btn danger-solid block mt"
          onClick={() => { setConfirmDelete(false); toast('Account scheduled for deletion') }}
        >
          Delete account
        </button>
        <button className="btn ghost block mt-sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
      </Sheet>
    </div>
  )
}
