<template>
  <section class="calendar-month" aria-label="活动月历" :aria-busy="loading">
    <div class="calendar-window-heading">
      <h2>{{ monthLabel }}</h2>
      <div class="calendar-window-nav" role="group" aria-label="月份导航">
        <button type="button" aria-label="上个月" @click="selectDate(shiftCalendarMonth(anchorDate, -1))"><ChevronLeft :size="20" aria-hidden="true" /></button>
        <button type="button" aria-label="下个月" @click="selectDate(shiftCalendarMonth(anchorDate, 1))"><ChevronRight :size="20" aria-hidden="true" /></button>
      </div>
    </div>
    <p class="calendar-month-help">横条表示日期范围 · 箭头表示延续 · 点日期或 +N 查看完整清单</p>
    <div class="calendar-month-board">
      <div class="calendar-weekdays" aria-hidden="true"><span v-for="day in weekdays" :key="day">{{ day }}</span></div>
      <div class="calendar-month-grid">
        <template v-for="week in weeks" :key="week.from">
          <section class="calendar-month-week" :aria-label="`${calendarDateLabel(week.from)}至${calendarDateLabel(week.to)}`">
            <div class="calendar-month-dates">
              <button v-for="day in week.days" :key="day.date" type="button" class="calendar-month-day" :class="{ 'is-outside': !day.inMonth, 'is-today': day.date === today }" :aria-pressed="day.date === anchorDate" :aria-current="day.date === today ? 'date' : undefined" :aria-label="dayLabel(day)" :aria-controls="!loading && !error ? 'calendar-day-detail' : undefined" @click="selectDate(day.date)">
                <span class="calendar-day-number">{{ Number(day.date.slice(8)) }}<span v-if="day.date === today" class="calendar-day-today" aria-hidden="true">今</span></span>
              </button>
            </div>
            <div v-if="week.rowCount" class="calendar-month-bars" :style="{ gridTemplateRows: `repeat(${week.rowCount}, minmax(44px, auto))` }">
              <button v-for="entry in week.segments" :key="entry.item.id" type="button" class="calendar-month-bar" :class="{ 'is-narrow': entry.position.span === 1, 'is-clipped-start': entry.position.clippedStart, 'is-clipped-end': entry.position.clippedEnd }" :style="{ ...entry.display.style, gridColumn: `${entry.position.column} / span ${entry.position.span}`, gridRow: entry.row + 1 }" :data-event-id="entry.item.id" :data-type-color="entry.display.color" :aria-label="`${entry.item.title}，${entry.display.path}，${calendarRangeLabel(entry.item)}，查看当天完整事项`" aria-controls="calendar-day-detail" @click="openDay(segmentDate(entry, week), entry.item.id)">
                <span v-if="entry.position.clippedStart" class="calendar-month-continuation" aria-hidden="true">‹</span>
                <span class="calendar-month-bar-text">{{ entry.display.label }} · {{ entry.item.title }}</span>
                <span v-if="entry.position.clippedEnd" class="calendar-month-continuation" aria-hidden="true">›</span>
              </button>
            </div>
            <div v-if="week.days.some(day => day.hiddenCount)" class="calendar-month-overflow">
              <template v-for="(day, index) in week.days" :key="day.date">
                <button v-if="day.hiddenCount" type="button" :style="{ gridColumn: index + 1 }" :aria-label="`${calendarDateLabel(day.date)}，另有${day.hiddenCount}项，查看当天全部${day.items.length}项`" aria-controls="calendar-day-detail" @click="openDay(day.date)">+{{ day.hiddenCount }}</button>
              </template>
            </div>
          </section>
          <section v-if="!loading && !error && anchorDate >= week.from && anchorDate <= week.to" id="calendar-day-detail" ref="detail" class="calendar-day-detail" aria-labelledby="calendar-day-detail-title">
            <div class="calendar-detail-heading"><h3 id="calendar-day-detail-title" tabindex="-1">{{ calendarDateLabel(anchorDate) }}</h3><span role="status">{{ selectedItems.length ? `${selectedItems.length} 项${selectedItems.some(item => item.source_type === 'PRIVATE_ITEM') ? '' : '活动'}` : canCreate ? '暂无事项' : '暂无活动' }}</span><button v-if="canCreate" type="button" class="calendar-private-add" @click="$emit('create-private', anchorDate)"><Plus :size="17" aria-hidden="true" /> 记一件事</button></div>
            <p v-if="selectedItems.length" class="calendar-hint">当天完整清单，可在清单内滚动查看</p>
            <div v-if="selectedItems.length" class="calendar-event-list" role="region" :aria-label="`${calendarDateLabel(anchorDate)}全部${selectedItems.length}项`" tabindex="0"><div v-for="item in selectedItems" :key="item.id" class="calendar-month-event" :data-event-id="item.id" tabindex="-1"><CalendarEventCard :item="item" :today="today" /></div></div>
          </section>
        </template>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight, Plus } from '@lucide/vue'
import CalendarEventCard from './CalendarEventCard.vue'
import { addCalendarDays, calendarDateLabel, calendarRangeLabel, monthCalendarWeeks, shiftCalendarMonth } from '@/data/activityCalendar.js'
import { calendarDisplay } from '@/data/activityCalendarTypes.js'
const props = defineProps({ items: { type: Array, required: true }, today: { type: String, required: true }, anchorDate: { type: String, required: true }, loading: Boolean, error: Boolean, canCreate: Boolean })
const emit = defineEmits(['select-date', 'create-private'])
const weekdays = ['一', '二', '三', '四', '五', '六', '日']
const wide = ref(false), detail = ref([])
let media, focusRequest
const updateWidth = () => { wide.value = media.matches }
onMounted(() => {
  if (typeof window.matchMedia !== 'function') return
  media = window.matchMedia('(min-width: 1024px)')
  updateWidth()
  media.addEventListener('change', updateWidth)
})
onUnmounted(() => media?.removeEventListener('change', updateWidth))
const monthLabel = computed(() => calendarDateLabel(props.anchorDate, { year: 'numeric', month: 'long' }))
const weeks = computed(() => monthCalendarWeeks(props.loading || props.error ? [] : props.items, props.anchorDate, wide.value ? 4 : 3).map(week => ({
  ...week, segments: week.segments.map(entry => ({ ...entry, display: calendarDisplay(entry.item) })),
})))
const selectedItems = computed(() => weeks.value.flatMap(week => week.days).find(day => day.date === props.anchorDate)?.items || [])
function dayLabel(day) {
  const label = [calendarDateLabel(day.date, { year: 'numeric', month: 'long', day: 'numeric' })]
  const noun = day.items.some(item => item.source_type === 'PRIVATE_ITEM') ? '事项' : '活动'
  label.push(props.loading ? '日历读取中' : props.error ? '日历读取失败' : `${day.items.length}项${noun}`)
  if (day.date === props.today) label.push('今天')
  if (day.date === props.anchorDate) label.push('已选中')
  if (!props.loading && !props.error) label.push(...new Set(day.items.map(item => calendarDisplay(item).path)))
  return label.join('，')
}
function segmentDate(entry, week) {
  const from = addCalendarDays(week.from, entry.position.column - 1)
  const to = addCalendarDays(from, entry.position.span - 1)
  return props.anchorDate >= from && props.anchorDate <= to ? props.anchorDate : from
}
function selectDate(date) {
  focusRequest = null
  emit('select-date', date)
}
async function focusDetail() {
  const request = focusRequest
  if (!request) return
  if (props.anchorDate !== request.date || props.error) { focusRequest = null; return }
  if (props.loading) return
  await nextTick()
  if (focusRequest !== request || props.loading || props.error) return
  const section = detail.value[0]
  const card = request.id && [...(section?.querySelectorAll('.calendar-month-event') || [])].find(node => node.dataset.eventId === request.id)
  const target = card || section?.querySelector('h3')
  target?.focus({ preventScroll: true })
  target?.scrollIntoView?.({ block: 'nearest', behavior: 'instant' })
  focusRequest = null
}
function openDay(date, id) {
  focusRequest = null
  // Accept focus intent only after navigation/dirty guard, then wait for its data.
  emit('select-date', date, () => {
    if (props.anchorDate !== date) return
    focusRequest = { date, id }
    return focusDetail()
  })
}
watch(() => [props.anchorDate, props.loading, props.error], focusDetail, { flush: 'post' })
</script>
