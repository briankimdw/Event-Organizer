import { useStore } from '../store.jsx'

export default function Toast() {
  const { toastMsg } = useStore()
  if (!toastMsg) return null
  return <div className="toast">{toastMsg}</div>
}
