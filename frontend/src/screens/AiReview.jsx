import { Link, useParams } from 'react-router-dom'
import { CheckCircle2, Clock, EyeOff, ImageOff, Loader, ShieldAlert } from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import { EmptyState, ErrorState, Loading, SignInPrompt } from '../components/States.jsx'
import { useAuth } from '../auth.jsx'
import useQuery from '../lib/useQuery.js'
import { getAlbum, getMyProvider, toViewerAlbum } from '../api/portfolio.js'

// What each album status means for the photographer. There's no automated
// AI check yet: an album is only "in review" if the team has put it there.
const STATUS = {
  under_review: {
    title: 'Post in review',
    Icon: ShieldAlert,
    tone: 'danger',
    head: 'Held for review',
    text: 'This album isn’t public while our team reviews it. You don’t need to do anything for now. The original files you uploaded are stored privately with the post.',
  },
  processing: {
    title: 'Post processing',
    Icon: Loader,
    tone: '',
    head: 'Still processing',
    text: 'This album is still being processed and isn’t public yet.',
  },
  hidden: {
    title: 'Hidden post',
    Icon: EyeOff,
    tone: '',
    head: 'Hidden',
    text: 'This album is hidden. Only you can see it.',
  },
  published: {
    title: 'Post',
    Icon: CheckCircle2,
    tone: 'live',
    head: 'Live',
    text: 'This album is public on your profile.',
  },
}

// One of my albums, or null if it doesn't exist or belongs to someone else.
async function loadMyAlbum(albumId, userId) {
  const [row, mine] = await Promise.all([
    getAlbum(albumId).catch((e) => (e?.code === '22P02' ? null : Promise.reject(e))), // 22P02: not a uuid
    getMyProvider(userId),
  ])
  return row && mine && row.provider_id === mine.id ? toViewerAlbum(row) : null
}

// /ai-review/:id — the review status of one of my albums (id = album id).
export default function AiReview() {
  const { id } = useParams()
  const { user, loading: authLoading } = useAuth()
  const { data: album, loading, error, reload } = useQuery(user ? () => loadMyAlbum(id, user.id) : null, [id, user?.id])

  if (!authLoading && !user) return (<div><TopBar title="Post in review" /><SignInPrompt title="Sign in to see your post" /></div>)
  if (authLoading || loading) return (<div><TopBar title="Post in review" /><Loading /></div>)

  if (error) return (<div><TopBar title="Post in review" /><ErrorState error={error} onRetry={reload} /></div>)
  if (!album) {
    return (
      <div>
        <TopBar title="Post in review" />
        <EmptyState icon={ImageOff} title="Post not found" text="It may have been deleted, or it isn’t yours."
          action={<Link to="/me" className="btn sm">Back to profile</Link>} />
      </div>
    )
  }

  const s = STATUS[album.status] || { title: 'Post', Icon: Clock, tone: '', head: album.status, text: '' }
  return (
    <div>
      <TopBar title={s.title} subtitle={album.title} />
      <div className="pad">
        {album.cover && <img className="review-img" src={album.cover} alt="" />}
        <div className={`callout ${s.tone} mt`}>
          <div className="inline-icon"><s.Icon size={16} /> <b>{s.head}</b></div>
          {s.text && <div className="small muted">{s.text}</div>}
        </div>
        <div className="small muted mt-sm">
          {album.title}
          {album.photos.length > 0 && ` · ${album.photos.length} photo${album.photos.length === 1 ? '' : 's'}`}
          {album.date && ` · ${album.date}`}
        </div>
        {album.status === 'published' && (
          <Link to={`/gallery/${album.providerId}?post=${album.id}`} className="btn block mt">View post</Link>
        )}
      </div>
    </div>
  )
}
