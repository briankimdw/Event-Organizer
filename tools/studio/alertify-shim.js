/*
 * photomatch Studio: a tiny MIT stand-in for AlertifyJS.
 *
 * miniPaint imports AlertifyJS (GPL-3.0) only to show short notices (alertify.error / success /
 * warning). The build (tools/studio/build.mjs) swaps every import of
 * alertifyjs/build/alertify.min.js for this file and alertify.min.css for alertify-shim.css, so no
 * GPL code ends up in the bundle. Notices go to a live region, so screen readers hear them too.
 *
 * Copyright (c) 2026 photomatch contributors. MIT License.
 */

let region = null
let lastText = ''

function ensureRegion() {
  if (region && document.body.contains(region)) return region
  region = document.createElement('div')
  region.className = 'pm-notices'
  region.setAttribute('aria-live', 'polite')
  region.setAttribute('role', 'status')
  document.body.appendChild(region)
  return region
}

function notify(message, kind = 'message', wait = 5) {
  const text = String(message ?? '').replace(/<[^>]*>/g, '').trim()
  if (!text) return null
  const host = ensureRegion()
  // Same text twice in a row: keep one toast.
  if (text === lastText && host.lastElementChild) return host.lastElementChild
  lastText = text
  const el = document.createElement('div')
  el.className = `pm-notice pm-notice-${kind}`
  el.textContent = text
  if (kind === 'error') el.setAttribute('role', 'alert')
  el.addEventListener('click', () => dismiss())
  host.appendChild(el)
  while (host.children.length > 3) host.firstElementChild.remove()
  const ms = Math.max(2, Number(wait) || 5) * 1000
  const timer = setTimeout(() => dismiss(), ms)
  function dismiss() {
    clearTimeout(timer)
    el.remove()
    if (lastText === text) lastText = ''
  }
  return { dismiss, element: el }
}

const alertify = {
  notify: (m, type, wait) => notify(m, type || 'message', wait),
  message: (m, wait) => notify(m, 'message', wait),
  success: (m, wait) => notify(m, 'success', wait),
  warning: (m, wait) => notify(m, 'warning', wait),
  error: (m, wait) => notify(m, 'error', wait),
  dismissAll: () => { if (region) region.textContent = ''; lastText = '' },
  set: () => alertify,
  defaults: {},
}

export default alertify
