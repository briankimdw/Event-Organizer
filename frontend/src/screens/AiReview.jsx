import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { FileUp, ShieldAlert, Clock, Trash2 } from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import { img, myPosts } from '../data/mock.js'

export default function AiReview() {
  const { id } = useParams()
  const post = myPosts.find((p) => p.id === id)
  const [file, setFile] = useState(null)
  const [submitted, setSubmitted] = useState(false)

  return (
    <div>
      <TopBar title="Post in review" />
      <div className="pad">
        <img className="review-img" src={img(post.seed, 600, 600)} alt="" />
        <div className="callout danger mt">
          <div className="inline-icon"><ShieldAlert size={16} /> <b>Held for review</b></div>
          <div className="small muted">
            Our checks think this photo might be AI-generated (score {Math.round(post.aiScore * 100)}%). It isn't public while we review it.
          </div>
        </div>

        {submitted ? (
          <div className="callout mt">
            <div className="inline-icon"><Clock size={16} /> <b>RAW file received</b></div>
            <div className="small muted">
              A reviewer will compare it with your post. If it checks out, your post goes live with a "Real Photo" label.
            </div>
          </div>
        ) : (
          <>
            <h4 className="section-title">Prove it's real</h4>
            <p className="small muted">Upload the original RAW file straight from your camera. We check its metadata and contents against your post.</p>
            <label className="dropzone mt-sm">
              <FileUp size={28} />
              <span>{file ? file : 'Choose a RAW file'}</span>
              <span className="muted tiny">CR3 · NEF · ARW · DNG</span>
              <input
                type="file"
                accept=".cr3,.nef,.arw,.dng"
                onChange={(e) => setFile(e.target.files[0]?.name)}
                hidden
              />
            </label>
            <button className="link-btn small mt-xs" onClick={() => setFile('DSCF4821.RAF.dng')}>Use a sample file</button>
            <div className="note mt">
              <Trash2 size={16} /> RAW files are stored privately and deleted as soon as the review is done.
            </div>
            <button className="btn accent block mt" disabled={!file} onClick={() => setSubmitted(true)}>Submit for review</button>
          </>
        )}
      </div>
    </div>
  )
}
