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
      <span class="go">查看作业 <b aria-hidden="true">→</b></span>
    </footer>
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
.work {
  min-width: 0;
  min-height: 286px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0;
  padding: 22px 24px 20px;
  border-radius: 18px;
  background: linear-gradient(160deg, var(--surface) 0%, var(--surface) 72%, var(--cream) 100%);
}
.work-card-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.work .rank { display: inline-flex; align-items: baseline; gap: 5px; color: var(--yellow-deep); font-size: 24px; }
.work .rank small { color: var(--ink-35); font-size: 9px; letter-spacing: .12em; text-transform: uppercase; }
.status { border: 1px solid currentColor; background: transparent; }
.status-exact { color: #47704b; }
.status-partial { color: var(--accent-strong); }
.status-unsupported { color: var(--rouge); }
.work-card-main { flex: 1; padding: 23px 0 20px; }
.w-tags { align-items: center; margin-bottom: 12px; }
.work-id { color: var(--ink-35); font: 800 10px var(--font-d); letter-spacing: .08em; }
.work h3 { max-width: 19em; font-size: clamp(20px, 2vw, 26px); line-height: 1.4; }
.stage-line { display: flex; align-items: baseline; gap: 10px; margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--line); }
.stage-line span { flex: none; color: var(--ink-35); font-size: 11px; font-weight: 800; letter-spacing: .12em; }
.stage-line strong { min-width: 0; color: var(--ink-60); font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
.work-card-foot { padding-top: 16px; border-top: 1px solid var(--line); }
.w-meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; }
.w-meta span { display: grid; gap: 4px; padding: 0 12px; border-left: 1px solid var(--line); }
.w-meta span:first-child { padding-left: 0; border-left: 0; }
.w-meta small { color: var(--ink-35); font-size: 10px; font-weight: 700; letter-spacing: .08em; }
.w-meta b { font-size: 16px; }
.work-byline { display: grid; gap: 5px; margin-top: 17px; color: var(--ink-60); font-size: 11px; line-height: 1.5; overflow-wrap: anywhere; }
.go { display: inline-flex; align-items: center; gap: 8px; margin-top: 16px; color: var(--accent-strong); font-size: 12px; font-weight: 800; letter-spacing: .06em; }
.go b { transition: transform .3s var(--ease); }
.work:hover .go b { transform: translateX(4px); }
@media (max-width: 767px) {
  .work { min-height: 0; padding: 18px; }
  .work-card-main { padding-block: 18px; }
  .work h3 { font-size: 21px; }
}
@media (prefers-reduced-motion: reduce) { .go b { transition: none; } }
</style>
