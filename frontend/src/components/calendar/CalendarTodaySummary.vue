<template>
  <section class="calendar-today" aria-labelledby="today-summary-title">
    <div class="calendar-summary-heading">
      <Sun :size="20" aria-hidden="true" />
      <h2 id="today-summary-title">今天 · <time :datetime="today">{{ calendarDateLabel(today, { month: 'long', day: 'numeric' }) }} {{ calendarDateLabel(today, { weekday: 'short' }) }}</time></h2>
    </div>
    <p v-if="loading" class="calendar-hint" role="status">正在读取今日摘要…</p>
    <p v-else-if="error" class="calendar-hint">今日摘要暂时无法读取</p>
    <p v-else-if="!counts.total" class="calendar-hint">当前游戏、类型及招募条件下暂无公开活动</p>
    <div v-else class="calendar-counts">
      <p>今日开始 <strong>{{ counts.starts }}</strong></p>
      <p>今日结束 <strong>{{ counts.ends }}</strong></p>
      <p>进行中 <strong>{{ counts.ongoing }}</strong></p>
    </div>
    <details class="calendar-summary-help">
      <summary>公开统计口径</summary>
      <p class="calendar-hint calendar-summary-scope">以上为当前游戏、类型及招募条件的公开日历日统计；不按时间状态或完成情况筛选，不是个人订阅数。</p>
    </details>
  </section>
</template>

<script setup>
import { Sun } from '@lucide/vue'
import { calendarDateLabel } from '@/data/activityCalendar.js'
defineProps({ today: { type: String, required: true }, counts: { type: Object, required: true }, loading: Boolean, error: String })
</script>
