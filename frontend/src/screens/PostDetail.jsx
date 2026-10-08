import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { MapPin, MoreHorizontal, Sparkles } from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import PersonRow from '../components/PersonRow.jsx'
import { PostMedia } from '../components/Media.jsx'
import { PostActions } from '../components/PostActions.jsx'
import ExifPanel from '../components/Exif.jsx'
import { RealPhoto } from '../components/Badges.jsx'
import { ModerationSheet } from '../components/PostSheets.jsx'
import { getPerson, me, posts } from '../data/mock.js'

export default function PostDetail() {
  const { id } = useParams()
  const post = posts.find((p) => p.id === id)
  const author = getPerson(post.authorId)
  const [comments, setComments] = useState(post.comments)
  const [draft, setDraft] = useState('')
  const [menu, setMenu] = useState(null)
  const inputRef = useRef()

  const addComment = (e) => {
    e.preventDefault()
    if (!draft.trim()) return
    setComments([...comments, { userId: me.id, text: draft.trim() }])
    setDraft('')
  }

  return (
    <div>
      <TopBar
        title="Post"
        right={
          <button className="icon-btn" onClick={() => setMenu({ what: 'post', username: author.username })}>
            <MoreHorizontal size={20} />
          </button>
        }
      />
      <PersonRow
        person={author}
        sub={<span className="inline-icon"><MapPin size={12} /> {post.location}</span>}
        right={author.packages && <Link to={`/book/${author.id}`} className="btn sm">Book</Link>}
      />
      <PostMedia post={post} />
      <PostActions post={post} onComment={() => inputRef.current?.focus()} />

      <div className="pad">
        <p>
          <b>{author.username}</b> {post.caption}
        </p>
        {post.realPhoto && (
          <div className="note">
            <RealPhoto /> Verified against the original RAW file.
          </div>
        )}

        <h4 className="section-title">Gear & settings</h4>
        <ExifPanel exif={post.exif} />
        <div className="muted tiny mt-xs">Pulled from EXIF. Location data is removed from every upload.</div>

        <h4 className="section-title">Tags</h4>
        <div className="chips">
          <span className="chip solid">{post.genre}</span>
          {post.tags.map((t) => (
            <span key={t} className="chip">#{t}</span>
          ))}
          {post.autoTags.map((t) => (
            <span key={t} className="chip auto" title="Auto-tagged">
              <Sparkles size={11} /> {t}
            </span>
          ))}
        </div>

        <h4 className="section-title">Comments</h4>
        {comments.length === 0 && <div className="muted small">No comments yet.</div>}
        {comments.map((c, i) => {
          const u = getPerson(c.userId)
          return (
            <div key={i} className="comment">
              <img className="avatar sm" src={u.avatar} alt="" />
              <div className="grow">
                <b>{u.username}</b> {c.text}
              </div>
              <button className="icon-btn" onClick={() => setMenu({ what: 'comment', username: u.username })}>
                <MoreHorizontal size={16} />
              </button>
            </div>
          )
        })}
      </div>

      <form className="composer sticky-bottom" onSubmit={addComment}>
        <img className="avatar sm" src={me.avatar} alt="" />
        <input ref={inputRef} placeholder="Add a comment…" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button className="link-btn accent" disabled={!draft.trim()}>Post</button>
      </form>

      <ModerationSheet open={!!menu} onClose={() => setMenu(null)} what={menu?.what} username={menu?.username} />
    </div>
  )
}
