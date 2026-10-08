import { ShieldCheck, BadgeCheck, Camera } from 'lucide-react'

export const IdVerified = ({ label = false }) => (
  <span className="badge badge-id" title="Identity verified">
    <ShieldCheck size={13} />
    {label && 'ID verified'}
  </span>
)

export const ProBadge = () => (
  <span className="badge badge-pro" title="Verified Pro">
    <BadgeCheck size={13} /> PRO
  </span>
)

export const VerifiedClient = () => (
  <span className="badge badge-id">
    <ShieldCheck size={13} /> Verified client
  </span>
)

export const RealPhoto = ({ overlay }) => (
  <span className={`badge badge-real ${overlay ? 'overlay' : ''}`} title="Verified with RAW file">
    <Camera size={12} /> Real Photo
  </span>
)
