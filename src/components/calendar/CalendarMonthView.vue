<template>
  <section class="calendar-month" aria-label="活动月历">
    <div class="calendar-window-heading">
      <div><p class="calendar-eyebrow">按日期翻阅</p><h2>{{ monthLabel }}</h2></div>
      <div class="calendar-window-nav" role="group" aria-label="月份导航">
        <button type="button" aria-label="上个月" @click="$emit('select-date', shiftCalendarMonth(anchorDate, -1))"><ChevronLeft :size="20" aria-hidden="true" /></button>
        <button type="button" aria-label="下个月" @click="$emit('select-date', shiftCalendarMonth(anchorDate, 1))"><ChevronRight :size="20" aria-hidden="true" /></button>
      </div>
    </div>
    <div class="calendar-month-board">
      <div class="calendar-weekdays" aria-hidden="true"><span v-for="day in weekdays" :key="day">{{ day }}</span></div>
      <div class="calendar-month-grid">
        <button v-for="day in days" :key="day.date" type="button" class="calendar-month-day" :class="{ 'is-outside': !day.inMonth, 'is-today': day.date === today }" :aria-pressed="day.date === anchorDate" :aria-current="day.date === today ? 'date' : undefined" :aria-label="day.label" @click="$emit('select-date', day.date)">
          <span class="calendar-day-number">{{ Number(day.date.slice(8)) }}<span v-if="day.date === today" class="calendar-day-today" aria-hidden="true">今</span></span>
          <span v-if="!loading && !error && day.items.length" class="calendar-day-count">{{ day.items.length }} 项</span>
          <span v-if="!loading && !error" class="calendar-month-tags" aria-hidden="true"><span v-for="item in day.items.slice(0, 2)" :key="item.id">{{ item.title }}</span><small v-if="day.items.length > 2">+{{ day.items.length - 2 }}</small></span>
        </button>
      </div>
    </div>
    <section v-if="!loading && !error" class="calendar-day-detail" aria-labelledby="calendar-day-detail-title" aria-live="polite">
      <div class="calendar-detail-heading"><h3 id="calendar-day-detail-title">{{ calendarDateLabel(anchorDate) }}</h3><span>{{ selectedItems.length }} 项活动</span></div>
      <p v-if="!selectedItems.length" class="calendar-empty" role="status">{{ calendarDateLabel(anchorDate, { month: 'long', day: 'numeric' }) }}暂无活动</p>
      <div v-else class="calendar-event-list"><CalendarEventCard v-for="item in selectedItems" :key="item.id" :item="item" :today="today" /></div>
    </section>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import CalendarEventCard from './CalendarEventCard.vue'
import { calendarDateLabel, calendarItemsOnDay, monthCalendarDays, shiftCalendarMonth } from '@/data/activityCalendar.js'
const props = defineProps({ items: { type: Array, required: true }, today: { type: String, required: true }, anchorDate: { type: String, required: true }, loading: Boolean, error: Boolean })
defineEmits(['select-date'])
const weekdays = ['一', '二', '三', '四', '五', '六', '日']
const monthLabel = computed(() => calendarDateLabel(props.anchorDate, { year: 'numeric', month: 'long' }))
const days = computed(() => monthCalendarDays(props.items, props.anchorDate).map(day => {
  const label = [calendarDateLabel(day.date, { year: 'numeric', month: 'long', day: 'numeric' })]
  label.push(props.loading ? '活动读取中' : props.error ? '活动读取失败' : `${day.items.length}项活动`)
  if (day.date === props.today) label.push('今天')
  if (day.date === props.anchorDate) label.push('已选中')
  return { ...day, label: label.join('，') }
}))
const selectedItems = computed(() => calendarItemsOnDay(props.items, props.anchorDate))
</script>
