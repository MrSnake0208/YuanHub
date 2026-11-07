import { onBeforeUnmount, onMounted, ref } from 'vue'

// 仅在容器确实需要横向滚动时返回 true，用于按需显示“左右滑动”类提示。
export function useHorizontalOverflow(target) {
  const overflowing = ref(false)
  let observer
  const measure = () => {
    const el = target.value
    overflowing.value = Boolean(el && el.scrollWidth > el.clientWidth + 1)
  }
  onMounted(() => {
    measure()
    if (typeof ResizeObserver !== 'function' || !target.value) return
    observer = new ResizeObserver(measure)
    observer.observe(target.value)
    if (target.value.firstElementChild) observer.observe(target.value.firstElementChild)
  })
  onBeforeUnmount(() => observer?.disconnect())
  return overflowing
}
