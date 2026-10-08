import { useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth.jsx'
import { AlbumViewer } from './Gallery.jsx'
import { getMyProvider, listMyAlbums, publicUrl, toViewerAlbum } from '../api/portfolio.js'

// Your own portfolio (real albums from Supabase) in the full-screen viewer: /my-work?post=<album id>
export default function MyWork() {
  const [params] = useSearchParams()
  const { user, profile, loading } = useAuth()
  const [data, setData] = useState(null) // { provider, albums }
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    ;(async () => {
      try {
        const provider = await getMyProvider(user.id)
        const rows = provider ? await listMyAlbums(provider.id) : []
        setData({ provider, albums: rows.filter((a) => a.photos?.length).map(toViewerAlbum) })
      } catch (e) {
        setError(e.message)
      }
    })()
  }, [user])

  if (!loading && !user) return <Navigate to="/sign-in?next=/my-work" replace />

  if (error || (data && data.albums.length === 0)) {
    return (
      <div className="pad center-col auth-status">
        <h3>{error ? 'Couldn’t load your work' : 'Nothing posted yet'}</h3>
        <p className="muted small">{error || 'Post your first album and it will show up here.'}</p>
        <Link to={error ? '/me' : '/upload'} className="btn mt">{error ? 'Back' : 'Post photos'}</Link>
      </div>
    )
  }

  if (!data) return <div className="reel" style={{ background: '#080808' }} />

  return (
    <AlbumViewer
      albums={data.albums}
      owner={{
        name: data.provider.display_name,
        avatar: profile?.avatar_path ? publicUrl('avatars', profile.avatar_path) : null,
        username: profile?.username,
        profileTo: '/me',
      }}
      book={null}
      startPost={params.get('post')}
      closeFallback="/me"
    />
  )
}
