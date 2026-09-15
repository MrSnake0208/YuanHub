<template>
  <nav class="planner-dates" :aria-label="label">
    <div class="date-navigation">
      <span class="date-context"><CalendarDays :size="15" aria-hidden="true" />{{ monthLabel }}<small>{{ activeIndex + 1 }} / {{ dates.length }} 天</small></span>
      <div class="date-actions">
        <button v-if="dates.includes(today) && selected !== today" type="button" class="date-today" @click="emit('select', today)">返回今日</button>
        <button type="button" class="date-step" aria-label="前一天" title="前一天" :disabled="activeIndex <= 0" @click="step(-1)"><ChevronLeft :size="18" aria-hidden="true" /></button>
        <button type="button" class="date-step" aria-label="后一天" title="后一天" :disabled="activeIndex >= dates.length - 1" @click="step(1)"><ChevronRight :size="18" aria-hidden="true" /></button>
      </div>
    </div>
    <div ref="scroller" class="date-tabs" :class="{ dragging }" @pointerdown="onPointerDown" @pointermove="drag.move"
      @pointerup="drag.finish" @pointercancel="drag.finish" @lostpointercapture="drag.finish" @pointerleave="drag.leave"
      @click.capture="drag.click" @dragstart.prevent @keydown="onKeydown">
      <button v-for="(date, index) in dates" :key="date" type="button" class="date-tab"
        :class="{ selected: date === selected, past: isPast(date), today: date === today }"
        :data-date="date" :aria-pressed="date === selected" :tabindex="date === selected ? 0 : -1"
        :aria-label="date + '，第' + (index + 1) + '天，' + dateStatus(date)" :title="date + ' · ' + dateStatus(date)"
        @click="emit('select', date)">
        <span class="day-number">{{ date === today ? '今天' : '第 ' + (index + 1) + ' 天' }}</span>
        <time :datetime="date">{{ shortDate(date) }}</time>
        <span class="date-status" :class="{ manual: manualPlans[date] }">
          <History v-if="isPast(date)" :size="11" aria-hidden="true" />
          <PenLine v-else-if="manualPlans[date]" :size="11" aria-hidden="true" />
          {{ isPast(date) ? '已过' : manualPlans[date] ? '自定义' : fixed ? '已保存' : '推荐方案' }}
        </span>
      </button>
    </div>
  </nav>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CalendarDays, ChevronLeft, ChevronRight, History, PenLine } from '@lucide/vue'
import { createPlannerDateDrag, plannerDateRevealOffset } from '../../data/plannerDateDrag.js'
const props = defineProps({ dates: { type: Array, required: true }, selected: { type: String, required: true },
  manualPlans: { type: Object, default: () => ({}) }, today: { type: String, default: '' }, fixed: Boolean,
  label: { type: String, default: '选择日程日期' } })
const emit = defineEmits(['select'])
const scroller = ref(null)
const dragging = ref(false)
const drag = createPlannerDateDrag(value => { dragging.value = value })
const activeIndex = computed(() => props.dates.indexOf(props.selected))
const monthLabel = computed(() => { const [year, month] = props.selected.split('-'); return `${year} 年 ${Number(month)} 月` })
function shortDate(date) { const [, month, day] = date.split('-'); return Number(month) + '/' + Number(day) }
function isPast(date) { return props.fixed && props.today && date < props.today }
function dateStatus(date) { return (isPast(date) ? '已过日期，可回顾，' : '') + (props.manualPlans[date] ? '已自定义' : props.fixed ? '已保存日程' : '推荐方案') }
function step(delta) { const date = props.dates[activeIndex.value + delta]; if (date) emit('select', date) }
function onPointerDown(event) {
  drag.down(event)
  // Prevent native mouse focus from scrolling a clipped tab before selection.
  if (event.pointerType === 'mouse' && event.button === 0) {
    event.preventDefault()
    event.target.closest('.date-tab')?.focus({ preventScroll: true })
  }
}
function onKeydown(event) {
  const buttons = [...scroller.value.querySelectorAll('.date-tab')]
  const current = buttons.indexOf(event.target)
  if (current < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, current + (event.key === 'ArrowLeft' ? -1 : 1)))
  buttons[index]?.focus({ preventScroll: true })
  emit('select', props.dates[index])
}
async function revealSelected() {
  await nextTick()
  const element = scroller.value
  const target = element?.querySelector('.selected')
  if (!target) return
  const left = plannerDateRevealOffset(element.getBoundingClientRect(), target.getBoundingClientRect(), element.scrollLeft, element.scrollWidth - element.clientWidth)
  if (Math.abs(left - element.scrollLeft) > 1) element.scrollLeft = left
}
let observer
watch(() => [props.selected, props.dates.join(',')], revealSelected, { immediate: true })
onMounted(() => { observer = new ResizeObserver(revealSelected); observer.observe(scroller.value) })
onBeforeUnmount(() => { observer?.disconnect(); drag.dispose() })
</script>

<style scoped>
.planner-dates { min-width: 0; padding: 0 0 4px; border-bottom: 1px solid var(--line); }
.date-navigation, .date-context, .date-actions { display: flex; align-items: center; }
.date-navigation { justify-content: space-between; gap: 8px; margin-bottom: 4px; }
.date-context { gap: 8px; min-width: 0; color: var(--tea); font: 700 13px var(--font-b); }
.date-context > svg { flex: none; color: var(--accent-strong); }
.date-context small { color: var(--ink-60); font: 12px var(--font-d); white-space: nowrap; }
.date-actions { gap: 2px; }
.date-step, .date-today { display: inline-flex; align-items: center; justify-content: center; flex: none; min-width: 44px; height: 44px; padding: 0 8px; border: 0; border-radius: 9px; background: transparent; color: var(--tea); cursor: pointer; }
.date-today { font: 700 12px var(--font-b); }
.date-step:disabled { opacity: .3; cursor: default; }
.date-tabs { display: flex; gap: 4px; min-width: 0; overflow-x: auto; padding: 4px; scrollbar-width: none; overscroll-behavior-x: contain; touch-action: pan-x pan-y pinch-zoom; cursor: grab; user-select: none; overflow-anchor: none; }
.date-tabs::-webkit-scrollbar { display: none; }
.date-tabs.dragging, .date-tabs.dragging * { cursor: grabbing; }
.date-tab { position: relative; display: flex; flex: 0 0 80px; flex-direction: column; justify-content: center; align-items: center; gap: 4px; min-height: 84px; padding: 9px 4px; border: 0; border-radius: 10px; background: transparent; color: var(--ink); cursor: pointer; white-space: nowrap; transition: background-color 140ms ease, color 140ms ease; }
.day-number { color: var(--ink-60); font: 12px/1.3 var(--font-b); }
.date-tab time { font: 700 18px/1.2 var(--font-d); font-variant-numeric: tabular-nums; }
.date-status { display: flex; align-items: center; justify-content: center; gap: 3px; height: 16px; color: var(--ink-60); font: 11px/1 var(--font-b); }
.date-tab.selected { background: var(--paper); color: var(--tea); box-shadow: inset 0 -2px var(--accent); }
.date-tab.today .day-number, .date-status.manual { color: var(--accent-strong); }
.date-tab.past:not(.selected) time { color: var(--ink-60); }
@media (hover: hover) { button:hover:not(:disabled) { background: var(--cream); }.date-tab.selected:hover { background: var(--paper); } }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
button:active:not(:disabled) { background: var(--paper); }
@media (max-width: 640px) { .date-tab { flex-basis: 68px; }.date-context { flex-wrap: wrap; gap: 4px 6px; }.date-context small { font-size: 11px; } }
@media (prefers-reduced-motion: reduce) { .date-tab { transition: none; } }
</style>
