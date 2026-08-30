<template>
  <div class="feedback-ticket-detail">
    <div v-if="loading" class="detail-state" role="status">正在加载详情…</div>
    <div v-else-if="error" class="detail-state error" role="alert">{{ error }}</div>

    <div v-if="showReporter" class="detail-reporter">
      <span>提交人</span>
      <strong>{{ item.reporterName || item.reporter?.userName || '未知用户' }}</strong>
      <code>{{ item.reporter?.id || item.reporterUserId || '' }}</code>
    </div>

    <section class="detail-section">
      <h3>反馈内容</h3>
      <p class="detail-content">{{ item.content }}</p>
    </section>

    <section v-if="item.messages && item.messages.length" class="detail-section conversation-section">
      <h3>对话记录 <span>{{ item.messages.length }}</span></h3>
      <article v-for="msg in item.messages" :key="msg.id" class="detail-message" :class="{ 'is-admin': msg.isAdmin }">
        <header>
          <strong>{{ msg.isAdmin ? '管理员' : reporterLabel }}</strong>
          <time :datetime="msg.createdAt">{{ formatDate(msg.createdAt) }}</time>
        </header>
        <p>{{ msg.content }}</p>
        <div v-if="msg.images && msg.images.length" class="detail-media-grid">
          <a v-for="image in msg.images" :key="image.id" :href="image.url" target="_blank" rel="noopener noreferrer">
            <img :src="image.url" :alt="'反馈附件 ' + image.id" loading="lazy" />
          </a>
        </div>
      </article>
    </section>

    <div class="detail-action-area">
      <slot name="actions" :item="item" />
      <slot name="composer" :item="item" />
    </div>
  </div>
</template>

<script setup>
defineProps({
  item: { type: Object, required: true },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  showReporter: { type: Boolean, default: false },
  reporterLabel: { type: String, default: '我' },
  formatDate: { type: Function, required: true }
})
</script>

<style scoped>
.detail-state { padding: 18px 0; color: var(--ink-60); font-size: 13px; }
.detail-state.error { color: var(--rouge); }
.detail-reporter { display: flex; align-items: baseline; gap: 8px; padding: 16px 0 12px; border-bottom: 1px solid var(--line); font-size: 12px; }
.detail-reporter span,.detail-reporter code { color: var(--ink-35); }
.detail-reporter strong { color: var(--ink); }
.detail-reporter code { margin-left: auto; }
.detail-section { padding: 18px 0; border-bottom: 1px solid var(--line); }
.detail-section h3 { margin-bottom: 10px; color: var(--ink); font-size: 13px; font-weight: 900; }
.detail-section h3 span { margin-left: 5px; color: var(--ink-35); font-size: 11px; }
.detail-content,.detail-message p { color: var(--ink); font-size: 13.5px; line-height: 1.75; white-space: pre-wrap; }
.conversation-section { display: grid; gap: 9px; }
.conversation-section h3 { margin-bottom: 1px; }
.detail-message { padding: 12px 14px; border: 1px solid var(--line); border-radius: 7px; background: var(--paper); }
.detail-message.is-admin { border-left: 3px solid var(--yellow-deep); background: rgba(239, 210, 142, .13); }
.detail-message header { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 7px; }
.detail-message header strong { color: var(--ink); font-size: 11.5px; }
.detail-message header time { color: var(--ink-35); font: 10.5px var(--font-d); }
.detail-media-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
.detail-media-grid a { overflow: hidden; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); aspect-ratio: 4 / 3; }
.detail-media-grid img { width: 100%; height: 100%; display: block; object-fit: cover; }
.detail-action-area { position: sticky; bottom: -20px; margin: 0 -20px -20px; padding: 14px 20px 20px; background: rgba(255, 248, 236, .96); border-top: 1px solid var(--line); backdrop-filter: blur(10px); }

@media (max-width: 767px) {
  .detail-reporter { align-items: flex-start; flex-wrap: wrap; }
  .detail-reporter code { width: 100%; margin-left: 0; overflow-wrap: anywhere; }
  .detail-media-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .detail-action-area { bottom: calc(-24px - env(safe-area-inset-bottom)); margin: 0 -16px calc(-24px - env(safe-area-inset-bottom)); padding: 14px 16px calc(18px + env(safe-area-inset-bottom)); }
}
</style>
