// Bounds share one coordinate system; visible tabs never move on selection.
export function plannerDateRevealOffset(viewport, target, scrollLeft, maxScroll) {
  const inset = 4
  const delta = target.left < viewport.left + inset ? target.left - viewport.left - inset
    : target.right > viewport.right - inset ? target.right - viewport.right + inset : 0
  return Math.max(0, Math.min(maxScroll, scrollLeft + delta))
}

// Touch scrolling keeps the browser's inertia and vertical-page gesture handling.
// Mouse dragging supplements the same scroll container without changing selection.
export function createPlannerDateDrag(onDragging = () => {}) {
  let pointer = null
  let suppressClick = false
  function finish(event) {
    if (!pointer || (event && event.pointerId !== pointer.id)) return
    const previous = pointer
    pointer = null
    if (previous.element.hasPointerCapture?.(previous.id)) previous.element.releasePointerCapture(previous.id)
    onDragging(false)
  }
  return {
    down(event) {
      if (pointer || event.isPrimary === false || event.button !== 0 || event.pointerType === 'touch') return
      suppressClick = false
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft,
        element: event.currentTarget, dragging: false }
    },
    move(event) {
      if (!pointer || event.pointerId !== pointer.id) return
      const dx = event.clientX - pointer.x
      const dy = event.clientY - pointer.y
      if (!pointer.dragging) {
        if (Math.abs(dx) < 6 || Math.abs(dx) <= Math.abs(dy)) return
        pointer.dragging = true
        suppressClick = true
        pointer.element.setPointerCapture?.(pointer.id)
        onDragging(true)
      }
      event.preventDefault()
      pointer.element.scrollLeft = pointer.left - dx
    },
    finish,
    leave(event) { if (!pointer?.dragging) finish(event) },
    click(event) {
      if (!suppressClick || event.detail === 0) return
      suppressClick = false
      event.preventDefault()
      event.stopPropagation()
    },
    dispose() { finish() }
  }
}
