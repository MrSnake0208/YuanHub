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
          <button class="feedback-button" type="button" @click="$emit('view', item)">查看详情</button>
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

defineEmits(['support', 'view', 'error'])
</script>

<style scoped>
.similar-list { display: grid; gap: 10px; padding: 12px 14px; border: 1px dashed var(--yellow-deep); border-radius: 8px; background: rgba(239, 210, 142, .16); }
.similar-title { color: var(--ink); font-size: 12px; font-weight: 900; }
.similar-state { color: var(--ink-60); font-size: 12px; }
.similar-list ul { display: grid; gap: 9px; list-style: none; }
.similar-list li { display: grid; gap: 9px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); }
.similar-main { min-width: 0; display: grid; gap: 5px; }
.similar-main strong { overflow: hidden; color: var(--ink); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.similar-meta { display: inline-flex; align-items: center; gap: 8px; color: var(--ink-60); font: 11px var(--font-d); }
.similar-actions { display: flex; flex-wrap: wrap; gap: 8px; }
@media (min-width: 640px) {
  .similar-list li { grid-template-columns: minmax(0, 1fr) auto; align-items: center; }
}
</style>
