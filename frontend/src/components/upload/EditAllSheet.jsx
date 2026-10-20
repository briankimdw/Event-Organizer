import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import Sheet from '../Sheet.jsx'
import { loadRecipes, loadRenderer } from './editorBridge.jsx'

// "Edit all": one look (preset) on every photo of the post, keeping each photo's own crop and
// adjustments. items: usePhotoItems() items to change; photos: usePhotoItems().
export default function EditAllSheet({ photos, items, onClose, announce }) {
  const [mods, setMods] = useState(null) // { recipes, renderer } | false (not available)
  const [pick, setPick] = useState(undefined) // preset id | null (no look) | undefined (nothing picked)
  const [strength, setStrength] = useState(80)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(null) // { done, total }
  const [error, setError] = useState('')
  const first = items[0]

  useEffect(() => {
    let live = true
    Promise.all([loadRecipes(), loadRenderer()])
      .then(([recipes, renderer]) => live && setMods(recipes?.PRESETS && renderer?.exportEdit ? { recipes, renderer } : false))
      .catch(() => live && setMods(false))
    return () => { live = false }
  }, [])

  const recipeFor = (item, id = pick) => {
    const { normalize, defaultRecipe, toStorable } = mods.recipes
    // A pixel edit (AI / Studio) keeps its pixels: the look goes on top of item.pixels.
    const own = item.pixels ? item.pixels.recipe : item.recipe
    const base = own ? normalize(own) : defaultRecipe()
    const full = { ...base, filter: id ? { id, strength } : null }
    return { full, storable: toStorable(full) }
  }

  // A small preview of the look on the first photo.
  useEffect(() => {
    if (!mods || pick === undefined || !first) return
    let live = true
    let url = null
    const t = setTimeout(async () => {
      try {
        const { full } = recipeFor(first)
        const out = await mods.renderer.exportEdit(first.pixels?.blob || first.source || first.file, full, { maxEdge: 480, quality: 0.8 })
        if (!live) return
        url = URL.createObjectURL(out.blob)
        setPreview(url)
      } catch { /* the preview is optional */ }
    }, 120)
    return () => {
      live = false
      clearTimeout(t)
      if (url) URL.revokeObjectURL(url)
    }
  }, [mods, pick, strength, first?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const apply = async () => {
    setError('')
    setBusy({ done: 0, total: items.length })
    let done = 0
    try {
      for (const item of items) {
        const { full, storable } = recipeFor(item)
        if (!storable && !item.pixels) photos.clearEdit(item.id)
        else {
          const out = await mods.renderer.exportEdit(item.pixels?.blob || item.source || item.file, full)
          const pixels = item.pixels ? { pixelEdited: true, pixelBase: { blob: item.pixels.blob, recipe: storable } } : null
          await photos.setEdit(item.id, { blob: out.blob, recipe: storable, width: out.width, height: out.height, ...pixels })
        }
        setBusy({ done: ++done, total: items.length })
      }
      const name = pick ? mods.recipes.getPreset(pick)?.name : null
      announce(name ? `${name} applied to ${items.length} photos.` : `Looks removed from ${items.length} photos.`)
      onClose()
    } catch (err) {
      setError(`Stopped after ${done} of ${items.length}: ${err.message || 'something went wrong'}.`)
      setBusy(null)
    }
  }

  return (
    <Sheet open onClose={busy ? () => {} : onClose} title="Edit all photos">
      {mods === null ? (
        <div className="muted small" role="status">Loading looks…</div>
      ) : mods === false ? (
        <div className="muted small">Looks aren’t available right now. You can still edit each photo on its own.</div>
      ) : (
        <div className="ea">
          <p className="muted small">Pick a look for all {items.length} photos. Each photo keeps its own crop and tweaks.</p>
          <div className="ea-preview">
            {preview || first?.thumbUrl ? <img src={preview || first.thumbUrl} alt="" /> : null}
          </div>
          <div className="chips ea-looks" role="radiogroup" aria-label="Look">
            <button type="button" role="radio" aria-checked={pick === null} className={`chip toggle ${pick === null ? 'on' : ''}`} onClick={() => setPick(null)}>
              {pick === null && <Check size={13} aria-hidden="true" />} No look
            </button>
            {mods.recipes.PRESETS.map((p) => (
              <button type="button" role="radio" key={p.id} aria-checked={pick === p.id} className={`chip toggle ${pick === p.id ? 'on' : ''}`} onClick={() => setPick(p.id)}>
                {pick === p.id && <Check size={13} aria-hidden="true" />} {p.name}
              </button>
            ))}
          </div>
          {pick && (
            <label className="field pf-field ea-strength">
              <span className="pf-label">Strength <span className="muted tiny">{strength}</span></span>
              <input type="range" min={0} max={100} step={5} value={strength} onChange={(e) => setStrength(Number(e.target.value))} />
            </label>
          )}
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="sheet-actions">
            <button type="button" className="btn accent block" onClick={apply} disabled={pick === undefined || !!busy}>
              {busy ? `Applying… ${busy.done} of ${busy.total}` : pick === undefined ? 'Pick a look' : `Apply to ${items.length} photos`}
            </button>
            <button type="button" className="btn ghost block" onClick={onClose} disabled={!!busy}>Cancel</button>
          </div>
        </div>
      )}
    </Sheet>
  )
}
