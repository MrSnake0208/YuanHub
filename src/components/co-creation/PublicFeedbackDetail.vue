<template>
  <div class="public-detail">
    <div v-if="loading" class="public-detail-state" role="status">正在加载详情…</div>
    <div v-else-if="error" class="public-detail-state error" role="alert">{{ error }}</div>

    <template v-else-if="item">
      <div class="public-detail-badges">
        <FeedbackTypeBadge :type="item.type" />
        <FeedbackStatusBadge :status="item.publicStatus" />
      </div>

      <h1 class="public-detail-title">{{ item.publicTitle || '未命名反馈' }}</h1>

      <div class="public-detail-actions">
        <FeedbackSupportButton
          :id="item.id"
          :type="item.type"
          :supported="item.supportedByCurrentUser"
          :support-count="item.supportCount"
          @updated="$emit('updated', $event)"
        />
        <span class="public-detail-support-count">{{ item.supportCount }} 人支持</span>
      </div>

      <section class="public-detail-section">
        <h3>公开说明</h3>
        <p>{{ item.publicSummary || '开发者暂未补充公开说明。' }}</p>
      </section>

      <section v-if="item.mergedInto" class="public-detail-merged" role="status">
        <strong>该反馈已经合并至主反馈</strong>
        <p>此问题将统一在主反馈中跟踪。</p>
        <a :href="'/co-creation?feedback=' + encodeURIComponent(item.mergedInto.id)">查看主反馈：{{ item.mergedInto.publicTitle }}</a>
      </section>

      <section v-if="item.publicStatus === 'COMPLETED' && (item.completedVersionLabel || item.completedAt)" class="public-detail-done" role="status">
        <CheckCircle2 :size="18" aria-hidden="true" />
        <span v-if="item.completedVersionLabel">已在 {{ item.completedVersionLabel }} 上线</span>
        <span v-else>已于 {{ formatDate(item.completedAt) }} 标记为完成。</span>
      </section>

      <section v-if="item.targetVersionLabel || item.completedVersionLabel" class="public-detail-section">
        <h3>版本</h3>
        <ul class="public-detail-versions">
          <li v-if="item.targetVersionLabel"><span>目标版本</span><strong>{{ item.targetVersionLabel }}</strong></li>
          <li v-if="item.completedVersionLabel"><span>完成版本</span><strong>{{ item.completedVersionLabel }}</strong></li>
        </ul>
      </section>

      <footer class="public-detail-foot">
        <span>最近更新 {{ formatDate(item.publicUpdatedAt || item.publishedAt) }}</span>
      </footer>
    </template>
  </div>
</template>

<script setup>
import { CheckCircle2 } from '@lucide/vue'
import FeedbackStatusBadge from '@/components/feedback/FeedbackStatusBadge.vue'
import FeedbackTypeBadge from '@/components/feedback/FeedbackTypeBadge.vue'
import FeedbackSupportButton from '@/components/co-creation/FeedbackSupportButton.vue'

defineProps({
  item: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  formatDate: { type: Function, required: true }
})

defineEmits(['updated'])
</script>

<style scoped>
.public-detail { display: grid; gap: 14px; }
.public-detail-state { padding: 18px 0; color: var(--feedback-text-muted); font-size: 13px; }
.public-detail-state.error { color: var(--feedback-danger); }
.public-detail-badges { display: flex; flex-wrap: wrap; gap: 8px; }
.public-detail-title { color: var(--feedback-text); font-family: var(--font-s); font-size: 24px; font-weight: 900; line-height: 1.35; }
.public-detail-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.public-detail-support-count { color: var(--feedback-text-muted); font: 12px var(--font-d); }
.public-detail-section { padding-top: 12px; border-top: 1px solid var(--feedback-line); }
.public-detail-section h3 { margin-bottom: 8px; color: var(--feedback-text); font-size: 12px; font-weight: 900; }
.public-detail-section p { color: var(--feedback-text-muted); font-size: 13px; line-height: 1.8; white-space: pre-wrap; }
.public-detail-merged { padding: 12px 14px; border: 1px dashed var(--yellow-deep); border-radius: 7px; background: rgba(239, 210, 142, .2); color: var(--feedback-text); }
.public-detail-merged strong { font-size: 13px; }
.public-detail-merged p { margin-top: 4px; color: var(--feedback-text-muted); font-size: 12px; }
.public-detail-merged a { display: inline-block; margin-top: 6px; color: var(--accent-strong); font-size: 12px; font-weight: 800; }
.public-detail-versions { display: grid; gap: 6px; list-style: none; }
.public-detail-versions li { display: inline-flex; align-items: baseline; gap: 8px; }
.public-detail-versions span { color: var(--feedback-text-dim); font-size: 10.5px; font-weight: 800; }
.public-detail-versions strong { color: var(--feedback-text); font: 12px var(--font-d); font-weight: 700; }
.public-detail-done { display: inline-flex; align-items: center; gap: 8px; color: var(--feedback-success); font-size: 12.5px; font-weight: 800; }
.public-detail-foot { color: var(--feedback-text-dim); font: 10.5px var(--font-d); }
</style>
