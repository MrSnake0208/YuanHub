<template>
  <section class="calendar-today" aria-labelledby="today-summary-title">
    <div class="calendar-summary-heading">
      <Sun :size="20" aria-hidden="true" />
      <h2 id="today-summary-title">今天 <time :datetime="today">{{ calendarDateLabel(today) }}</time></h2>
    </div>
    <p v-if="loading" class="calendar-hint" role="status">正在读取今日摘要…</p>
    <p v-else-if="error" class="calendar-hint">今日摘要暂时无法读取</p>
    <template v-else>
      <div class="calendar-counts">
        <p><strong>{{ counts.starts }}</strong> 今日开始</p>
        <p><strong>{{ counts.ends }}</strong> 今日结束</p>
        <p><strong>{{ counts.ongoing }}</strong> 今日进行中</p>
      </div>
      <p v-if="!counts.total" class="calendar-hint">当前筛选下，今天暂无活动。可以看看接下来的日程。</p>
    </template>
  </section>
</template>

<script setup>
import { Sun } from '@lucide/vue'
import { calendarDateLabel } from '@/data/activityCalendar.js'
defineProps({ today: { type: String, required: true }, counts: { type: Object, required: true }, loading: Boolean, error: String })
</script>
