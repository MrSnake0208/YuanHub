<template>
  <div class="public-detail">
    <div v-if="loading" class="public-detail-state" role="status">正在加载详情…</div>
    <div v-else-if="error" class="public-detail-state error" role="alert">{{ error }}</div>

    <template v-else-if="item">
      <div class="public-detail-badges">
        <span v-if="item.categoryLabel" class="public-detail-category">{{ item.categoryLabel }}</span>
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
        <router-link :to="{ path: '/feedback/plaza', query: { feedback: item.mergedInto.id } }">查看主反馈：{{ item.mergedInto.publicTitle }}</router-link>
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
      <PublicFeedbackManagement ref="management" :id="item.id" :format-date="formatDate" @updated="$emit('updated', $event)" @unpublished="$emit('unpublished', $event)" />
    </template>
  </div>
</template>

<script setup>
import { CheckCircle2 } from '@lucide/vue'
import FeedbackStatusBadge from '@/components/feedback/FeedbackStatusBadge.vue'
import FeedbackSupportButton from '@/components/co-creation/FeedbackSupportButton.vue'
import PublicFeedbackManagement from '@/components/co-creation/PublicFeedbackManagement.vue'
import { ref } from 'vue'

const management = ref(null)
defineExpose({ confirmClose: () => management.value?.confirmClose() ?? true })

defineProps({
  item: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  formatDate: { type: Function, required: true }
})

defineEmits(['updated', 'unpublished'])
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.public-detail-state { color: var(--feedback-text-muted); }
.public-detail-state.error { color: var(--feedback-danger); }
.public-detail-category { border: 1px solid var(--brand-blue); border-radius: 5px; color: var(--ink); }
.public-detail-title { color: var(--feedback-text); }
.public-detail-support-count { color: var(--feedback-text-muted); }
.public-detail-section { border-top: 1px solid var(--feedback-line); }
.public-detail-section h3 { color: var(--feedback-text); }
.public-detail-section p { color: var(--feedback-text-muted); }
.public-detail-merged { border: 1px dashed var(--yellow-deep); border-radius: 7px; background: var(--theme-wash-strong, rgba(239, 210, 142, .2)); color: var(--feedback-text); }
.public-detail-merged p { color: var(--feedback-text-muted); }
.public-detail-merged a { color: var(--theme-accent-text, var(--accent-strong)); }
.public-detail-versions span { color: var(--feedback-text-dim); }
.public-detail-versions strong { color: var(--feedback-text); }
.public-detail-done { color: var(--feedback-success); }
.public-detail-foot { color: var(--feedback-text-dim); }
</style>
<style scoped src="./publicFeedbackDetailDesktop.css"></style>
<style scoped src="./publicFeedbackDetailMobile.css"></style>
