<template>
  <button v-if="visible" type="button" class="back-to-top" aria-label="返回顶部" title="返回顶部" @click="backToTop">
    <ArrowUp :size="20" aria-hidden="true" />
  </button>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ArrowUp } from '@lucide/vue'

const visible = ref(false)

function updateVisibility() {
  visible.value = window.scrollY > window.innerHeight
}

function backToTop() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: 0, behavior: reduceMotion ? 'instant' : 'smooth' })
}

onMounted(() => {
  updateVisibility()
  window.addEventListener('scroll', updateVisibility, { passive: true })
  window.addEventListener('resize', updateVisibility)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', updateVisibility)
  window.removeEventListener('resize', updateVisibility)
})
</script>

<style scoped>
.back-to-top {
  position: fixed;
  right: calc(16px + env(safe-area-inset-right, 0px));
  bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  z-index: var(--z-sticky-controls);
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: var(--surface);
  color: var(--ink);
  box-shadow: 0 3px 12px rgba(var(--theme-shadow-rgb, 73, 59, 44), .15);
  cursor: pointer;
}
.back-to-top:hover,
.back-to-top:active { background: var(--yellow); }
.back-to-top:focus-visible { outline: 2px solid var(--theme-focus, var(--tea)); outline-offset: 3px; }
@media (min-width: 1081px) {
  .back-to-top { right: calc(28px + env(safe-area-inset-right, 0px)); }
}
</style>
