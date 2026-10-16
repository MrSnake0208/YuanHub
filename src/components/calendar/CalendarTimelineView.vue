<template>
  <section class="calendar-timeline" aria-label="活动时间轴">
    <div class="calendar-window-heading">
      <div><p class="calendar-eyebrow">五周范围 · 左右滑动查看日期</p><h2>{{ rangeLabel }}</h2></div>
      <div class="calendar-window-nav" role="group" aria-label="时间轴导航">
        <button type="button" aria-label="前五周" @click="$emit('select-date', addCalendarDays(anchorDate, -35))"><ChevronLeft :size="20" aria-hidden="true" /></button>
        <button type="button" aria-label="后五周" @click="$emit('select-date', addCalendarDays(anchorDate, 35))"><ChevronRight :size="20" aria-hidden="true" /></button>
      </div>
    </div>
    <div v-if="showHelp" class="calendar-timeline-help">
      <p id="calendar-timeline-help" class="calendar-hint">左右滑动查看日期 · 条的起止与长度表示活动时间 · 竖线标记今天 · 点击查看详情</p>
      <button type="button" @click="dismissHelp">知道了</button>
    </div>
    <div ref="viewport" class="calendar-timeline-scroll" role="region" aria-label="可横向滚动的五周活动时间轴" :aria-describedby="showHelp ? 'calendar-timeline-help' : undefined" tabindex="0" @scroll.passive="syncViewport">
      <div class="calendar-timeline-canvas" :style="{ '--calendar-days': days.length }">
        <div class="calendar-timeline-axis">
          <div v-for="day in days" :key="day.date" class="calendar-axis-day" :class="{ 'is-today': day.date === today, 'is-weekend': day.weekend, 'is-anchor': day.date === anchorDate }" :aria-current="day.date === today ? 'date' : undefined">
            <span>{{ day.month }}</span><time :datetime="day.date">{{ day.number }}</time><small>{{ day.date === today ? '今天' : day.weekday }}</small>
          </div>
        </div>
        <div v-if="todayColumn >= 0" class="calendar-today-line" :style="{ left: `calc((${todayColumn} + .5) * var(--calendar-day-width))` }" aria-hidden="true" />
        <section v-for="group in groups" :key="group.category" class="calendar-timeline-group" :aria-label="group.label">
          <h3>
            <button v-if="compactPublic" type="button" class="calendar-public-group-toggle" :aria-expanded="!collapsedGroups.includes(group.category)" :aria-controls="`calendar-timeline-group-${group.category}`" @click="toggleGroup(group.category)"><ChevronRight v-if="collapsedGroups.includes(group.category)" :size="16" aria-hidden="true" /><ChevronDown v-else :size="16" aria-hidden="true" />{{ group.label }}<span>{{ group.items.length }}</span></button>
            <template v-else>{{ group.label }}<span>{{ group.items.length }}</span></template>
          </h3>
          <div v-show="!compactPublic || !collapsedGroups.includes(group.category)" :id="`calendar-timeline-group-${group.category}`">
            <div v-for="(lane, index) in group.lanes" :key="index" class="calendar-timeline-track">
              <button v-for="entry in lane" :key="entry.item.id" type="button" class="calendar-timeline-bar" :class="{ 'is-ending': entry.ending, 'has-up-agents': !!entry.upAgents, 'is-single-day': entry.item.start_date === entry.item.end_date, 'is-clipped-start': entry.position.clippedStart, 'is-clipped-end': entry.position.clippedEnd }" :style="{ ...entry.display.style, gridColumn: `${entry.position.column} / span ${entry.position.span}` }" :data-type-color="entry.display.color" :title="entry.label" :aria-label="entry.label" :aria-pressed="selectedId === entry.item.id" aria-haspopup="dialog" @click="selectEvent(entry.item.id, $event)">
                <span class="calendar-timeline-bar-content" :style="entry.item.start_date !== entry.item.end_date ? barContentStyle(entry.position) : undefined">
                  <span v-if="entry.item.start_date === entry.item.end_date && !entry.upAgents" class="calendar-timeline-point" aria-hidden="true" />
                  <span class="calendar-timeline-bar-title">{{ entry.item.title }}</span>
                  <span v-if="!compactPublic && (entry.upAgents || entry.item.start_date !== entry.item.end_date)" class="calendar-timeline-bar-meta">
                    <span v-if="entry.upAgents" class="calendar-timeline-bar-up"><span class="calendar-bar-up-prefix">UP · </span>{{ entry.position.span === 1 ? entry.upAgents.narrow : entry.upAgents.summary }}</span>
                    <span v-if="entry.item.start_date !== entry.item.end_date" class="calendar-timeline-bar-context">{{ entry.upAgents ? ' · ' : '' }}{{ entry.item.game }} · {{ entry.display.label }}</span>
                    <strong v-if="entry.ending"> · 结束提醒：{{ entry.deadline }}</strong>
                  </span>
                </span>
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
    <CalendarDetailDialog :selection="selection" :items="items" :today="today" :loading="loading" :error="detailError" :can-create="canCreate" @close="closeDetail" @retry="$emit('retry')" @create-private="$emit('create-private', $event)" />
  </section>
</template>

<script setup>
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ChevronDown, ChevronLeft, ChevronRight } from '@lucide/vue'
import CalendarDetailDialog from './CalendarDetailDialog.vue'
import { CALENDAR_SUBSCRIPTIONS } from '@/data/activityCalendarSubscriptions.js'
import { addCalendarDays, calendarDateLabel, calendarDates, calendarDayDistance, calendarDeadline, calendarRangeLabel, calendarStatuses, timelineLanes, timelineRange } from '@/data/activityCalendar.js'
import { CALENDAR_DISPLAY_GROUPS, calendarDisplay, calendarUpAgentDisplay } from '@/data/activityCalendarTypes.js'
const subscriptions = inject(CALENDAR_SUBSCRIPTIONS, null)
const props = defineProps({ items: { type: Array, required: true }, today: { type: String, required: true }, anchorDate: { type: String, required: true }, locateRequest: Number, loading: Boolean, error: Boolean, detailError: { type: String, default: '' }, canCreate: Boolean, compactPublic: Boolean })
const emit = defineEmits(['select-date', 'close-detail', 'retry', 'create-private'])
const viewport = ref(null), selection = ref(null)
const collapsedGroups = ref([])
function toggleGroup(category) {
  collapsedGroups.value = collapsedGroups.value.includes(category) ? collapsedGroups.value.filter(value => value !== category) : [...collapsedGroups.value, category]
}
const selectedId = computed(() => selection.value?.id || '')
const viewportSize = ref({ left: 0, width: 0, dayWidth: 0 })
let viewportObserver
function syncViewport() {
  if (!viewport.value) return
  viewportSize.value = { left: viewport.value.scrollLeft, width: viewport.value.clientWidth, dayWidth: viewport.value.querySelector('.calendar-axis-day')?.getBoundingClientRect().width || 0 }
}
function barContentStyle(position) {
  const { left, width, dayWidth } = viewportSize.value
  if (!width || !dayWidth) return undefined
  // 留出边框与内边距，文字宽度只使用活动条和视口的交集。
  const start = Math.max(left + 12, (position.column - 1) * dayWidth + 16)
  const end = Math.min(left + width - 12, (position.column - 1 + position.span) * dayWidth - 16)
  return { maxWidth: `${Math.max(0, Math.min(360, end - start))}px` }
}
let selectionRevision = 0
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
const groups = computed(() => [...Object.entries(CALENDAR_DISPLAY_GROUPS), ['PRIVATE_ITEM', '私人事项']].map(([category, label]) => {
  const lanes = timelineLanes(props.items.filter(item => calendarDisplay(item).group === category), range.value).map(lane => lane.map(({ item, position }) => {
    const display = calendarDisplay(item)
    const upAgents = calendarUpAgentDisplay(item)
    const statuses = calendarStatuses(item, props.today, subscriptions?.now.value)
    const deadline = calendarDeadline(item, props.today, subscriptions?.now.value)
    return {
      item, position, deadline, display, upAgents,
      ending: item.source_type !== 'PRIVATE_ITEM' && item.end_date != null && !statuses.includes('已结束') && !statuses.includes('即将开始') && item.end_date <= addCalendarDays(props.today, 2),
      label: `${item.title}，${item.game}，${display.path}${upAgents ? '，' + upAgents.full : ''}，${calendarRangeLabel(item)}${item.start_time ? '，' + item.time_zone : ''}，${statuses.join(' · ')}${deadline ? '，' + deadline : ''}，查看详情`,
    }
  }))
  return { category, label, lanes, items: lanes.flat() }
}).filter(group => group.lanes.length))
async function selectEvent(id, event) {
  if (selectedId.value === id) return
  const trigger = event.currentTarget
  const revision = selectionRevision, previous = selection.value
  if (subscriptions && !await subscriptions.confirmDiscard()) return
  if (revision !== selectionRevision || previous !== selection.value) return
  if (subscriptions?.dirty.value) subscriptions.discardDrafts()
  trigger.focus({ preventScroll: true })
  selection.value = eventSelection(id)
}
async function closeDetail() {
  const revision = selectionRevision, previous = selection.value
  if (!previous || subscriptions && !await subscriptions.confirmDiscard()) return
  if (revision !== selectionRevision || previous !== selection.value) return
  if (subscriptions?.dirty.value) subscriptions.discardDrafts()
  selection.value = null
  emit('close-detail')
}
function eventSelection(id) {
  const item = props.items.find(item => item.id === id)
  let date = props.anchorDate
  if (item?.start_date > date) date = item.start_date
  if (item?.end_date && date > item.end_date) date = item.end_date
  return { id, date }
}
function resetDetail() { selectionRevision++; selection.value = null }
function openEvent(id) {
  viewport.value?.focus({ preventScroll: true })
  selection.value = eventSelection(id)
}
function locate() {
  const dayWidth = viewport.value?.querySelector('.calendar-axis-day')?.getBoundingClientRect().width || 0
  if (viewport.value) viewport.value.scrollLeft = Math.max(0, (calendarDayDistance(range.value.from, props.anchorDate) + .5) * dayWidth - viewport.value.clientWidth / 3)
  syncViewport()
}
onMounted(() => {
  locate()
  if (typeof ResizeObserver !== 'undefined') {
    viewportObserver = new ResizeObserver(syncViewport)
    viewportObserver.observe(viewport.value)
  }
})
onBeforeUnmount(() => viewportObserver?.disconnect())
watch(() => [props.anchorDate, props.locateRequest], locate, { flush: 'post' })
watch(() => subscriptions?.key.value, resetDetail, { flush: 'sync' })
watch(() => props.anchorDate, resetDetail, { flush: 'sync' })
defineExpose({ openEvent, resetDetail })
</script>
