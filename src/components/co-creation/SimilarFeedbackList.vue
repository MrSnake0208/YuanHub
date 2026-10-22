<template>
  <div v-if="loading || (items && items.length)" class="similar-list" aria-label="可能已有人反馈">
    <p class="similar-title">可能已经有人反馈：</p>
    <div v-if="loading" class="similar-state" role="status">正在查找相似反馈…</div>
    <ul v-else>
      <li v-for="item in items" :key="item.id">
        <div class="similar-main">
          <strong>{{ item.publicTitle || '未命名反馈' }}</strong>
          <span class="similar-meta">
            <FeedbackStatusBadge :status="item.publicStatus" />
            <span>{{ item.supportCount }} 人支持</span>
          </span>
        </div>
        <div class="similar-actions">
          <FeedbackSupportButton
            :id="item.id"
            :type="item.type"
            :supported="item.supportedByCurrentUser"
            :support-count="item.supportCount"
            :show-count="false"
            @updated="$emit('support', $event)"
            @error="$emit('error', $event)"
          />
          <a class="feedback-button" :href="'/feedback/plaza?feedback=' + encodeURIComponent(item.id)" target="_blank" rel="noopener noreferrer">查看详情（新标签页）</a>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup>
import FeedbackStatusBadge from '@/components/feedback/FeedbackStatusBadge.vue'
import FeedbackSupportButton from '@/components/co-creation/FeedbackSupportButton.vue'

defineProps({
  items: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false }
})

defineEmits(['support', 'error'])
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.similar-list { border: 1px dashed var(--yellow-deep); border-radius: 8px; background: var(--theme-wash-strong, rgba(239, 210, 142, .16)); }
.similar-title { color: var(--ink); }
.similar-state { color: var(--ink-60); }
.similar-list li { border: 1px solid var(--line); border-radius: 7px; background: var(--surface); }
.similar-main strong { color: var(--ink); }
.similar-meta { color: var(--ink-60); }
</style>
<style scoped src="./similarFeedbackListDesktop.css"></style>
<style scoped src="./similarFeedbackListMobile.css"></style>
