import { useEffect } from 'react'

const SCROLLERS = '.scroll-x, .h-scroll, .filters, .avail-strip'

// Makes every horizontal row scrollable with a mouse: drag it sideways, or use the
// vertical wheel. Touch screens already swipe these natively.
export default function useHorizontalScroll(rootId) {
  useEffect(() => {
    const root = document.getElementById(rootId)
    if (!root) return
    let drag = null

    const onWheel = (e) => {
      const el = e.target.closest(SCROLLERS)
      if (!el || el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      const atStart = el.scrollLeft <= 0 && e.deltaY < 0
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 && e.deltaY > 0
      if (atStart || atEnd) return // let the page scroll once the row is at its end
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }

    const onDown = (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      const el = e.target.closest(SCROLLERS)
      if (!el || el.scrollWidth <= el.clientWidth) return
      drag = { el, x: e.clientX, left: el.scrollLeft, moved: false }
    }
    const onMove = (e) => {
      if (!drag) return
      const dx = e.clientX - drag.x
      if (Math.abs(dx) > 4) {
        drag.moved = true
        drag.el.classList.add('dragging-scroll')
      }
      drag.el.scrollLeft = drag.left - dx
    }
    const onUp = () => {
      if (!drag) return
      const { el, moved } = drag
      el.classList.remove('dragging-scroll')
      drag = null
      // Swallow the click that follows a drag so chips/links don't fire.
      if (moved) {
        const swallow = (ev) => { ev.preventDefault(); ev.stopPropagation() }
        root.addEventListener('click', swallow, { capture: true, once: true })
        setTimeout(() => root.removeEventListener('click', swallow, { capture: true }), 0)
      }
    }

    root.addEventListener('wheel', onWheel, { passive: false })
    root.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      root.removeEventListener('wheel', onWheel)
      root.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [rootId])
}
