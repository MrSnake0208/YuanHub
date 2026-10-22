import { nextTick, ref, toValue, watch } from 'vue'

export function useModalViewport(visible, scrollBody, panel) {
  const viewportStyle = ref({})
  const shortViewport = ref(false)

  function revealFocusedControl() {
    nextTick(() => {
      const body = shortViewport.value ? panel.value : scrollBody.value, target = document.activeElement
      if (!toValue(visible) || !body?.contains(target)) return
      // 点击面板空白会聚焦容器，不应把整个分区的顶部拉回视野。
      if (target === panel.value || target === scrollBody.value || target.matches('[role="tabpanel"]')) return
      const bounds = body.getBoundingClientRect(), rect = target.getBoundingClientRect()
      // 只滚动弹窗内部，避免浏览器把背景或整个弹窗推到键盘后面。
      if (rect.top < bounds.top + 12 || rect.height > bounds.height - 24) body.scrollTop += rect.top - bounds.top - 12
      else if (rect.bottom > bounds.bottom - 12) body.scrollTop += rect.bottom - bounds.bottom + 12
    })
  }

  watch(() => Boolean(toValue(visible)), (open, _, onCleanup) => {
    if (!open || typeof window === 'undefined') return
    const viewport = window.visualViewport
    const updateViewport = () => {
      const height = viewport?.height || window.innerHeight
      // 横屏键盘可能只留下约 200px，头尾也必须一起滚动才能留出输入空间。
      shortViewport.value = height < 360
      viewportStyle.value = { top: `${viewport?.offsetTop || 0}px`, height: `${height}px`, bottom: 'auto', '--modal-viewport-height': `${height}px` }
      revealFocusedControl()
    }
    updateViewport()
    window.addEventListener('resize', updateViewport)
    viewport?.addEventListener('resize', updateViewport)
    viewport?.addEventListener('scroll', updateViewport)
    onCleanup(() => {
      window.removeEventListener('resize', updateViewport)
      viewport?.removeEventListener('resize', updateViewport)
      viewport?.removeEventListener('scroll', updateViewport)
      viewportStyle.value = {}
      shortViewport.value = false
    })
  }, { immediate: true, flush: 'sync' })

  return { viewportStyle, shortViewport, revealFocusedControl }
}
