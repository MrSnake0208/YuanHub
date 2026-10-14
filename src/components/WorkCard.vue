<template>
  <router-link :to="{ path: '/work/' + work.id, query: { page } }" class="work has-detail">
    <header class="work-card-head">
      <span class="rank"><small>No.</small>{{ rank }}</span>
      <span class="tg status" :class="'status-' + work.conversion_status">{{ status.label }}</span>
    </header>

    <div class="work-card-main">
      <div class="w-tags">
        <span class="tg cat">{{ work.game || '游戏未提供' }}</span>
        <span class="work-id">WORK #{{ work.id }}</span>
      </div>
      <h3>{{ work.title || '未命名作业' }}</h3>
      <div class="stage-line">
        <span>关卡</span>
        <strong>{{ stageName }}</strong>
      </div>
    </div>

    <footer class="work-card-foot">
      <div class="w-meta">
        <span><small>浏览</small><b>{{ work.views }}</b></span>
        <span><small>热度</small><b>{{ formatMetric(work.hot_score) }}</b></span>
        <span><small>问题</small><b>{{ work.issue_count }}</b></span>
      </div>
      <div class="work-byline">
        <span>上传者 {{ work.uploader_id || '未提供' }}</span>
        <time :datetime="work.upload_time || undefined">{{ formatDate(work.upload_time) }}</time>
      </div>
      <span class="go">查看作业 <b aria-hidden="true"><ArrowRight :size="16" aria-hidden="true" /></b></span>
    </footer>
  </router-link>
</template>

<script setup>
import { ArrowRight } from '@lucide/vue'
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
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.work {
  border-radius: 18px;
  background: linear-gradient(160deg, var(--surface) 0%, var(--surface) 72%, var(--cream) 100%);
}
.work .rank { color: var(--yellow-deep); }
.work .rank small { color: var(--ink-35); }
.status { border: 1px solid currentColor; background: transparent; }
.status-exact { color: #47704b; }
.status-partial { color: var(--accent-strong); }
.status-unsupported { color: var(--rouge); }
.work-id { color: var(--ink-35); }
.stage-line { border-top: 1px solid var(--line); }
.stage-line span { color: var(--ink-35); }
.stage-line strong { color: var(--ink-60); }
.work-card-foot { border-top: 1px solid var(--line); }
.w-meta span { border-left: 1px solid var(--line); }
.w-meta span:first-child { border-left: 0; }
.w-meta small { color: var(--ink-35); }
.work-byline { color: var(--ink-60); }
.go { color: var(--accent-strong); }
.go b { transition: transform .3s var(--ease); }
@media (prefers-reduced-motion: reduce) { .go b { transition: none; } }
</style>
<style scoped src="./workCardDesktop.css"></style>
<style scoped src="./workCardMobile.css"></style>
