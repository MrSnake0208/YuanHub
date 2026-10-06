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
      <p id="calendar-timeline-help" class="calendar-hint">左右滑动查看日期 · 条的起止与长度表示活动时间 · 竖线标记今天 · 点击查看详情</p>
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
          <div v-for="(lane, index) in group.lanes" :key="index" class="calendar-timeline-track">
            <button v-for="entry in lane" :key="entry.item.id" type="button" class="calendar-timeline-bar" :class="{ 'is-ending': entry.ending, 'is-single-day': entry.item.start_date === entry.item.end_date, 'is-clipped-start': entry.position.clippedStart, 'is-clipped-end': entry.position.clippedEnd }" :style="{ gridColumn: `${entry.position.column} / span ${entry.position.span}` }" :title="entry.label" :aria-label="entry.label" :aria-pressed="selectedId === entry.item.id" :aria-expanded="selectedId === entry.item.id" aria-controls="calendar-timeline-detail" @click="selectEvent(entry.item.id, $event)">
              <span class="calendar-timeline-bar-content">
                <span v-if="entry.item.start_date === entry.item.end_date" class="calendar-timeline-point" aria-hidden="true" />
                <span class="calendar-timeline-bar-title">{{ entry.item.title }}</span>
                <span v-if="entry.item.start_date !== entry.item.end_date" class="calendar-timeline-bar-meta">{{ entry.item.game }}<strong v-if="entry.ending"> · {{ entry.deadline }}</strong></span>
              </span>
            </button>
          </div>
        </section>
        <p v-if="!loading && !error && !groups.length" class="calendar-timeline-empty" role="status">当前时间窗口暂无活动，试试其它日期、游戏或类型。</p>
      </div>
    </div>
    <div v-if="selectedItem" id="calendar-timeline-detail" ref="detail" class="calendar-timeline-detail" tabindex="-1" role="region" aria-labelledby="calendar-timeline-detail-title">
      <div class="calendar-detail-heading"><h3 id="calendar-timeline-detail-title">选中活动</h3><button type="button" @click="closeDetail">关闭详情</button></div>
      <CalendarEventCard :key="selectedItem.id" :item="selectedItem" :today="today" />
    </div>
  </section>
</template>

<script setup>
import { computed, inject, nextTick, onMounted, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import CalendarEventCard from './CalendarEventCard.vue'
import { CALENDAR_SUBSCRIPTIONS } from '@/data/activityCalendarSubscriptions.js'
import { addCalendarDays, CALENDAR_CATEGORIES, calendarDateLabel, calendarDates, calendarDayDistance, calendarDeadline, calendarRangeLabel, calendarStatuses, timelineLanes, timelineRange } from '@/data/activityCalendar.js'
const subscriptions = inject(CALENDAR_SUBSCRIPTIONS, null)
const props = defineProps({ items: { type: Array, required: true }, today: { type: String, required: true }, anchorDate: { type: String, required: true }, locateRequest: Number, loading: Boolean, error: Boolean })
defineEmits(['select-date'])
const viewport = ref(null), detail = ref(null), selectedId = ref('')
let selectionTrigger = null
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
  const lanes = timelineLanes(props.items.filter(item => item.category === category), range.value).map(lane => lane.map(({ item, position }) => {
    const statuses = calendarStatuses(item, props.today, subscriptions?.now.value)
    const deadline = calendarDeadline(item, props.today, subscriptions?.now.value)
    return {
      item, position, deadline,
      ending: !statuses.includes('已结束') && !statuses.includes('即将开始') && item.end_date <= addCalendarDays(props.today, 2),
      label: `${item.title}，${item.game}，${label}，${calendarRangeLabel(item)}${item.start_time ? '，' + item.time_zone : ''}，${statuses.join(' · ')}${deadline ? '，' + deadline : ''}，查看详情`,
    }
  }))
  return { category, label, lanes, items: lanes.flat() }
}).filter(group => group.lanes.length))
const selectedItem = computed(() => groups.value.flatMap(group => group.items).find(entry => entry.item.id === selectedId.value)?.item)
async function selectEvent(id, event) {
  if (selectedId.value === id) return
  const trigger = event.currentTarget
  const context = subscriptions?.key.value
  if (subscriptions && (!await subscriptions.confirmDiscard() || context !== subscriptions.key.value)) return
  selectionTrigger = trigger
  selectedId.value = id
  await nextTick()
  detail.value?.focus({ preventScroll: true })
  detail.value?.scrollIntoView?.({ block: 'nearest', behavior: 'instant' })
}
async function closeDetail() {
  const context = subscriptions?.key.value
  if (subscriptions && (!await subscriptions.confirmDiscard() || context !== subscriptions.key.value)) return
  selectedId.value = ''
  await nextTick()
  if (selectionTrigger?.isConnected) selectionTrigger.focus({ preventScroll: true })
  else viewport.value?.focus({ preventScroll: true })
}
function locate() {
  const dayWidth = viewport.value?.querySelector('.calendar-axis-day')?.getBoundingClientRect().width || 0
  if (viewport.value) viewport.value.scrollLeft = Math.max(0, (calendarDayDistance(range.value.from, props.anchorDate) + .5) * dayWidth - viewport.value.clientWidth / 3)
}
onMounted(locate)
watch(() => [props.anchorDate, props.locateRequest], locate, { flush: 'post' })
watch(selectedItem, item => { if (!item) selectedId.value = '' })
</script>
