// Dragging with a finger or a mouse (tasks in a list, cards between kanban columns).
// A mouse drags once it moves; a finger after a short press, so the page still scrolls.

export interface DragHandlers {
  /** Where the pointer is now (to show where it would land). */
  move(x: number, y: number): void
  drop(x: number, y: number): void
  cancel(): void
}

const PRESS_MS = 260
const SLOP = 8

export function startDrag(e: PointerEvent, source: HTMLElement, handlers: DragHandlers, scrollers: () => HTMLElement[] = () => []): void {
  if (e.button !== 0) return
  const touch = e.pointerType !== 'mouse'
  const startX = e.clientX
  const startY = e.clientY
  let x = startX
  let y = startY
  let ghost: HTMLElement | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let frame = 0
  const rect = source.getBoundingClientRect()
  const offsetX = startX - rect.left
  const offsetY = startY - rect.top

  const begin = () => {
    ghost = source.cloneNode(true) as HTMLElement
    Object.assign(ghost.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: `${rect.width}px`,
      zIndex: '100',
      pointerEvents: 'none',
      transform: `translate(${x - offsetX}px, ${y - offsetY}px) rotate(1.5deg)`,
      boxShadow: 'var(--shadow-lg)',
      opacity: '0.96',
    })
    ghost.classList.add('drag-ghost')
    document.body.append(ghost)
    source.classList.add('dragging')
    document.body.classList.add('is-dragging')
    navigator.vibrate?.(12)
    handlers.move(x, y)
    frame = requestAnimationFrame(scroll)
  }

  // near an edge of a scrolling area, it scrolls
  const scroll = () => {
    if (!ghost) return
    for (const el of [...scrollers(), document.scrollingElement as HTMLElement]) {
      if (!el) continue
      const r = el === document.scrollingElement ? { left: 0, top: 0, right: innerWidth, bottom: innerHeight } : el.getBoundingClientRect()
      const edge = 48
      if (x > r.right - edge && x < r.right + 4) el.scrollLeft += 12
      else if (x < r.left + edge && x > r.left - 4) el.scrollLeft -= 12
      if (y > r.bottom - edge && y < r.bottom + 4) el.scrollTop += 12
      else if (y < r.top + edge && y > r.top - 4) el.scrollTop -= 12
    }
    handlers.move(x, y)
    frame = requestAnimationFrame(scroll)
  }

  const moved = (ev: PointerEvent) => {
    x = ev.clientX
    y = ev.clientY
    if (!ghost) {
      const far = Math.hypot(x - startX, y - startY) > SLOP
      if (touch && far) return stop() // it's a scroll
      if (!touch && far) begin()
      return
    }
    ghost.style.transform = `translate(${x - offsetX}px, ${y - offsetY}px) rotate(1.5deg)`
    handlers.move(x, y)
  }

  const blockScroll = (ev: TouchEvent) => {
    if (ghost) ev.preventDefault()
  }

  const up = () => {
    const dragged = !!ghost
    stop()
    if (dragged) handlers.drop(x, y)
  }

  const cancelled = () => {
    const dragged = !!ghost
    stop()
    if (dragged) handlers.cancel()
  }

  const noClick = (ev: MouseEvent) => {
    ev.stopPropagation()
    ev.preventDefault()
  }

  function stop() {
    if (timer) clearTimeout(timer)
    cancelAnimationFrame(frame)
    window.removeEventListener('pointermove', moved)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', cancelled)
    window.removeEventListener('touchmove', blockScroll)
    if (ghost) {
      ghost.remove()
      source.classList.remove('dragging')
      document.body.classList.remove('is-dragging')
      // the click that ends a drag doesn't open the task
      window.addEventListener('click', noClick, { capture: true, once: true })
      setTimeout(() => window.removeEventListener('click', noClick, { capture: true }), 50)
    }
    ghost = null
  }

  window.addEventListener('pointermove', moved)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancelled)
  window.addEventListener('touchmove', blockScroll, { passive: false })
  if (touch) timer = setTimeout(begin, PRESS_MS)
}
