<template>
  <div class="ticket-workspace" :class="{ 'has-selection': selectedItem }">
    <section class="ticket-list-panel" aria-label="反馈工单列表">
      <header class="ticket-panel-head">
        <strong>工单列表</strong>
        <span>{{ total }} 条结果</span>
      </header>

      <div v-if="loading" class="ticket-state" role="status">正在加载工单…</div>
      <div v-else-if="error" class="ticket-state error" role="alert">
        <span>{{ error }}</span>
        <button type="button" @click="$emit('retry')"><RefreshCw :size="15" />重新加载</button>
      </div>
      <div v-else-if="!items.length" class="ticket-state empty">
        <Inbox :size="24" aria-hidden="true" />
        <strong>{{ emptyMessage }}</strong>
      </div>
      <div v-else class="ticket-rows">
        <button
          v-for="item in items"
          :key="item.id"
          type="button"
          class="ticket-row"
          :class="{ selected: item.id === selectedId }"
          :aria-pressed="item.id === selectedId"
          @click="$emit('select', item.id)"
        >
          <span class="ticket-row-top">
            <span class="ticket-badges">
              <span class="ticket-type">{{ typeLabel(item.type) }}</span>
              <span class="ticket-category">{{ categoryLabel(item.category) }}</span>
              <span class="ticket-status" :class="'status-' + item.status">
                {{ statusLabel(item.status, item.hasAdminReply) }}
              </span>
            </span>
            <time :datetime="item.updatedAt || item.createdAt">{{ formatDate(item.updatedAt || item.createdAt) }}</time>
          </span>
          <span class="ticket-summary">{{ truncate(item.content, 88) }}</span>
          <span class="ticket-row-foot">
            <code>{{ item.id }}</code>
            <span v-if="showReporter">{{ reporterName(item) }}</span>
            <ChevronRight :size="16" aria-hidden="true" />
          </span>
        </button>
      </div>

      <footer v-if="totalPages > 1" class="ticket-pagination" aria-label="工单分页">
        <button type="button" :disabled="page <= 1 || loading" aria-label="上一页" @click="$emit('page', page - 1)">
          <ChevronLeft :size="18" />
        </button>
        <span>第 {{ page }} / {{ totalPages }} 页</span>
        <button type="button" :disabled="page >= totalPages || loading" aria-label="下一页" @click="$emit('page', page + 1)">
          <ChevronRight :size="18" />
        </button>
      </footer>
    </section>

    <aside class="ticket-detail-panel" aria-label="反馈工单详情">
      <div v-if="selectedItem" class="ticket-detail-shell">
        <div class="ticket-detail-mobile-bar">
          <button type="button" aria-label="返回工单列表" @click="$emit('close')">
            <ChevronLeft :size="20" />
          </button>
          <strong>工单详情</strong>
        </div>
        <header class="ticket-detail-head">
          <div class="ticket-badges">
            <span class="ticket-type">{{ typeLabel(selectedItem.type) }}</span>
            <span class="ticket-category">{{ categoryLabel(selectedItem.category) }}</span>
            <span class="ticket-status" :class="'status-' + selectedItem.status">
              {{ statusLabel(selectedItem.status, selectedItem.hasAdminReply) }}
            </span>
          </div>
          <code>{{ selectedItem.id }}</code>
        </header>
        <div class="ticket-detail-scroll">
          <slot name="detail" :item="selectedItem" />
        </div>
      </div>
      <div v-else class="ticket-detail-placeholder">
        <MessageSquareText :size="30" aria-hidden="true" />
        <strong>选择一条工单查看详情</strong>
        <span>详情、对话记录和可用操作会显示在这里。</span>
      </div>
    </aside>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { ChevronLeft, ChevronRight, Inbox, MessageSquareText, RefreshCw } from '@lucide/vue'

const props = defineProps({
  items: { type: Array, default: () => [] },
  selectedId: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  emptyMessage: { type: String, default: '暂无反馈工单' },
  total: { type: Number, default: 0 },
  page: { type: Number, default: 1 },
  totalPages: { type: Number, default: 1 },
  showReporter: { type: Boolean, default: false },
  typeLabel: { type: Function, required: true },
  categoryLabel: { type: Function, required: true },
  statusLabel: { type: Function, required: true },
  formatDate: { type: Function, required: true }
})

defineEmits(['select', 'close', 'retry', 'page'])

const selectedItem = computed(() => props.items.find(item => item.id === props.selectedId) || null)

function truncate(value, length) {
  const text = String(value || '')
  return text.length > length ? text.slice(0, length) + '…' : text
}

function reporterName(item) {
  return item.reporterName || item.reporter?.userName || '未知用户'
}
</script>

<style scoped>
.ticket-workspace {
  display: grid;
  grid-template-columns: minmax(320px, 390px) minmax(0, 1fr);
  align-items: start;
  gap: 16px;
  margin-top: 16px;
  padding-bottom: 56px;
}

.ticket-list-panel,
.ticket-detail-panel {
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  overflow: hidden;
}

.ticket-panel-head {
  min-height: 50px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 16px;
  border-bottom: 1px solid var(--line);
}

.ticket-panel-head strong { color: var(--ink); font-size: 14px; }
.ticket-panel-head span { color: var(--ink-60); font-size: 12px; font-weight: 700; }
.ticket-rows { content-visibility: auto; }

.ticket-row {
  width: 100%;
  display: grid;
  gap: 9px;
  padding: 14px 16px;
  border: 0;
  border-bottom: 1px solid var(--line);
  border-left: 3px solid transparent;
  background: transparent;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
}

.ticket-row:last-child { border-bottom: 0; }
.ticket-row:hover { background: rgba(239, 210, 142, .12); }
.ticket-row.selected { border-left-color: var(--yellow-deep); background: rgba(239, 210, 142, .22); }
.ticket-row-top,.ticket-row-foot,.ticket-badges { display: flex; align-items: center; min-width: 0; }
.ticket-row-top { justify-content: space-between; gap: 10px; }
.ticket-badges { gap: 6px; flex-wrap: wrap; }
.ticket-row-top time { flex: none; color: var(--ink-35); font: 10.5px var(--font-d); }
.ticket-summary { color: var(--ink); font-size: 13px; font-weight: 650; line-height: 1.55; }
.ticket-row-foot { gap: 8px; color: var(--ink-60); font-size: 11px; }
.ticket-row-foot code { max-width: 150px; overflow: hidden; color: var(--ink-35); text-overflow: ellipsis; }
.ticket-row-foot svg { margin-left: auto; color: var(--ink-35); }

.ticket-type,.ticket-category,.ticket-status {
  min-height: 20px;
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: 5px;
  font-size: 10.5px;
  font-weight: 800;
}

.ticket-type { background: var(--yellow); color: var(--ink); }
.ticket-category { border: 1px solid var(--line); color: var(--ink-60); }
.ticket-status { border: 1px solid transparent; }
.ticket-status.status-OPEN { border-color: var(--accent); color: var(--accent-strong); }
.ticket-status.status-RESOLVED { border-color: #bfdcc0; color: #2d6a2d; }
.ticket-status.status-DISMISSED { border-color: var(--line); color: var(--ink-60); }

.ticket-state {
  min-height: 220px;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 10px;
  padding: 24px;
  color: var(--ink-60);
  font-size: 13px;
  text-align: center;
}

.ticket-state.error { color: var(--rouge); }
.ticket-state button { display: inline-flex; align-items: center; gap: 6px; border: 0; background: transparent; color: var(--accent-strong); font-weight: 800; cursor: pointer; }
.ticket-state.empty svg { color: var(--ink-35); }
.ticket-state.empty strong { color: var(--ink); }

.ticket-pagination {
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  border-top: 1px solid var(--line);
}

.ticket-pagination button {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
  color: var(--ink);
  cursor: pointer;
}

.ticket-pagination button:disabled { opacity: .35; cursor: default; }
.ticket-pagination span { color: var(--ink-60); font-size: 12px; font-weight: 700; }

.ticket-detail-panel {
  position: sticky;
  top: 96px;
  height: calc(100vh - 116px);
  min-height: 520px;
  max-height: 720px;
}

.ticket-detail-shell { height: 100%; display: flex; flex-direction: column; }
.ticket-detail-head { min-height: 58px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 18px; border-bottom: 1px solid var(--line); }
.ticket-detail-head code { color: var(--ink-35); font-size: 11px; }
.ticket-detail-scroll { min-height: 0; flex: 1; overflow-y: auto; padding: 0 20px 20px; }
.ticket-detail-mobile-bar { display: none; }
.ticket-detail-placeholder { min-height: 560px; display: grid; place-content: center; justify-items: center; gap: 9px; padding: 24px; color: var(--ink-60); text-align: center; }
.ticket-detail-placeholder svg { color: var(--ink-35); }
.ticket-detail-placeholder strong { color: var(--ink); }
.ticket-detail-placeholder span { max-width: 30ch; font-size: 12px; line-height: 1.6; }

@media (max-width: 1180px) {
  .ticket-workspace { grid-template-columns: minmax(290px, 340px) minmax(0, 1fr); }
}

@media (max-width: 767px) {
  .ticket-workspace { display: block; margin-top: 12px; padding-bottom: 32px; }
  .ticket-list-panel { border-radius: 8px; }
  .ticket-row { min-height: 112px; padding: 14px 12px; }
  .ticket-row-top { align-items: flex-start; }
  .ticket-detail-panel { display: none; }
  .ticket-workspace.has-selection .ticket-detail-panel {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: block;
    min-height: 100dvh;
    max-height: 100dvh;
    border: 0;
    border-radius: 0;
  }
  .ticket-detail-shell { height: 100dvh; }
  .ticket-detail-mobile-bar {
    min-height: calc(58px + env(safe-area-inset-top));
    display: flex;
    align-items: center;
    gap: 10px;
    padding: env(safe-area-inset-top) 12px 0;
    border-bottom: 1px solid var(--line);
    background: var(--surface);
  }
  .ticket-detail-mobile-bar button { width: 44px; height: 44px; display: grid; place-items: center; border: 0; background: transparent; color: var(--ink); }
  .ticket-detail-head { padding-inline: 16px; }
  .ticket-detail-scroll { padding: 0 16px calc(24px + env(safe-area-inset-bottom)); }
}
</style>
