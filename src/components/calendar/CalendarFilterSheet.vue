<template>
  <Teleport to="body">
    <div v-if="open" class="calendar-page calendar-public calendar-filter-mask" @click.self="emit('close')">
      <section id="calendar-filter-sheet" ref="panel" class="calendar-filter-sheet" role="dialog" aria-modal="true" aria-labelledby="calendar-filter-sheet-title" tabindex="-1">
        <header class="calendar-filter-sheet-header">
          <h2 id="calendar-filter-sheet-title" ref="heading" tabindex="-1">筛选</h2>
          <button type="button" @click="emit('close')">完成</button>
        </header>
        <div class="calendar-filter-sheet-body">
          <CalendarFilterControls :filters="filters" :lock-game="lockGame" :games="games" :categories="categories" @change="emit('change', $event)" />
        </div>
        <footer class="calendar-filter-sheet-footer">
          <button type="button" @click="emit('reset')">重置筛选</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { onBeforeUnmount, ref, toRef, watch } from 'vue'
import CalendarFilterControls from './CalendarFilterControls.vue'
import { useModalFocus } from '@/composables/useModalFocus.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  filters: { type: Object, required: true },
  lockGame: Boolean,
  games: { type: Array, required: true },
  categories: { type: Object, required: true },
})
const emit = defineEmits(['close', 'change', 'reset'])
const panel = ref(null), heading = ref(null)
useModalFocus(toRef(props, 'open'), panel, {
  initialFocus: () => heading.value,
  onEscape: () => emit('close'),
})

let restoreScroll = null
let desktopMedia = null
function onDesktopChange(event) { if (event.matches) emit('close') }
function cleanup() {
  desktopMedia?.removeEventListener('change', onDesktopChange)
  desktopMedia = null
  restoreScroll?.()
  restoreScroll = null
}
watch(() => props.open, open => {
  cleanup()
  if (!open || typeof document === 'undefined') return
  desktopMedia = window.matchMedia('(min-width: 768px)')
  if (desktopMedia.matches) { emit('close'); return }
  desktopMedia.addEventListener('change', onDesktopChange)
  const body = document.body, root = document.documentElement
  const bodyOverflow = body.style.overflow, rootOverflow = root.style.overflow, paddingRight = body.style.paddingRight
  const scrollbarGap = Math.max(0, window.innerWidth - root.clientWidth)
  if (scrollbarGap > 0) body.style.paddingRight = `${(Number.parseFloat(getComputedStyle(body).paddingRight) || 0) + scrollbarGap}px`
  body.style.overflow = root.style.overflow = 'hidden'
  restoreScroll = () => {
    body.style.overflow = bodyOverflow
    root.style.overflow = rootOverflow
    body.style.paddingRight = paddingRight
  }
}, { immediate: true, flush: 'sync' })
onBeforeUnmount(cleanup)
</script>

<style scoped>
.calendar-filter-mask { position: fixed; inset: 0; z-index: var(--z-overlay); display: flex; align-items: flex-end; background: color-mix(in srgb, var(--ink) 45%, transparent); }
.calendar-filter-sheet { width: 100%; min-width: 0; max-height: min(76dvh, 640px); display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--line); border-bottom: 0; border-radius: 22px 22px 0 0; color: var(--ink); }
.calendar-filter-sheet-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px max(18px, env(safe-area-inset-right)) 12px max(18px, env(safe-area-inset-left)); flex: none; }
.calendar-filter-sheet-header h2 { font-size: 22px; }
.calendar-filter-sheet-body { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 4px max(18px, env(safe-area-inset-right)) 16px max(18px, env(safe-area-inset-left)); }
.calendar-filter-sheet-footer { padding: 12px max(18px, env(safe-area-inset-right)) calc(16px + env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left)); border-top: 1px solid var(--line); flex: none; }
.calendar-filter-sheet-footer button { width: 100%; background: var(--cream); }
</style>
