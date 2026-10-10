import { Link } from 'react-router-dom'
import { ChevronRight, Users } from 'lucide-react'
import Sheet from './Sheet.jsx'
import { PersonAvatar } from './ProfileLink.jsx'
import { EmptyState, ErrorState, Loading } from './States.jsx'
import useQuery from '../lib/useQuery.js'
import { listFollowers } from '../api/social.js'

// Who follows a photographer. Each row opens that person's profile.
export default function FollowersSheet({ open, onClose, providerId, count }) {
  const { data, loading, error, reload } = useQuery(open ? () => listFollowers(providerId) : null, [open, providerId])
  return (
    <Sheet open={open} onClose={onClose} title={`Followers${count ? ` · ${count}` : ''}`}>
      {loading && !data && <Loading inline />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data?.length === 0 && <EmptyState compact icon={Users} title="No followers yet" />}
      {data?.map((p) => (
        <div key={p.id} className="follower-row">
          <PersonAvatar id={p.id} src={p.avatar} name={p.name} username={p.username} className="avatar" />
          <Link to={`/u/${p.id}`} className="grow follower-text">
            <div className="small"><b>{p.name}</b></div>
            {p.username && <div className="muted tiny">@{p.username}</div>}
          </Link>
          <Link to={`/u/${p.id}`} className="icon-btn muted" aria-label={`Open ${p.name}’s profile`} tabIndex={-1}>
            <ChevronRight size={16} />
          </Link>
        </div>
      ))}
    </Sheet>
  )
}
