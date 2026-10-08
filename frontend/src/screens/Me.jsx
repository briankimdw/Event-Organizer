import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Briefcase, Camera, Check, ChevronRight, CreditCard, Images, Info, Layers, MapPin, Package, Pencil, Settings,
  ShieldCheck, Star,
} from 'lucide-react'
import Sheet from '../components/Sheet.jsx'
import ProfileLink from '../components/ProfileLink.jsx'
import { IdVerified } from '../components/Badges.jsx'
import { StatusPill } from '../components/Booking.jsx'
import Dashboard from './Dashboard.jsx'
import { useStore } from '../store.jsx'
import { useAuth } from '../auth.jsx'
import { supabase } from '../lib/supabase.js'
import { collections, discoverCards, findPackage, getProvider, img, me, myCalendar, myPackages, myPosts } from '../data/mock.js'

const ACTIVE = ['requested', 'countered', 'accepted', 'confirmed', 'in_progress', 'delivered', 'disputed']

export default function Me() {
  const { mode } = useStore()
  const { user, loading } = useAuth()
  return (
    <div className="me">
      <header className="home-header">
        <div className="title-lg">Profile</div>
        {user && (
          <Link to="/settings" className="icon-btn" aria-label="Settings">
            <Settings size={22} />
          </Link>
        )}
      </header>
      {loading ? (
        <div className="center-col pad"><div className="spinner" /></div>
      ) : !user ? (
        <SignedOut />
      ) : (
        <>
          <ProfileHero />
          <RoleSwitch />
          {mode === 'provider' ? <ProviderView /> : <ClientView />}
        </>
      )}
    </div>
  )
}

function SignedOut() {
  return (
    <div className="pad">
      <div className="signed-out">
        <div className="signed-out-art">
          {['maya-2', 'p3-album-1-0', 'sofia-1'].map((s) => <img key={s} src={img(s, 200, 240)} alt="" />)}
        </div>
        <h3>Your bookings, favorites and messages, in one place</h3>
        <p className="muted small">Sign in to request bookings, message photographers and keep your shortlist across devices.</p>
        <Link to="/sign-in?next=/me" className="btn accent block mt">Sign in or create an account</Link>
      </div>
    </div>
  )
}

// Initials avatar until profile photos are uploaded to the avatars bucket.
function Avatar({ profile, className }) {
  if (profile?.avatar_path) {
    const { data } = supabase.storage.from('avatars').getPublicUrl(profile.avatar_path)
    return <img className={className} src={data.publicUrl} alt="" />
  }
  const name = profile?.display_name || profile?.username || '?'
  const initials = name.split(/s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  return <div className={`${className} avatar-initials`}>{initials}</div>
}

function ProfileHero() {
  const { mode, identityStatus, toast } = useStore()
  const { user, profile, refreshProfile } = useAuth()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ display_name: '', city: '', bio: '' })
  const [saving, setSaving] = useState(false)
  const isProvider = mode === 'provider'

  const openEdit = () => {
    setDraft({ display_name: profile?.display_name || '', city: profile?.city || '', bio: profile?.bio || '' })
    setEditing(true)
  }

  const save = async () => {
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: draft.display_name.trim(), city: draft.city.trim() || null, bio: draft.bio.trim() || null })
      .eq('id', user.id)
    setSaving(false)
    if (error) {
      toast('Couldn’t save: ' + error.message)
      return
    }
    await refreshProfile()
    setEditing(false)
    toast('Profile updated')
  }

  if (!profile) return null
  const clientRating = profile.client_rating_avg

  return (
    <section className="me-hero">
      <div className="row gap-xs top">
        <Avatar profile={profile} className="avatar xl" />
        <div className="grow">
          <h2>{profile.display_name || profile.username}</h2>
          <div className="muted small inline-icon">
            @{profile.username}
            {profile.city && <> · <MapPin size={12} /> {profile.city}</>}
          </div>
          <div className="row gap-xs wrap mt-xs">
            {identityStatus === 'verified' && <IdVerified label />}
          </div>
        </div>
        <button className="pill-btn" onClick={openEdit}>
          <Pencil size={13} /> Edit
        </button>
      </div>

      {profile.bio && <p className="small mt-sm">{profile.bio}</p>}

      {/* Both ratings are always visible; the one for the current role is highlighted. */}
      <div className="rating-pair">
        <div className={`rating-cell ${!isProvider ? 'on' : ''}`}>
          <b><Star size={14} className="star-on" fill="currentColor" /> {clientRating ?? 'New'}</b>
          <span>as a client · {profile.client_rating_count} reviews</span>
        </div>
        <div className={`rating-cell ${isProvider ? 'on' : ''}`}>
          <b><Star size={14} className="star-on" fill="currentColor" /> {me.providerRating}</b>
          <span>as a photographer · {me.providerReviews} reviews</span>
        </div>
      </div>

      <Sheet open={editing} onClose={() => setEditing(false)} title="Edit profile">
        <label className="field"><span>Name</span><input className="input" maxLength={80} value={draft.display_name} onChange={(e) => setDraft({ ...draft, display_name: e.target.value })} /></label>
        <label className="field mt-sm"><span>City</span><input className="input" maxLength={80} value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} /></label>
        <label className="field mt-sm"><span>Bio</span><textarea className="input" rows={3} maxLength={500} value={draft.bio} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} /></label>
        <button className="btn block mt" disabled={saving || !draft.display_name.trim()} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
      </Sheet>
    </section>
  )
}

// One switch for both sides of the account. Each side shows what's waiting for you there.
function RoleSwitch() {
  const { mode, setMode, bookings, requests } = useStore()
  const activeBookings = bookings.filter((b) => ACTIVE.includes(b.status)).length
  const pending = requests.filter((r) => r.status === 'requested').length
  const isProvider = mode === 'provider'

  return (
    <div className="role-switch-wrap">
      <div className="role-switch" role="tablist">
        <span className="role-thumb" style={{ transform: isProvider ? 'translateX(100%)' : 'none' }} />
        <button role="tab" aria-selected={!isProvider} className={`role ${!isProvider ? 'on' : ''}`} onClick={() => setMode('client')}>
          <Briefcase size={18} />
          <div>
            <b>Hiring</b>
            <small>{activeBookings} active booking{activeBookings === 1 ? '' : 's'}</small>
          </div>
        </button>
        <button role="tab" aria-selected={isProvider} className={`role ${isProvider ? 'on' : ''}`} onClick={() => setMode('provider')}>
          <Camera size={18} />
          <div>
            <b>Photographer</b>
            <small>{pending ? `${pending} new request${pending === 1 ? '' : 's'}` : 'Your business'}</small>
          </div>
          {pending > 0 && !isProvider && <span className="role-dot">{pending}</span>}
        </button>
      </div>
    </div>
  )
}

function StatTile({ value, label, to, onClick, highlight }) {
  const content = (
    <>
      <b>{value}</b>
      <span>{label}</span>
    </>
  )
  const cls = `stat-tile ${highlight ? 'highlight' : ''}`
  return to ? <Link to={to} className={cls}>{content}</Link> : <button className={cls} onClick={onClick}>{content}</button>
}

function ClientView() {
  const { bookings, discoverHistory } = useStore()
  const active = bookings.filter((b) => ACTIVE.includes(b.status))
  const next = active.find((b) => b.status === 'confirmed') || active[0]
  const shortlistIds = [...new Set(
    discoverHistory
      .filter((h) => h.action === 'like' || h.action === 'save')
      .map((h) => discoverCards.find((c) => c.id === h.id).authorId),
  )]

  return (
    <div className="mode-body">
      <div className="stat-tiles">
        <StatTile value={active.length} label="Active bookings" to="/bookings" />
        <StatTile value={shortlistIds.length} label="Shortlisted" to="/discover" />
        <StatTile value={collections.length} label="Collections" />
      </div>

      {next && (
        <>
          <h4 className="section-title pad-x">Next up</h4>
          <div className="pad-x">
            <NextBooking b={next} />
          </div>
        </>
      )}

      <h4 className="section-title pad-x">Shortlisted photographers</h4>
      {shortlistIds.length ? (
        <div className="h-scroll">
          {shortlistIds.map((id) => {
            const p = getProvider(id)
            return (
              <Link key={id} to={`/u/${id}`} className="shortlist-chip">
                <img className="avatar" src={p.avatar} alt="" />
                <span className="tiny">{p.name.split(' ')[0]}</span>
                <span className="tiny muted">{p.tasteMatch}%</span>
              </Link>
            )
          })}
        </div>
      ) : (
        <div className="pad-x">
          <Link to="/discover" className="empty-card">
            <Layers size={20} />
            <div className="grow">
              <b className="small">No one shortlisted yet</b>
              <div className="muted tiny">Swipe right in Discover on work you love.</div>
            </div>
            <ChevronRight size={16} />
          </Link>
        </div>
      )}

      <h4 className="section-title pad-x">Saved collections</h4>
      <div className="grid2 pad-x-only">
        {collections.map((c) => (
          <div key={c.id} className="collection">
            <img src={img(c.cover, 300, 300)} alt="" />
            <b className="small">{c.name}</b>
            <div className="muted tiny">{c.count} saved</div>
          </div>
        ))}
      </div>

      <div className="pad-x mt muted tiny inline-icon">
        <Info size={12} /> Photographers see your client rating when you send a request.
      </div>
    </div>
  )
}

function NextBooking({ b }) {
  const { provider, pkg } = findPackage(b.packageId)
  return (
    <Link to={`/bookings/${b.id}`} className="booking-card">
      <ProfileLink id={provider.id}><img className="avatar" src={provider.avatar} alt="" /></ProfileLink>
      <div className="grow">
        <b className="small">{pkg.name}</b>
        <div className="muted tiny"><ProfileLink id={provider.id}>{provider.name}</ProfileLink> · {b.date}</div>
        <div className="mt-xs"><StatusPill status={b.status} /></div>
      </div>
      <ChevronRight size={16} className="muted" />
    </Link>
  )
}

function ProviderView() {
  const { requests, identityStatus, payoutsConnected, setPayoutsConnected, toast } = useStore()
  const [tab, setTab] = useState('requests')
  const tabsRef = useRef()
  const pending = requests.filter((r) => r.status === 'requested').length
  const bookedThisMonth = Object.values(myCalendar).filter((s) => s === 'booked').length

  const steps = [
    { done: identityStatus === 'verified', label: 'Verify your identity', sub: 'Required to accept paid bookings', Icon: ShieldCheck, to: '/verify' },
    {
      done: payoutsConnected, label: 'Set up payouts', sub: 'Connect a bank account with Stripe', Icon: CreditCard,
      onClick: () => { setPayoutsConnected(true); toast('Payout account connected') },
    },
    { done: myPackages.length > 0, label: 'Add a package', sub: `${myPackages.length} published`, Icon: Package, tab: 'packages' },
    { done: myPosts.length > 0, label: 'Add portfolio work', sub: `${myPosts.length} photos`, Icon: Images, tab: 'portfolio' },
  ]
  const doneCount = steps.filter((s) => s.done).length

  const openTab = (t) => {
    setTab(t)
    tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="mode-body">
      {doneCount < steps.length ? (
        <div className="pad-x">
          <div className="checklist">
            <div className="row between">
              <b>Get ready to take bookings</b>
              <span className="small muted">{doneCount} of {steps.length}</span>
            </div>
            <div className="progress mt-sm"><div style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
            {steps.map(({ done, label, sub, Icon, to, onClick, tab: t }) => {
              const inner = (
                <>
                  <span className={`check-circle ${done ? 'done' : ''}`}>{done ? <Check size={14} strokeWidth={3} /> : <Icon size={14} />}</span>
                  <div className="grow">
                    <div className="small">{label}</div>
                    {!done && <div className="muted tiny">{sub}</div>}
                  </div>
                  {!done && <ChevronRight size={16} className="muted" />}
                </>
              )
              const cls = `check-item ${done ? 'done' : ''}`
              if (done) return <div key={label} className={cls}>{inner}</div>
              if (to) return <Link key={label} to={to} className={cls}>{inner}</Link>
              return <button key={label} className={cls} onClick={onClick || (() => openTab(t))}>{inner}</button>
            })}
          </div>
        </div>
      ) : (
        <div className="pad-x">
          <div className="callout live">
            <div className="inline-icon"><ShieldCheck size={16} /> <b>You're live</b></div>
            <div className="muted small">Clients can find and book you.</div>
          </div>
        </div>
      )}

      <div className="stat-tiles">
        <StatTile value={pending} label="New requests" onClick={() => openTab('requests')} highlight={pending > 0} />
        <StatTile value={bookedThisMonth} label="Booked in Oct" onClick={() => openTab('calendar')} />
        <StatTile value={me.providerRating} label="Your rating" />
      </div>

      <div ref={tabsRef} className="tabs-anchor" />
      <Dashboard tab={tab} onTabChange={setTab} />
    </div>
  )
}
