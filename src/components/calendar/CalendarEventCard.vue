<template>
  <article class="calendar-event" :class="{ 'is-ending': ending }">
    <div class="calendar-event-heading">
      <div class="calendar-event-identity">
        <div class="calendar-badges"><span class="calendar-game">{{ item.game }}</span><span class="calendar-category">{{ CALENDAR_CATEGORIES[item.category] }}</span></div>
        <h4>{{ item.title }}</h4>
      </div>
      <div class="calendar-event-status">
        <span v-for="status in statuses" :key="status" class="calendar-state">{{ status }}</span>
        <strong v-if="deadline" class="calendar-deadline">{{ deadline }}</strong>
      </div>
    </div>
    <p class="calendar-range"><Clock3 :size="15" aria-hidden="true" /> {{ calendarRangeLabel(item) }}<span v-if="item.start_time"> · {{ item.time_zone }}</span></p>
    <p v-if="item.description" class="calendar-description">{{ item.description }}</p>
    <div class="calendar-event-foot">
      <span class="calendar-hint">{{ item.source_type === 'RECRUITMENT_POOL' ? '来自招募卡池' : '手工整理' }}</span>
      <a v-if="item.source_url" :href="item.source_url" target="_blank" rel="noopener noreferrer">查看来源 <ExternalLink :size="15" aria-hidden="true" /></a>
    </div>
  </article>
</template>

<script setup>
import { computed } from 'vue'
import { Clock3, ExternalLink } from '@lucide/vue'
import { addCalendarDays, CALENDAR_CATEGORIES, calendarDeadline, calendarRangeLabel, calendarStatuses } from '@/data/activityCalendar.js'
const props = defineProps({ item: { type: Object, required: true }, today: { type: String, required: true } })
const statuses = computed(() => calendarStatuses(props.item, props.today))
const deadline = computed(() => calendarDeadline(props.item, props.today))
const ending = computed(() => props.item.start_date <= props.today && props.item.end_date >= props.today && props.item.end_date <= addCalendarDays(props.today, 2))
</script>
