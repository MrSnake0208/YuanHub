<template>
  <section class="calendar-panel calendar-section" aria-label="原始提交资料">
    <h3>原始提交资料（只读）</h3>
    <div class="calendar-badges"><span class="calendar-game">{{ suggestion.original.game }}</span><span class="calendar-category">{{ CALENDAR_CATEGORIES[suggestion.original.category] }}</span><span class="calendar-state">{{ SUGGESTION_STATUSES[suggestion.status] }}</span></div>
    <h4>{{ suggestion.original.title }}</h4>
    <p class="calendar-range">{{ calendarRangeLabel(suggestion.original) }} · Asia/Shanghai</p>
    <p v-if="suggestion.original.description" class="calendar-description">{{ suggestion.original.description }}</p>
    <a v-if="sourceUrl" class="calendar-source-link" :href="sourceUrl" target="_blank" rel="noopener noreferrer">查看原始来源 ↗</a>
    <p class="calendar-hint">提交时间：{{ suggestionTimestamp(suggestion.created_at) }}<br>建议编号：{{ suggestion.id }}</p>
    <div v-if="suggestion.submission_note"><h4>私人补充说明</h4><p class="calendar-description">{{ suggestion.submission_note }}</p><p class="calendar-hint">仅提交人与审核员可见，不会自动进入公开说明。</p></div>
  </section>
</template>
<script setup>
import { computed } from 'vue'
import { CALENDAR_CATEGORIES, calendarRangeLabel, safeCalendarUrl } from '@/data/activityCalendar.js'
import { SUGGESTION_STATUSES, suggestionTimestamp } from '@/data/activityCalendarSuggestions.js'
const props = defineProps({ suggestion: { type: Object, required: true } })
const sourceUrl = computed(() => safeCalendarUrl(props.suggestion.original.source_url))
</script>
