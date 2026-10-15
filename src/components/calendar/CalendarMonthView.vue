<template>
  <section ref="month" class="calendar-month" aria-label="活动月历" :aria-busy="loading" tabindex="-1">
    <div class="calendar-window-heading">
      <h2>{{ monthLabel }}</h2>
      <div class="calendar-window-nav" role="group" aria-label="月份导航">
        <button type="button" aria-label="上个月" @click="selectDate(shiftCalendarMonth(anchorDate, -1))"><ChevronLeft :size="20" aria-hidden="true" /></button>
        <button type="button" aria-label="下个月" @click="selectDate(shiftCalendarMonth(anchorDate, 1))"><ChevronRight :size="20" aria-hidden="true" /></button>
      </div>
    </div>
    <p class="calendar-month-help">点事项查看详情 · 点日期或 +N 查看当天清单 · 箭头表示延续</p>
    <div class="calendar-month-board">
      <div class="calendar-weekdays" aria-hidden="true"><span v-for="day in weekdays" :key="day">{{ day }}</span></div>
      <div class="calendar-month-grid">
        <template v-for="week in weeks" :key="week.from">
          <section class="calendar-month-week" :aria-label="`${calendarDateLabel(week.from)}至${calendarDateLabel(week.to)}`">
            <div class="calendar-month-dates">
              <button v-for="day in week.days" :key="day.date" type="button" class="calendar-month-day" :class="{ 'is-outside': !day.inMonth, 'is-today': day.date === today }" :aria-pressed="day.date === anchorDate" :aria-current="day.date === today ? 'date' : undefined" :aria-label="dayLabel(day)" aria-haspopup="dialog" @click="openDay(day.date, '', $event)">
                <span class="calendar-day-number">{{ Number(day.date.slice(8)) }}<span v-if="day.date === today" class="calendar-day-today" aria-hidden="true">今</span></span>
              </button>
            </div>
            <div v-if="week.rowCount" class="calendar-month-bars" :style="{ gridTemplateRows: `repeat(${week.rowCount}, minmax(44px, auto))` }">
              <button v-for="entry in week.segments" :key="entry.item.id" type="button" class="calendar-month-bar" :class="{ 'is-narrow': entry.position.span === 1, 'has-up-agents': !!entry.upAgents, 'is-clipped-start': entry.position.clippedStart, 'is-clipped-end': entry.position.clippedEnd }" :style="{ ...entry.display.style, gridColumn: `${entry.position.column} / span ${entry.position.span}`, gridRow: entry.row + 1 }" :data-event-id="entry.item.id" :data-type-color="entry.display.color" :aria-label="`${entry.item.title}，${entry.display.path}${entry.upAgents ? '，' + entry.upAgents.full : ''}，${calendarRangeLabel(entry.item)}，查看事项详情`" aria-haspopup="dialog" @click="openDay(segmentDate(entry, week), entry.item.id, $event)">
                <span v-if="entry.position.clippedStart" class="calendar-month-continuation" aria-hidden="true"><ChevronLeft :size="16" aria-hidden="true" /></span>
                <span class="calendar-month-bar-content">
                  <span class="calendar-month-bar-text">{{ entry.upAgents ? entry.item.title : `${entry.display.label} · ${entry.item.title}` }}</span>
                  <span v-if="entry.upAgents" class="calendar-month-bar-up"><span class="calendar-bar-up-prefix">UP · </span>{{ entry.position.span === 1 ? entry.upAgents.narrow : entry.upAgents.summary }}</span>
                </span>
                <span v-if="entry.position.clippedEnd" class="calendar-month-continuation" aria-hidden="true"><ChevronRight :size="16" aria-hidden="true" /></span>
              </button>
            </div>
            <div v-if="week.days.some(day => day.hiddenCount)" class="calendar-month-overflow">
              <template v-for="(day, index) in week.days" :key="day.date">
                <button v-if="day.hiddenCount" type="button" :style="{ gridColumn: index + 1 }" :aria-label="`${calendarDateLabel(day.date)}，另有${day.hiddenCount}项，查看当天全部${day.items.length}项`" aria-haspopup="dialog" @click="openDay(day.date, '', $event)">+{{ day.hiddenCount }}</button>
              </template>
            </div>
          </section>
        </template>
      </div>
    </div>
    <CalendarDetailDialog :selection="selection" :items="items" :today="today" :loading="loading" :error="detailError" :can-create="canCreate" @close="closeDetail" @retry="$emit('retry')" @create-private="$emit('create-private', $event)" />
  </section>
</template>

<script setup>
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import CalendarDetailDialog from './CalendarDetailDialog.vue'
import { CALENDAR_SUBSCRIPTIONS } from '@/data/activityCalendarSubscriptions.js'
import { addCalendarDays, calendarDateLabel, calendarRangeLabel, monthCalendarWeeks, shiftCalendarMonth } from '@/data/activityCalendar.js'
import { calendarDisplay, calendarUpAgentDisplay } from '@/data/activityCalendarTypes.js'
const props = defineProps({ items: { type: Array, required: true }, today: { type: String, required: true }, anchorDate: { type: String, required: true }, loading: Boolean, error: Boolean, detailError: { type: String, default: '' }, canCreate: Boolean })
const emit = defineEmits(['select-date', 'create-private', 'close-detail', 'retry'])
const subscriptions = inject(CALENDAR_SUBSCRIPTIONS, null)
const weekdays = ['一', '二', '三', '四', '五', '六', '日']
const wide = ref(false), month = ref(null), selection = ref(null)
let media, identityRevision = 0
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
  ...week, segments: week.segments.map(entry => ({ ...entry, display: calendarDisplay(entry.item), upAgents: calendarUpAgentDisplay(entry.item) })),
})))
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
  emit('select-date', date)
}
async function openDay(date, id, event) {
  const trigger = event?.currentTarget, revision = identityRevision
  if (selection.value && props.anchorDate === date && subscriptions?.dirty.value) {
    const context = subscriptions.key.value
    if (!await subscriptions.confirmDiscard() || context !== subscriptions.key.value || revision !== identityRevision) return
    subscriptions.discardDrafts()
  }
  // 导航与未保存确认通过后才打开；跨月加载在弹窗内反馈。
  emit('select-date', date, () => {
    if (props.anchorDate !== date) return
    if (revision !== identityRevision) return
    trigger?.focus({ preventScroll: true })
    selection.value = { date, id }
  })
}
async function closeDetail() {
  const previous = selection.value, context = subscriptions?.key.value
  if (!previous || subscriptions && !await subscriptions.confirmDiscard()) return
  if (context !== subscriptions?.key.value || selection.value !== previous) return
  if (subscriptions?.dirty.value) subscriptions.discardDrafts()
  selection.value = null
  emit('close-detail')
}
function resetDetail() { selection.value = null }
function openEvent(id) {
  month.value?.focus({ preventScroll: true })
  selection.value = { date: props.anchorDate, id }
}
watch(() => subscriptions?.key.value, resetDetail, { flush: 'sync' })
watch(() => props.anchorDate, resetDetail, { flush: 'sync' })
watch([() => subscriptions?.identity.value, () => subscriptions?.account.value?.id], () => { identityRevision++ }, { flush: 'sync' })
defineExpose({ openEvent, resetDetail })
</script>
