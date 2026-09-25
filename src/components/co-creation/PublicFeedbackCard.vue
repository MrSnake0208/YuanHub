<template>
  <article
    class="public-card"
    tabindex="0"
    role="button"
    :aria-label="'查看反馈：' + (item.publicTitle || '未命名反馈')"
    @click="$emit('open', item)"
    @keydown.enter="$emit('open', item)"
    @keydown.space.prevent="$emit('open', item)"
  >
    <header class="public-card-badges">
      <FeedbackTypeBadge :type="item.type" />
      <FeedbackStatusBadge :status="item.publicStatus" />
    </header>
    <h3 class="public-card-title">{{ item.publicTitle || '未命名反馈' }}</h3>
    <p v-if="item.publicSummary" class="public-card-summary">{{ item.publicSummary }}</p>
    <p v-if="showVersion && item.targetVersionLabel" class="public-card-version">目标版本：{{ item.targetVersionLabel }}</p>
    <footer class="public-card-foot">
      <FeedbackSupportButton
        v-if="showSupport"
        class="public-card-support-button"
        :id="item.id"
        :type="item.type"
        :supported="item.supportedByCurrentUser"
        :support-count="item.supportCount"
        @click.stop
        @updated="$emit('updated', $event)"
      />
      <span v-else class="public-card-support">
        <Heart :size="14" aria-hidden="true" />
        {{ item.supportCount }} 人支持
      </span>
      <time :datetime="item.publicUpdatedAt || item.publishedAt">更新于 {{ formatDate(item.publicUpdatedAt || item.publishedAt) }}</time>
    </footer>
  </article>
</template>

<script setup>
import { Heart } from '@lucide/vue'
import FeedbackStatusBadge from '@/components/feedback/FeedbackStatusBadge.vue'
import FeedbackTypeBadge from '@/components/feedback/FeedbackTypeBadge.vue'
import FeedbackSupportButton from '@/components/co-creation/FeedbackSupportButton.vue'

defineProps({
  item: { type: Object, required: true },
  formatDate: { type: Function, required: true },
  showSupport: { type: Boolean, default: false },
  showVersion: { type: Boolean, default: false }
})

defineEmits(['open', 'updated'])
</script>

<style scoped>
.public-card {
  min-width: 0;
  display: grid;
  gap: 10px;
  padding: 16px;
  border: 1px solid var(--feedback-line);
  border-radius: 8px;
  background: var(--feedback-panel);
  box-shadow: 0 16px 36px -34px rgba(73, 59, 44, .42);
  cursor: pointer;
  outline: 0;
  transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease;
}
.public-card:hover,
.public-card:focus-visible { border-color: var(--accent); box-shadow: inset 3px 0 var(--yellow-deep); }
.public-card-badges { display: flex; flex-wrap: wrap; gap: 7px; }
.public-card-title { color: var(--feedback-text); font-size: 15px; font-weight: 900; line-height: 1.5; }
.public-card-summary {
  display: -webkit-box;
  overflow: hidden;
  color: var(--feedback-text-muted);
  font-size: 12.5px;
  line-height: 1.7;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}
.public-card-version { color: var(--feedback-text-dim); font: 11px var(--font-d); }
.public-card-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 2px; }
.public-card-support { display: inline-flex; align-items: center; gap: 5px; color: var(--rouge); font-size: 12px; font-weight: 800; }
.public-card-support-button { flex: none; }
.public-card-foot time { color: var(--feedback-text-dim); font: 10.5px var(--font-d); }
</style>
