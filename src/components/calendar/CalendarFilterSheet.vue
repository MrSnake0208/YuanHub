<template>
  <Teleport to="body">
    <div v-if="open" class="calendar-page calendar-public calendar-filter-mask" @click.self="emit('close')">
      <section id="calendar-filter-sheet" ref="panel" class="calendar-filter-sheet" :style="position" role="dialog" aria-modal="true" aria-labelledby="calendar-filter-sheet-title" tabindex="-1">
        <header class="calendar-filter-sheet-header">
          <h2 id="calendar-filter-sheet-title" ref="heading" tabindex="-1">筛选</h2>
          <button type="button" @click="emit('reset')">重置筛选</button>
        </header>
        <div class="calendar-filter-sheet-body">
          <CalendarFilterControls :filters="filters" :lock-game="lockGame" :games="games" :categories="categories" @change="emit('change', $event)" />
        </div>
        <footer class="calendar-filter-sheet-footer">
          <button class="calendar-primary" type="button" @click="emit('close')">完成</button>
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
  anchor: { type: Object, default: null },
  filters: { type: Object, required: true },
  lockGame: Boolean,
  games: { type: Array, required: true },
  categories: { type: Object, required: true },
})
const emit = defineEmits(['close', 'change', 'reset'])
const panel = ref(null), heading = ref(null)
const position = ref({})
useModalFocus(toRef(props, 'open'), panel, {
  initialFocus: () => heading.value,
  onEscape: () => emit('close'),
})

let restoreScroll = null
let desktopMedia = null
function place() {
  position.value = {}
  if (!props.open || !desktopMedia?.matches) return
  const rect = props.anchor?.getBoundingClientRect()
  if (!rect) return
  const width = Math.min(440, window.innerWidth - 32)
  const below = window.innerHeight - rect.bottom - 24, above = rect.top - 24
  const useBelow = below >= Math.min(320, window.innerHeight - 32) || below >= above
  position.value = {
    '--filter-left': `${Math.max(16, Math.min(rect.left, window.innerWidth - width - 16))}px`,
    '--filter-top': useBelow ? `${rect.bottom + 8}px` : 'auto',
    '--filter-bottom': useBelow ? 'auto' : `${window.innerHeight - rect.top + 8}px`,
    '--filter-max-height': `${Math.min(640, Math.max(0, useBelow ? below : above))}px`,
  }
}
function onDesktopChange(event) { if (event.matches) emit('close') }
function cleanup() {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', place)
    window.removeEventListener('scroll', place, true)
  }
  desktopMedia?.removeEventListener('change', onDesktopChange)
  desktopMedia = null
  restoreScroll?.()
  restoreScroll = null
}
watch(() => props.open, open => {
  cleanup()
  if (!open || typeof document === 'undefined') return
  desktopMedia = window.matchMedia('(min-width: 1024px)')
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
  place()
  window.addEventListener('resize', place)
  window.addEventListener('scroll', place, true)
}, { immediate: true, flush: 'sync' })
onBeforeUnmount(cleanup)
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.calendar-filter-mask { background: color-mix(in srgb, var(--ink) 45%, transparent); }
.calendar-filter-sheet { background: var(--surface); border: 1px solid var(--line); border-bottom: 0; border-radius: 22px 22px 0 0; color: var(--ink); }
.calendar-filter-sheet-header button { background: transparent; border-color: transparent; font-weight: 600; }
.calendar-filter-sheet-header button:active { background: var(--cream); }
.calendar-filter-sheet-footer { border-top: 1px solid var(--line); }
.calendar-filter-sheet-footer button:active { background: var(--tea-deep); }
@media (hover: hover) {
  .calendar-filter-sheet-header button:hover { background: var(--cream); }
  .calendar-filter-sheet-footer button:hover { background: var(--tea-deep); }
}
@media (min-width: 1024px) {
  .calendar-filter-mask { background: color-mix(in srgb, var(--ink) 18%, transparent); }
  .calendar-filter-sheet { border: 1px solid var(--line); border-radius: 18px; box-shadow: 0 16px 48px color-mix(in srgb, var(--tea) 18%, transparent); }
}
</style>
<style scoped src="./calendarFilterSheetDesktop.css"></style>
<style scoped src="./calendarFilterSheetMobile.css"></style>
