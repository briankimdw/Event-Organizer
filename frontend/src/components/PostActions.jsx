import { useState } from 'react'
import { Heart, MessageCircle, Send, Bookmark } from 'lucide-react'
import { useStore } from '../store.jsx'
import { SaveSheet, ShareSheet } from './PostSheets.jsx'

export function PostActions({ post, onComment }) {
  const { liked, toggleLike, saved } = useStore()
  const [share, setShare] = useState(false)
  const [save, setSave] = useState(false)
  const isLiked = liked.has(post.id)
  return (
    <>
      <div className="post-actions">
        <button className={`icon-btn ${isLiked ? 'liked' : ''}`} onClick={() => toggleLike(post.id)} aria-label="Like">
          <Heart size={24} fill={isLiked ? 'currentColor' : 'none'} />
        </button>
        <button className="icon-btn" onClick={onComment} aria-label="Comment">
          <MessageCircle size={24} />
        </button>
        <button className="icon-btn" onClick={() => setShare(true)} aria-label="Share">
          <Send size={22} />
        </button>
        <div className="grow" />
        <button className="icon-btn" onClick={() => setSave(true)} aria-label="Save">
          <Bookmark size={24} fill={saved.has(post.id) ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div className="post-likes">{(post.likes + (isLiked ? 1 : 0)).toLocaleString()} likes</div>
      <ShareSheet open={share} onClose={() => setShare(false)} link={`/p/${post.id}`} payload={{ sharedPostId: post.id, text: '' }} />
      <SaveSheet open={save} onClose={() => setSave(false)} postId={post.id} />
    </>
  )
}
