<template>
  <header
    ref="header"
    class="mobile-shell"
    :class="{ 'mobile-shell--hidden': hidden }"
    @focusin="reset"
  >
    <slot />
  </header>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const header = ref(null)
const hidden = ref(false)
const directionThreshold = 8
let mobileQuery = null
let previousY = 0
let directionStartY = 0
let direction = 0

function scrollY() {
  const root = document.scrollingElement || document.documentElement
  const maxY = Math.max(0, root.scrollHeight - root.clientHeight)
  // iOS 边缘回弹不算作用户反向滚动。
  return Math.min(maxY, Math.max(0, window.scrollY))
}

function reset() {
  hidden.value = false
  previousY = scrollY()
  directionStartY = previousY
  direction = 0
}

function onScroll() {
  const currentY = scrollY()
  // 页顶和键盘操作导航时保持可见。
  if (currentY <= header.value.offsetHeight || header.value.querySelector(':focus-visible')) {
    reset()
    return
  }

  const delta = currentY - previousY
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
  reset()
  if (mobileQuery.matches) window.addEventListener('scroll', onScroll, { passive: true })
}

watch(() => route.fullPath, reset)

onMounted(() => {
  // 与 main.css 的移动导航断点保持一致。
  mobileQuery = window.matchMedia('(max-width: 1080px)')
  mobileQuery.addEventListener('change', syncViewport)
  syncViewport()
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  mobileQuery?.removeEventListener('change', syncViewport)
})
</script>
