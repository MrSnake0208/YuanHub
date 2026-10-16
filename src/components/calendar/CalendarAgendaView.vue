<template>
  <div ref="agenda" class="calendar-agenda" aria-label="活动日程">
    <section v-for="section in sections" :key="section.key" class="calendar-section" :class="{ 'calendar-personal-today': personal && section.key === 'today' }" :aria-labelledby="'section-' + section.key">
      <h2 :id="'section-' + section.key">{{ section.title }}<time v-if="personal && section.key === 'today'" :datetime="today">{{ calendarDateLabel(today) }}</time><span>{{ section.count }} 项</span></h2>
      <p v-if="personal && section.key === 'today' && !section.count" class="calendar-hint">今天暂无个人事项</p>
      <div v-for="group in section.groups" :key="group.date" class="calendar-date-group" :data-date="group.date" :class="{ 'is-anchor': group.date === anchorDate }">
        <h3 v-if="!personal || group.date !== today"><time :datetime="group.date">{{ calendarDateLabel(group.date) }}</time><span v-if="group.date === today">TODAY</span></h3>
        <div class="calendar-event-list"><CalendarEventCard v-for="item in group.items" :key="item.id" :item="item" :today="today" :personal="personal" :heading-tag="personal && group.date === today ? 'h3' : 'h4'" /></div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import CalendarEventCard from './CalendarEventCard.vue'
import { calendarDateLabel, groupCalendarItems } from '@/data/activityCalendar.js'
const props = defineProps({ items: { type: Array, required: true }, today: { type: String, required: true }, anchorDate: { type: String, required: true }, locateRequest: Number, loading: Boolean, error: Boolean, personal: Boolean })
const agenda = ref(null)
const sections = computed(() => groupCalendarItems(props.items, props.today).filter(section => section.groups.length || props.personal && props.items.length && section.key === 'today' && !props.loading && !props.error).map(section => ({ ...section, count: section.groups.reduce((count, group) => count + group.items.length, 0) })))
function locate() {
  const groups = [...(agenda.value?.querySelectorAll('[data-date]') || [])]
  const target = groups.find(group => group.dataset.date >= props.anchorDate) || groups.at(-1)
  target?.scrollIntoView?.({ block: 'nearest', behavior: 'instant' })
}
onMounted(() => { if (props.anchorDate !== props.today || props.locateRequest) locate() })
watch(() => [props.anchorDate, props.locateRequest], locate, { flush: 'post' })
watch(() => props.loading, loading => { if (!loading && (props.anchorDate !== props.today || props.locateRequest)) locate() }, { flush: 'post' })
</script>
