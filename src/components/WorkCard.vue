<template>
  <router-link :to="{ path: '/work/' + work.id, query: { page } }" class="work has-detail">
    <span class="rank">{{ rank }}</span>
    <div>
      <div class="w-tags">
        <span class="tg cat">{{ work.game || '游戏未提供' }}</span>
        <span class="tg site">{{ stageName }}</span>
        <span class="tg" :class="['status', 'status-' + work.conversion_status]">{{ status.label }}</span>
      </div>
      <h3>{{ work.title || '未命名作业' }}<span class="go">查看详情 →</span></h3>
      <p class="ex">上传者：{{ work.uploader_id || '未提供' }} · 上传时间：{{ formatDate(work.upload_time) }}</p>
    </div>
    <div class="w-side">
      <div class="w-meta">
        <span>阅 <b>{{ work.views }}</b></span>
        <span>热度 <b>{{ formatMetric(work.hot_score) }}</b></span>
        <span>兼容问题 <b>{{ work.issue_count }}</b></span>
      </div>
    </div>
  </router-link>
</template>

<script setup>
import { computed } from 'vue'
import { formatDate, formatMetric, statusInfo } from '@/utils/workDisplay.js'

const props = defineProps({
  work: { type: Object, required: true },
  rank: { type: String, required: true },
  page: { type: Number, required: true }
})

const stageName = computed(function () {
  return (props.work.level && props.work.level.name) || props.work.stage_name || '关卡未提供'
})
const status = computed(function () { return statusInfo(props.work.conversion_status) })
</script>

<style scoped>
.work { grid-template-columns: 64px minmax(0, 1fr) auto; }
.status { border: 1px solid currentColor; background: transparent; }
.status-exact { color: #47704b; }
.status-partial { color: var(--accent-strong); }
.status-unsupported { color: var(--rouge); }
.w-meta { justify-content: flex-end; flex-wrap: wrap; }
@media (max-width: 767px) {
  .work { grid-template-columns: 40px minmax(0, 1fr); }
  .w-side { grid-column: 1 / -1; }
  .w-meta { justify-content: flex-start; }
}
</style>
