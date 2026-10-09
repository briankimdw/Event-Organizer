import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, CreditCard, Download, KeyRound, LogOut, ShieldCheck, Stamp, Trash2 } from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import Sheet from '../components/Sheet.jsx'
import { Loading, SignInPrompt } from '../components/States.jsx'
import { useStore } from '../store.jsx'
import { useAuth } from '../auth.jsx'

// Rows for features that aren't built yet say so instead of pretending to work.
export default function Settings() {
  const { identityStatus, myProvider, toast } = useStore()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const navigate = useNavigate()
  const { signOut, user, loading } = useAuth()
  const logOut = async () => {
    await signOut()
    toast('Signed out')
    navigate('/', { replace: true })
  }
  const verified = identityStatus === 'verified'

  if (loading || !user) {
    return (
      <div>
        <TopBar title="Settings" />
        {loading ? <Loading /> : <SignInPrompt title="Sign in to manage your account" />}
      </div>
    )
  }

  return (
    <div>
      <TopBar title="Settings" />
      <div className="pad">
        <div className="section-label">Account</div>
        <div className="settings-group">
          <Link to="/reset-password" className="list-row">
            <span className="round-icon"><KeyRound size={18} /></span>
            <div className="grow">
              <div>Set or change password</div>
              <div className="muted tiny">Signed in as {user.email}</div>
            </div>
            <ChevronRight size={16} className="muted" />
          </Link>
          <Link to="/verify" className="list-row">
            <span className="round-icon"><ShieldCheck size={18} /></span>
            <div className="grow">
              <div>Identity verification</div>
              <div className={`tiny ${verified ? 'ok' : 'muted'}`}>
                {verified ? 'Verified' : myProvider ? 'Not verified' : 'Only needed to take bookings as a photographer'}
              </div>
            </div>
            <ChevronRight size={16} className="muted" />
          </Link>
          <div className="list-row">
            <span className="round-icon"><CreditCard size={18} /></span>
            <div className="grow">
              <div>Payouts</div>
              <div className="muted tiny">Not connected · bank payouts are coming soon</div>
            </div>
            <span className="soon-tag">Soon</span>
          </div>
        </div>

        {myProvider && (
          <>
            <div className="section-label">Photographer</div>
            <div className="settings-group">
              <div className="list-row">
                <span className="round-icon"><Stamp size={18} /></span>
                <div className="grow">
                  <div>Watermark new uploads</div>
                  <div className="muted tiny">Coming soon. Public copies are resized and stripped of location data; originals stay private.</div>
                </div>
                <span className="soon-tag">Soon</span>
              </div>
            </div>
          </>
        )}

        <div className="section-label">Privacy & data</div>
        <div className="settings-group">
          <div className="list-row">
            <span className="round-icon"><Download size={18} /></span>
            <div className="grow">
              <div>Download my data</div>
              <div className="muted tiny">Coming soon</div>
            </div>
            <span className="soon-tag">Soon</span>
          </div>
          <button className="list-row danger" onClick={() => setConfirmDelete(true)}>
            <span className="round-icon"><Trash2 size={18} /></span>
            <div className="grow">Delete account</div>
          </button>
        </div>

        <button className="btn ghost block mt-lg" onClick={logOut}>
          <LogOut size={16} /> Log out
        </button>
      </div>

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete your account">
        <p className="small muted">
          Deleting your account from the app isn’t available yet. When it is, your profile, messages and saved items will be removed,
          and active bookings will need to be finished or cancelled first.
        </p>
        <button className="btn ghost block mt" onClick={() => setConfirmDelete(false)}>OK</button>
      </Sheet>
    </div>
  )
}
