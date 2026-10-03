<template>
  <section class="calendar-panel calendar-section" aria-label="审核结果">
    <h3>审核结果：{{ SUGGESTION_STATUSES[suggestion.status] }}</h3>
    <p v-if="suggestion.status === 'PENDING'">资料已提交，等待审核。提交后不能修改或撤回。</p>
    <template v-else>
      <p>处理时间：{{ suggestionTimestamp(suggestion.reviewed_at) }}</p>
      <p class="calendar-description">审核说明：{{ suggestion.review_note || '无补充说明。' }}</p>
      <p v-if="suggestion.status === 'REJECTED'">请按审核说明补充资料后重新提交。</p>
      <template v-if="snapshot">
        <h4>采纳时的活动资料</h4><p>{{ snapshot.title }} · {{ snapshot.game }} · {{ CALENDAR_CATEGORIES[snapshot.category] }}</p>
        <p class="calendar-range">{{ calendarRangeLabel(snapshot) }}</p><p v-if="snapshot.description" class="calendar-description">{{ snapshot.description }}</p>
        <a v-if="safeCalendarUrl(snapshot.source_url)" class="calendar-source-link" :href="safeCalendarUrl(snapshot.source_url)" target="_blank" rel="noopener noreferrer">采纳时的来源 ↗</a>
      </template>
      <template v-if="suggestion.status === 'ACCEPTED'">
        <p role="status">{{ suggestion.current_event ? suggestion.current_event.enabled ? '已采纳，活动当前已启用。' : '已采纳，活动当前已停用。' : '已采纳，当前活动信息暂不可用。' }}</p>
        <template v-if="suggestion.current_event?.item"><h4>当前活动</h4><p>{{ suggestion.current_event.item.title }}</p><p class="calendar-range">{{ calendarRangeLabel(suggestion.current_event.item) }}</p><router-link v-if="suggestion.current_event.enabled" class="calendar-source-link" :to="suggestionEventLink(suggestion.current_event.item)">在日历中查看活动</router-link></template>
      </template>
    </template>
  </section>
</template>
<script setup>
import { computed } from 'vue'
import { CALENDAR_CATEGORIES, calendarRangeLabel, safeCalendarUrl } from '@/data/activityCalendar.js'
import { SUGGESTION_STATUSES, suggestionEventLink, suggestionTimestamp } from '@/data/activityCalendarSuggestions.js'
const props = defineProps({ suggestion: { type: Object, required: true } })
const snapshot = computed(() => props.suggestion.accepted_snapshot)
</script>
