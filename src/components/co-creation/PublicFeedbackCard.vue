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
      <span v-if="item.categoryLabel" class="public-card-category">{{ item.categoryLabel }}</span>
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
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.public-card {
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
.public-card-category { border: 1px solid var(--brand-blue); border-radius: 5px; color: var(--ink); }
.public-card-title { color: var(--feedback-text); }
.public-card-summary {
  color: var(--feedback-text-muted);
}
.public-card-version { color: var(--feedback-text-dim); }
.public-card-support { color: var(--rouge); }
.public-card-foot time { color: var(--feedback-text-dim); }
</style>
<style scoped src="./publicFeedbackCardDesktop.css"></style>
<style scoped src="./publicFeedbackCardMobile.css"></style>
