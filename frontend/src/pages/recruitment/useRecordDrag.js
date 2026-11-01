import { onBeforeUnmount, ref, watch } from 'vue'
import Sortable from 'sortablejs'

export function useRecordDrag(list, blocked, context, reorder, announce) {
  const dragging = ref(false)
  let sortable, snapshot, cancelled = false, clickBlockedUntil = 0
  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  const updateMotion = () => sortable?.option('animation', motion?.matches ? 0 : 160)

  function finish(event) {
    if (!snapshot) return
    const before = snapshot
    const ids = sortable.toArray()
    // 只还原拖动项，避免整表重插把记录移到 Vue 的列表结束锚点之外。
    if (before.item.parentNode === sortable.el) sortable.el.insertBefore(before.item, before.next?.parentNode === sortable.el ? before.next : null)
    snapshot = null
    dragging.value = false
    clickBlockedUntil = Date.now() + 400
    if (cancelled || /cancel$/.test(event.originalEvent?.type || '') || blocked.value || before.context !== context()) {
      announce('已取消移动，顺序未改变')
    } else {
      reorder(ids)
    }
    cancelled = false
    queueMicrotask(() => {
      const row = Array.from(list.value?.children || []).find(row => row.dataset.eventId === before.id)
      row?.querySelector('.record-handle')?.focus({ preventScroll: true })
    })
  }

  function cancel() {
    if (!snapshot) return false
    cancelled = true
    // 使用标准结束事件，让库清理浮层、滚动计时器和触控监听。
    sortable.el.ownerDocument.dispatchEvent(new Event('mouseup', { bubbles: true }))
    return true
  }

  watch(list, element => {
    cancel()
    sortable?.destroy()
    sortable = element ? new Sortable(element, {
      draggable: '[data-event-id]', dataIdAttr: 'data-event-id', handle: '.gacha-record, .record-handle',
      filter: '.guide-hint', preventOnFilter: false,
      disabled: !!blocked.value, forceFallback: true, supportPointer: false, fallbackOnBody: true,
      delay: 300, delayOnTouchOnly: true, touchStartThreshold: 5, fallbackTolerance: 4,
      animation: motion?.matches ? 0 : 160, ghostClass: 'record-drag-gap',
      chosenClass: 'record-drag-chosen', fallbackClass: 'record-drag-floating',
      scroll: true, forceAutoScrollFallback: true, scrollSensitivity: 60, scrollSpeed: 12,
      onStart(event) {
        snapshot = { item: event.item, next: event.item.nextSibling, id: event.item.dataset.eventId, context: context() }
        dragging.value = true
        announce('正在移动整条记录，松手放置，Escape 取消')
      },
      onMove: () => !blocked.value,
      onEnd: finish,
    }) : null
  }, { flush: 'post' })
  watch(blocked, value => {
    if (value) cancel()
    sortable?.option('disabled', !!value)
  }, { flush: 'sync' })
  motion?.addEventListener?.('change', updateMotion)
  onBeforeUnmount(() => {
    cancel()
    sortable?.destroy()
    motion?.removeEventListener?.('change', updateMotion)
  })
  return { dragging, cancelDrag: cancel, isDragClick: () => dragging.value || Date.now() < clickBlockedUntil }
}
