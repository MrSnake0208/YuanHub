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
}, { immediate: true, flush: 'sync' })
onBeforeUnmount(cleanup)
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.calendar-filter-mask { background: color-mix(in srgb, var(--ink) 45%, transparent); }
.calendar-filter-sheet { background: var(--surface); border: 1px solid var(--line); border-bottom: 0; border-radius: 22px 22px 0 0; color: var(--ink); }
.calendar-filter-sheet-footer { border-top: 1px solid var(--line); }
.calendar-filter-sheet-footer button { background: var(--cream); }
@media (min-width: 1024px) {
  .calendar-filter-mask { background: color-mix(in srgb, var(--ink) 18%, transparent); }
  .calendar-filter-sheet { border: 1px solid var(--line); border-radius: 18px; box-shadow: 0 16px 48px color-mix(in srgb, var(--tea) 18%, transparent); }
}
</style>
<style scoped src="./calendarFilterSheetDesktop.css"></style>
<style scoped src="./calendarFilterSheetMobile.css"></style>
