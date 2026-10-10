import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowUpDown, ChevronLeft, ChevronRight, Copy, ImagePlus, Plus } from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import { EmptyState, ErrorState, Loading, SignInPrompt } from '../components/States.jsx'
import { useAuth } from '../auth.jsx'
import { useStore } from '../store.jsx'
import { AlbumViewer } from './Gallery.jsx'
import { invalidate } from '../api/catalog.js'
import { getMyProvider, listMyAlbums, publicUrl, reorderAlbums, toViewerAlbum } from '../api/portfolio.js'

const STATUS_LABEL = { processing: 'Processing', under_review: 'In review', hidden: 'Hidden' }

// Your own posts. /my-work: a grid to open, reorder and manage them.
// /my-work?post=<album id>: that post in the full-screen viewer, with edit and delete.
export default function MyWork() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { user, profile, loading } = useAuth()
  const { myProvider } = useStore()
  const selectedId = myProvider?.id ?? null // the listing picked in Me (users can have one per vertical)
  const [data, setData] = useState(null) // { provider, albums }
  const [error, setError] = useState(null)
  const [tick, setTick] = useState(0)
  const postId = params.get('post')

  useEffect(() => {
    if (!user) return
    let live = true
    setError(null)
    ;(async () => {
      try {
        const provider = await getMyProvider(user.id, selectedId)
        const rows = provider ? await listMyAlbums(provider.id) : []
        if (live) setData({ provider, albums: rows.filter((a) => a.photos?.length).map(toViewerAlbum) })
      } catch (e) {
        if (live) setError(e)
      }
    })()
    return () => { live = false }
  }, [user, tick, selectedId])

  if (!loading && !user) {
    return (
      <div>
        <TopBar title="My work" />
        <SignInPrompt title="Sign in to see your work" />
      </div>
    )
  }
  if (error) {
    return (
      <div>
        <TopBar title="My work" />
        <ErrorState error={error} onRetry={() => setTick((t) => t + 1)} />
      </div>
    )
  }

  const viewing = postId && data?.albums.some((a) => a.id === postId)
  if (postId && !data) return <div className="reel reel-state"><Loading /></div>
  if (viewing) {
    return (
      <AlbumViewer
        albums={data.albums}
        owner={{
          name: data.provider.display_name,
          avatar: profile?.avatar_path ? publicUrl('avatars', profile.avatar_path) : null,
          username: profile?.username,
          profileTo: '/me',
          providerId: data.provider.id,
        }}
        book={null}
        startPost={postId}
        closeFallback="/my-work"
        manage={{
          onUpdated: (a) => setData((d) => ({ ...d, albums: d.albums.map((x) => (x.id === a.id ? a : x)) })),
          onDeleted: (id) => {
            const albums = data.albums.filter((x) => x.id !== id)
            setData((d) => ({ ...d, albums }))
            // Nothing left to show (or the post you opened is gone): back to the grid.
            if (!albums.length || id === postId) navigate('/my-work', { replace: true })
          },
        }}
      />
    )
  }

  return <WorkGrid data={data} setData={setData} />
}

function WorkGrid({ data, setData }) {
  const { toast } = useStore()
  const [order, setOrder] = useState(null) // album ids while reordering
  const [saving, setSaving] = useState(false)
  const dragFrom = useRef(null)

  if (!data) {
    return (
      <div>
        <TopBar title="My work" />
        <Loading />
      </div>
    )
  }
  if (!data.provider) {
    return (
      <div>
        <TopBar title="My work" />
        <EmptyState icon={ImagePlus} title="Show clients your work"
          text="Set up your profile and post your first work."
          action={<Link to="/upload" className="btn accent">Get started</Link>} />
      </div>
    )
  }

  const { albums } = data
  const byId = new Map(albums.map((a) => [a.id, a]))
  const shown = order ? order.map((id) => byId.get(id)).filter(Boolean) : albums
  const reordering = !!order

  const move = (from, to) => {
    if (to < 0 || to >= order.length || from === to) return
    const next = [...order]
    const [id] = next.splice(from, 1)
    next.splice(to, 0, id)
    setOrder(next)
  }

  const saveOrder = async () => {
    const changed = order.some((id, i) => id !== albums[i]?.id)
    if (!changed) return setOrder(null)
    setSaving(true)
    try {
      await reorderAlbums(order)
      invalidate('providers')
      setData((d) => ({ ...d, albums: order.map((id) => byId.get(id)) }))
      setOrder(null)
      toast('New order saved')
    } catch (err) {
      toast(err.message || 'Couldn’t save the order. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const right = reordering ? (
    <button className="link-btn accent" onClick={saveOrder} disabled={saving}>{saving ? 'Saving…' : 'Done'}</button>
  ) : (
    <Link to="/upload" className="icon-btn" aria-label="New post"><Plus size={22} /></Link>
  )

  return (
    <div className="mw">
      <TopBar title="My work" subtitle={albums.length ? `${albums.length} post${albums.length === 1 ? '' : 's'}` : null} right={right} />
      {albums.length === 0 ? (
        <EmptyState icon={ImagePlus} title="Nothing posted yet"
          text="Post your first shoot. Albums, single photos and before / afters all show up here."
          action={<Link to="/upload" className="btn accent">Post photos</Link>} />
      ) : (
        <>
          <div className="mw-bar pad-x">
            <span className="muted tiny grow">
              {reordering ? 'Use the arrows (or drag) to set the order clients see.' : 'Tap a post to view, edit or delete it.'}
            </span>
            {reordering ? (
              <button className="link-btn small" onClick={() => setOrder(null)} disabled={saving}>Cancel</button>
            ) : albums.length > 1 && (
              <button className="link-btn small" onClick={() => setOrder(albums.map((a) => a.id))}><ArrowUpDown size={14} /> Reorder</button>
            )}
          </div>
          <div className={`mw-grid ${reordering ? 'reordering' : ''}`}>
            {shown.map((a, i) => {
              const inner = (
                <>
                  <img src={a.cover} alt="" loading="lazy" draggable={false} />
                  {a.type === 'beforeafter' ? <span className="album-count">B/A</span>
                    : a.photos.length > 1 && <span className="album-count"><Copy size={12} /> {a.photos.length}</span>}
                  {STATUS_LABEL[a.status] && <span className="mw-status">{STATUS_LABEL[a.status]}</span>}
                  {!reordering && <span className="mw-title">{a.title}</span>}
                </>
              )
              if (!reordering) {
                return (
                  <Link key={a.id} to={`/my-work?post=${a.id}`} className="mw-tile" aria-label={a.title}>
                    {inner}
                  </Link>
                )
              }
              return (
                <div key={a.id} className="mw-tile"
                  draggable
                  onDragStart={(e) => { dragFrom.current = i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/x-pm-album', a.id) }}
                  onDragEnter={() => { if (dragFrom.current != null && dragFrom.current !== i) { move(dragFrom.current, i); dragFrom.current = i } }}
                  onDragOver={(e) => e.preventDefault()}
                  onDragEnd={() => { dragFrom.current = null }}
                  onDrop={(e) => e.preventDefault()}>
                  {inner}
                  <span className="mw-pos">{i + 1}</span>
                  <span className="mw-arrows">
                    <button onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Move “${a.title}” earlier`}><ChevronLeft size={16} /></button>
                    <button onClick={() => move(i, i + 1)} disabled={i === shown.length - 1} aria-label={`Move “${a.title}” later`}><ChevronRight size={16} /></button>
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
