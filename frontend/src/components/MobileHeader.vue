<template>
  <header
    ref="header"
    class="mobile-shell"
    :class="{ 'mobile-shell--hidden': hidden && !pinned }"
    @focusin="reset"
  >
    <slot />
  </header>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

const { pinned = false } = defineProps({ pinned: Boolean })
const route = useRoute()
const header = ref(null)
const hidden = ref(false)
const directionThreshold = 24
const followTopProperty = '--mobile-shell-follow-top'
let mobileQuery = null
let previousY = 0
let directionStartY = 0
let direction = 0
let intentDirection = 0
let intentUntil = 0
let touchY = null
let previousHeight = 0

function clearIntent() {
  intentDirection = 0
  intentUntil = 0
  direction = 0
  previousY = scrollY()
  directionStartY = previousY
  previousHeight = document.documentElement.scrollHeight
}

function recordIntent(delta) {
  if (!delta) return
  const now = performance.now()
  if (now > intentUntil || intentDirection !== Math.sign(delta)) clearIntent()
  intentDirection = Math.sign(delta)
  // 只接受紧随输入的滚动；不靠 scroll 事件续期，以免布局变化延续旧意图。
  intentUntil = now + 250
}

function onWheel(event) {
  if (!event.ctrlKey && Math.abs(event.deltaY) > Math.abs(event.deltaX)) recordIntent(event.deltaY)
}

function onTouchStart(event) {
  clearIntent()
  touchY = event.touches.length === 1 ? event.touches[0].clientY : null
}

function onTouchMove(event) {
  const nextY = event.touches.length === 1 ? event.touches[0].clientY : null
  if (touchY !== null && nextY !== null) recordIntent(touchY - nextY)
  touchY = nextY
}

function onKeydown(event) {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey ||
      event.target.closest?.('input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="listbox"]')) return
  const delta = { ArrowDown: 1, PageDown: 1, End: 1, ArrowUp: -1, PageUp: -1, Home: -1, ' ': event.shiftKey ? -1 : 1 }[event.key]
  if (delta) recordIntent(delta)
}

const inputListeners = [
  ['pointerdown', clearIntent], ['click', clearIntent], ['wheel', onWheel],
  ['touchstart', onTouchStart], ['touchmove', onTouchMove],
  ['touchcancel', clearIntent], ['keydown', onKeydown],
]

function syncFollowTop() {
  if (typeof document === 'undefined') return
  const value = hidden.value
    ? 'calc(8px + env(safe-area-inset-top))'
    : 'calc(72px + env(safe-area-inset-top))'
  document.documentElement.style.setProperty(followTopProperty, value)
}

function scrollY() {
  const root = document.scrollingElement || document.documentElement
  const maxY = Math.max(0, root.scrollHeight - root.clientHeight)
  // iOS 边缘回弹不算作用户反向滚动。
  return Math.min(maxY, Math.max(0, window.scrollY))
}

function reset() {
  hidden.value = false
  clearIntent()
}

function onScroll() {
  const currentY = scrollY()
  // 页顶和键盘操作导航时保持可见。
  if (currentY <= header.value.offsetHeight || header.value.querySelector(':focus-visible')) {
    reset()
    return
  }

  const delta = currentY - previousY
  const height = document.documentElement.scrollHeight
  if (pinned || performance.now() > intentUntil || !intentDirection ||
      Math.sign(delta) !== intentDirection || height !== previousHeight) {
    clearIntent()
    return
  }
  if (!delta) return
  const nextDirection = Math.sign(delta)
  if (nextDirection !== direction) {
    directionStartY = previousY
    direction = nextDirection
  }
  previousY = currentY

  // 累积同方向的细小滚动，同时忽略方向切换时的轻微抖动。
  if (Math.abs(currentY - directionStartY) >= directionThreshold) {
    hidden.value = direction > 0
  }
}

function syncViewport() {
  window.removeEventListener('scroll', onScroll)
  for (const [name, listener] of inputListeners) window.removeEventListener(name, listener)
  reset()
  if (mobileQuery.matches && !pinned) {
    window.addEventListener('scroll', onScroll, { passive: true })
    for (const [name, listener] of inputListeners) window.addEventListener(name, listener, { passive: true })
  }
}

watch(() => route.fullPath, reset)
watch(() => pinned, () => { if (mobileQuery) syncViewport() })
watch(hidden, syncFollowTop, { flush: 'sync' })

onMounted(() => {
  // 与 main.css 的移动导航断点保持一致。
  mobileQuery = window.matchMedia('(max-width: 1080px)')
  mobileQuery.addEventListener('change', syncViewport)
  syncViewport()
  syncFollowTop()
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  for (const [name, listener] of inputListeners) window.removeEventListener(name, listener)
  mobileQuery?.removeEventListener('change', syncViewport)
  if (typeof document !== 'undefined')
    document.documentElement.style.removeProperty(followTopProperty)
})
</script>
