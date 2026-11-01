<template>
  <article class="calendar-event calendar-public-summary" :class="{ 'is-day-summary': day, 'is-ending': ending }" :style="display.style" :data-event-id="item.id">
    <component :is="headingTag" class="calendar-event-title">
      <button class="calendar-public-summary-open" type="button" :aria-label="`${item.title}，查看详情与订阅`" aria-haspopup="dialog" @click="$emit('open', item.id, $event)">
        <span>{{ item.title }}</span><ChevronRight :size="18" aria-hidden="true" />
      </button>
    </component>
    <div class="calendar-event-status" aria-label="活动时间状态">
      <span v-for="status in statuses" :key="status" class="calendar-state">{{ status }}</span>
      <strong v-if="!day && deadline" class="calendar-deadline">{{ deadline }}</strong>
    </div>
    <p v-if="!day" class="calendar-range"><Clock3 :size="15" aria-hidden="true" />{{ calendarRangeLabel(item) }}<span v-if="item.start_time"> · {{ item.time_zone }}</span></p>
    <div class="calendar-badges"><span class="calendar-game">{{ item.game }}</span><span class="calendar-category">{{ display.path }}</span></div>
    <p v-if="!day && upAgents" class="calendar-description calendar-up-agents">{{ upAgents.full }}</p>
    <p v-if="!day && !item.end_time" class="calendar-hint">具体时间未提供</p>
    <p v-if="subscriptionLabel" class="calendar-public-personal-status" aria-label="个人订阅状态">{{ subscriptionLabel }}</p>
  </article>
</template>

<script setup>
import { computed, inject } from 'vue'
import { ChevronRight, Clock3 } from '@lucide/vue'
import { CALENDAR_SUBSCRIPTIONS, subscriptionCompleted } from '@/data/activityCalendarSubscriptions.js'
import { addCalendarDays, calendarDeadline, calendarRangeLabel, calendarStatuses } from '@/data/activityCalendar.js'
import { calendarDisplay, calendarUpAgentDisplay } from '@/data/activityCalendarTypes.js'

const props = defineProps({ item: { type: Object, required: true }, today: { type: String, required: true }, day: Boolean, headingTag: { type: String, default: 'h4' } })
defineEmits(['open'])
const context = inject(CALENDAR_SUBSCRIPTIONS, null)
const record = computed(() => context?.byId.value[props.item.id])
const subscriptionLabel = computed(() => {
  if (!context?.permitted.value) return ''
  if (context.loading.value) return '订阅状态读取中…'
  if (context.error.value) return '订阅状态暂不可用'
  if (!context.account.value) return '选择账号后可订阅'
  if (props.item.game !== context.account.value.game) return `切换到${props.item.game}账号后可订阅`
  return record.value?.subscribed ? `已订阅 · ${subscriptionCompleted(record.value) ? '本期已完成' : '本期未完成'}` : '未订阅'
})
const display = computed(() => calendarDisplay(props.item))
const upAgents = computed(() => calendarUpAgentDisplay(props.item))
const statuses = computed(() => calendarStatuses(props.item, props.today, context?.now.value))
const deadline = computed(() => calendarDeadline(props.item, props.today, context?.now.value))
const ending = computed(() => props.item.start_date <= props.today && props.item.end_date >= props.today && props.item.end_date <= addCalendarDays(props.today, 2))
</script>
