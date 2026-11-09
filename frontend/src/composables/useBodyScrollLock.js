import { toValue, watch } from 'vue'

let locks = 0
let restore = null

export function useBodyScrollLock(visible) {
  watch(() => Boolean(toValue(visible)), (open, _, onCleanup) => {
    if (!open || typeof document === 'undefined') return
    if (locks === 0) {
      const body = document.body, root = document.documentElement
      const left = window.scrollX, top = window.scrollY
      const previous = { position: body.style.position, top: body.style.top, left: body.style.left, width: body.style.width, overflow: body.style.overflow }
      const rootOverflow = root.style.overflow
      Object.assign(body.style, { position: 'fixed', top: -top + 'px', left: -left + 'px', width: body.getBoundingClientRect().width + 'px', overflow: 'hidden' })
      root.style.overflow = 'hidden'
      restore = () => {
        Object.assign(body.style, previous)
        root.style.overflow = rootOverflow
        window.scrollTo({ left, top, behavior: 'instant' })
      }
    }
    locks++
    onCleanup(() => {
      if (--locks === 0) { restore(); restore = null }
    })
  }, { immediate: true, flush: 'sync' })
}
