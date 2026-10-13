<template>
  <article class="calendar-event" :class="{ 'is-ending': ending }" :style="display.style" :data-type-color="display.color" :data-event-id="item.id">
    <div class="calendar-event-heading">
      <div class="calendar-event-identity">
        <div class="calendar-badges"><span class="calendar-game">{{ item.game }}</span><span class="calendar-category">{{ display.path }}</span></div>
        <h4 tabindex="-1">{{ item.title }}</h4>
        <p v-if="item.source_type === 'RECRUITMENT_POOL' && item.category === 'RECRUITMENT' && item.up_agent_names?.length" class="calendar-description calendar-up-agents">UP 密探：{{ item.up_agent_names.join('、') }}</p>
      </div>
      <div class="calendar-event-status">
        <span v-for="status in statuses" :key="status" class="calendar-state">{{ status }}</span>
        <strong v-if="deadline" class="calendar-deadline">{{ deadline }}</strong>
      </div>
    </div>
    <p class="calendar-range"><Clock3 :size="15" aria-hidden="true" /> {{ calendarRangeLabel(item) }}<span v-if="item.start_time && !privateItem"> · {{ item.time_zone }}</span></p>
    <p v-if="!privateItem && !item.end_time" class="calendar-hint">具体时间未提供</p>
    <p v-if="item.description" class="calendar-description">{{ item.description }}</p>
    <p v-if="display.association" class="calendar-hint calendar-association">{{ display.association }}</p>
    <div class="calendar-event-foot">
      <span class="calendar-hint">{{ privateItem ? '仅自己可见' : item.source_type === 'RECRUITMENT_POOL' ? '来自招募卡池' : '手工整理' }}</span>
      <a v-if="item.source_url" :href="item.source_url" target="_blank" rel="noopener noreferrer">查看来源 <ExternalLink :size="15" aria-hidden="true" /></a>
    </div>
    <div v-if="privateItem && privateContext" class="calendar-private-actions">
      <button type="button" :disabled="!!privateContext.busyId.value" @click="privateContext.open(item)">编辑事项</button>
      <button type="button" :disabled="!!privateContext.busyId.value" @click="privateContext.remove(item)">{{ privateContext.busyId.value === item.id ? '处理中…' : '删除事项' }}</button>
    </div>
    <CalendarSubscriptionControls v-else-if="!privateItem" :key="item.id" :item="item" />
  </article>
</template>

<script setup>
import { computed, inject } from 'vue'
import CalendarSubscriptionControls from './CalendarSubscriptionControls.vue'
import { CALENDAR_SUBSCRIPTIONS } from '@/data/activityCalendarSubscriptions.js'
import { CALENDAR_PRIVATE_ITEMS, isPrivateCalendarItem } from '@/data/calendarPrivateItems.js'
import { Clock3, ExternalLink } from '@lucide/vue'
import { addCalendarDays, calendarDeadline, calendarRangeLabel, calendarStatuses } from '@/data/activityCalendar.js'
import { calendarDisplay } from '@/data/activityCalendarTypes.js'
const props = defineProps({ item: { type: Object, required: true }, today: { type: String, required: true } })
const context = inject(CALENDAR_SUBSCRIPTIONS, null)
const privateContext = inject(CALENDAR_PRIVATE_ITEMS, null)
const privateItem = computed(() => isPrivateCalendarItem(props.item))
const display = computed(() => calendarDisplay(props.item))
const statuses = computed(() => calendarStatuses(props.item, props.today, context?.now.value))
const deadline = computed(() => calendarDeadline(props.item, props.today, context?.now.value))
const ending = computed(() => !privateItem.value && props.item.start_date <= props.today && props.item.end_date >= props.today && props.item.end_date <= addCalendarDays(props.today, 2))
</script>
