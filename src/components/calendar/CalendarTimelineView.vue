<template>
  <section class="calendar-timeline" aria-label="活动时间轴">
    <div class="calendar-window-heading">
      <div><h2>{{ rangeLabel }}</h2></div>
      <div class="calendar-window-nav" role="group" aria-label="时间轴导航">
        <button type="button" aria-label="前五周" @click="$emit('select-date', addCalendarDays(anchorDate, -35))"><ChevronLeft :size="20" aria-hidden="true" /></button>
        <button type="button" aria-label="后五周" @click="$emit('select-date', addCalendarDays(anchorDate, 35))"><ChevronRight :size="20" aria-hidden="true" /></button>
      </div>
    </div>
    <div v-if="showHelp" class="calendar-timeline-help">
      <p id="calendar-timeline-help" class="calendar-hint">左右滑动查看日期 · 点击活动条查看完整信息 · 虚线标记今天</p>
      <button type="button" @click="dismissHelp">知道了</button>
    </div>
    <div ref="viewport" class="calendar-timeline-scroll" role="region" aria-label="可横向滚动的五周活动时间轴" :aria-describedby="showHelp ? 'calendar-timeline-help' : undefined" tabindex="0">
      <div class="calendar-timeline-canvas" :style="{ '--calendar-days': days.length }">
        <div class="calendar-timeline-axis">
          <div v-for="day in days" :key="day.date" class="calendar-axis-day" :class="{ 'is-today': day.date === today, 'is-weekend': day.weekend, 'is-anchor': day.date === anchorDate }" :aria-current="day.date === today ? 'date' : undefined">
            <span>{{ day.month }}</span><time :datetime="day.date">{{ day.number }}</time><small>{{ day.date === today ? '今天' : day.weekday }}</small>
          </div>
        </div>
        <div v-if="todayColumn >= 0" class="calendar-today-line" :style="{ left: `calc((${todayColumn} + .5) * var(--calendar-day-width))` }" aria-hidden="true" />
        <section v-for="group in groups" :key="group.category" class="calendar-timeline-group" :aria-label="group.label">
          <h3>{{ group.label }}<span>{{ group.items.length }}</span></h3>
          <div v-for="entry in group.items" :key="entry.item.id" class="calendar-timeline-row">
            <p class="calendar-timeline-row-label">{{ entry.item.title }} <span>{{ entry.item.game }} · {{ entry.status }}</span></p>
            <div class="calendar-timeline-track">
              <button type="button" class="calendar-timeline-bar" :class="{ 'is-ending': entry.ending, 'is-clipped-start': entry.position.clippedStart, 'is-clipped-end': entry.position.clippedEnd }" :style="{ gridColumn: `${entry.position.column} / span ${entry.position.span}` }" :aria-label="entry.label" :aria-expanded="selectedId === entry.item.id" aria-controls="calendar-timeline-detail" @click="selectEvent(entry.item.id)">
                <span>{{ entry.item.title }} · {{ entry.item.game }} · {{ entry.status }}</span>
              </button>
            </div>
          </div>
        </section>
        <p v-if="!loading && !error && !groups.length" class="calendar-timeline-empty" role="status">当前时间窗口暂无活动，试试其它日期、游戏或类型。</p>
      </div>
    </div>
    <div v-if="selectedItem" id="calendar-timeline-detail" ref="detail" class="calendar-timeline-detail" tabindex="-1" aria-label="选中活动详情">
      <CalendarEventCard :item="selectedItem" :today="today" />
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import CalendarEventCard from './CalendarEventCard.vue'
import { addCalendarDays, CALENDAR_CATEGORIES, calendarDateLabel, calendarDates, calendarDayDistance, calendarRangeLabel, calendarStatuses, timelineItemPosition, timelineRange } from '@/data/activityCalendar.js'
const props = defineProps({ items: { type: Array, required: true }, today: { type: String, required: true }, anchorDate: { type: String, required: true }, locateRequest: Number, loading: Boolean, error: Boolean })
defineEmits(['select-date'])
const viewport = ref(null), detail = ref(null), selectedId = ref('')
const helpStorageKey = 'yuanhub.activity-calendar.timeline-help-dismissed.v1'
const showHelp = ref(true)
try { showHelp.value = localStorage.getItem(helpStorageKey) !== '1' } catch { /* Storage may be unavailable; keep the hint dismissible. */ }
function dismissHelp() {
  showHelp.value = false
  try { localStorage.setItem(helpStorageKey, '1') } catch { /* Dismissal still applies to this mounted view. */ }
  viewport.value?.focus({ preventScroll: true })
}
const range = computed(() => timelineRange(props.anchorDate))
const rangeLabel = computed(() => {
  const options = { month: 'long', day: 'numeric' }
  if (range.value.from.slice(0, 4) !== range.value.to.slice(0, 4)) options.year = 'numeric'
  return `${calendarDateLabel(range.value.from, options)} — ${calendarDateLabel(range.value.to, options)}`
})
const days = computed(() => calendarDates(range.value).map(date => {
  const weekday = new Date(date + 'T00:00:00Z').getUTCDay()
  return { date, number: Number(date.slice(8)), month: date === range.value.from || date.endsWith('-01') ? `${Number(date.slice(5, 7))}月` : '', weekday: ['日', '一', '二', '三', '四', '五', '六'][weekday], weekend: weekday === 0 || weekday === 6 }
}))
const todayColumn = computed(() => props.today >= range.value.from && props.today <= range.value.to ? calendarDayDistance(range.value.from, props.today) : -1)
const groups = computed(() => Object.entries(CALENDAR_CATEGORIES).map(([category, label]) => {
  const items = props.items.filter(item => item.category === category).map(item => {
    const position = timelineItemPosition(item, range.value)
    const status = calendarStatuses(item, props.today).join(' · ')
    return {
      item, position, status,
      ending: item.start_date <= props.today && item.end_date >= props.today && item.end_date <= addCalendarDays(props.today, 2),
      label: `${item.title}，${item.game}，${label}，${calendarRangeLabel(item)}${item.start_time ? '，' + item.time_zone : ''}，${status}，查看详情`,
    }
  }).filter(entry => entry.position).sort((a, b) => a.item.start_date.localeCompare(b.item.start_date) || a.item.id.localeCompare(b.item.id))
  return { category, label, items }
}).filter(group => group.items.length))
const selectedItem = computed(() => props.items.find(item => item.id === selectedId.value))
async function selectEvent(id) {
  selectedId.value = selectedId.value === id ? '' : id
  await nextTick()
  detail.value?.focus({ preventScroll: true })
  detail.value?.scrollIntoView?.({ block: 'nearest', behavior: 'instant' })
}
function locate() {
  const dayWidth = viewport.value?.querySelector('.calendar-axis-day')?.getBoundingClientRect().width || 0
  if (viewport.value) viewport.value.scrollLeft = Math.max(0, 7 * dayWidth - viewport.value.clientWidth / 3)
}
onMounted(locate)
watch(() => [props.anchorDate, props.locateRequest], locate, { flush: 'post' })
watch(() => props.items, () => { selectedId.value = '' })
</script>
