<template>
  <section class="ticket-workspace" aria-label="反馈工单列表">
    <div v-if="loading" class="ticket-state" role="status">正在加载工单...</div>
    <div v-else-if="error" class="ticket-state error" role="alert">
      <span>{{ error }}</span>
      <button type="button" @click="$emit('retry')"><RefreshCw :size="15" />重新加载</button>
    </div>
    <div v-else-if="!items.length" class="ticket-state empty">
      <Inbox :size="24" aria-hidden="true" />
      <strong>{{ emptyMessage }}</strong>
    </div>
    <div v-else class="ticket-table-wrap">
      <table class="ticket-table">
        <thead>
          <tr>
            <th>类型</th>
            <th>反馈板块</th>
            <th>反馈内容</th>
            <th v-if="showReporter">提交人</th>
            <th>状态</th>
            <th>提交时间</th>
            <th>更新时间</th>
            <th class="ticket-operation">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in items"
            :key="item.id"
            :class="{ selected: item.id === selectedId }"
            tabindex="0"
            @click="$emit('select', item.id)"
            @keydown.enter="$emit('select', item.id)"
          >
            <td data-label="类型"><span class="ticket-type">{{ typeLabel(item.type) }}</span></td>
            <td data-label="反馈板块"><span class="ticket-category">{{ categoryLabel(item.category) }}</span></td>
            <td class="ticket-summary-cell" data-label="反馈内容">
              <strong>{{ truncate(item.content, 72) }}</strong>
              <code>{{ item.id }}</code>
              <span v-if="isUnread(item)" class="ticket-unread-marker">有新更新</span>
            </td>
            <td v-if="showReporter" data-label="提交人">{{ reporterName(item) }}</td>
            <td data-label="状态">
              <span class="ticket-status" :class="'status-' + item.status">
                {{ statusLabel(item.status, item.hasAdminReply) }}
              </span>
            </td>
            <td data-label="提交时间"><time :datetime="item.createdAt">{{ formatDate(item.createdAt) }}</time></td>
            <td data-label="更新时间"><time :datetime="item.updatedAt || item.createdAt">{{ formatDate(item.updatedAt || item.createdAt) }}</time></td>
            <td class="ticket-operation" data-label="操作">
              <button type="button" @click.stop="$emit('select', item.id)">
                <MessageSquareText :size="16" aria-hidden="true" />查看反馈
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <footer v-if="items.length" class="ticket-pagination" aria-label="工单分页">
      <span>{{ resultStart }}-{{ resultEnd }} / 共 {{ total }} 条</span>
      <div>
        <button type="button" :disabled="page <= 1 || loading" aria-label="首页" title="首页" @click="$emit('page', 1)">
          <ChevronsLeft :size="18" />
        </button>
        <button type="button" :disabled="page <= 1 || loading" aria-label="上一页" title="上一页" @click="$emit('page', page - 1)">
          <ChevronLeft :size="18" />
        </button>
        <strong>{{ page }} / {{ totalPages }}</strong>
        <button type="button" :disabled="page >= totalPages || loading" aria-label="下一页" title="下一页" @click="$emit('page', page + 1)">
          <ChevronRight :size="18" />
        </button>
        <button type="button" :disabled="page >= totalPages || loading" aria-label="末页" title="末页" @click="$emit('page', totalPages)">
          <ChevronsRight :size="18" />
        </button>
      </div>
    </footer>

    <Teleport to="body">
      <div v-if="selectedItem" class="ticket-detail-mask" role="presentation" @click.self="$emit('close')">
        <section class="ticket-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="ticket-detail-title">
          <header class="ticket-detail-head">
            <div>
              <span class="ticket-detail-kicker">FEEDBACK / TICKET</span>
              <h2 id="ticket-detail-title">反馈工单详情</h2>
            </div>
            <button type="button" aria-label="关闭工单详情" title="关闭" @click="$emit('close')">
              <X :size="22" />
            </button>
          </header>
          <div class="ticket-detail-meta">
            <div class="ticket-badges">
              <span class="ticket-type">{{ typeLabel(selectedItem.type) }}</span>
              <span class="ticket-category">{{ categoryLabel(selectedItem.category) }}</span>
              <span class="ticket-status" :class="'status-' + selectedItem.status">
                {{ statusLabel(selectedItem.status, selectedItem.hasAdminReply) }}
              </span>
            </div>
            <code>{{ selectedItem.id }}</code>
          </div>
          <div class="ticket-detail-scroll">
            <slot name="detail" :item="selectedItem" />
          </div>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Inbox,
  MessageSquareText,
  RefreshCw,
  X
} from '@lucide/vue'

const props = defineProps({
  items: { type: Array, default: () => [] },
  selectedId: { type: String, default: '' },
  selectedItem: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  emptyMessage: { type: String, default: '暂无反馈工单' },
  total: { type: Number, default: 0 },
  page: { type: Number, default: 1 },
  pageSize: { type: Number, default: 20 },
  totalPages: { type: Number, default: 1 },
  showReporter: { type: Boolean, default: false },
  unreadFeedbackIds: { type: Array, default: () => [] },
  typeLabel: { type: Function, required: true },
  categoryLabel: { type: Function, required: true },
  statusLabel: { type: Function, required: true },
  formatDate: { type: Function, required: true }
})

const emit = defineEmits(['select', 'close', 'retry', 'page'])

const selectedItem = computed(() => props.selectedItem || props.items.find(item => item.id === props.selectedId) || null)
const resultStart = computed(() => props.total ? (props.page - 1) * props.pageSize + 1 : 0)
const resultEnd = computed(() => Math.min(props.total, resultStart.value + props.items.length - 1))

function truncate(value, length) {
  const text = String(value || '')
  return text.length > length ? text.slice(0, length) + '...' : text
}

function reporterName(item) {
  return item.reporterName || item.reporter?.userName || '未知用户'
}

function isUnread(item) {
  return item && props.unreadFeedbackIds.includes(String(item.id))
}

function handleKeydown(event) {
  if (event.key === 'Escape' && selectedItem.value) emit('close')
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
</script>

<style scoped>
.ticket-workspace { margin-top: 18px; padding-bottom: 56px; }
.ticket-table-wrap { overflow-x: auto; border: 1px solid var(--feedback-line); border-radius: 8px; background: var(--feedback-panel); box-shadow: 0 16px 36px -32px rgba(73, 59, 44, .42); scrollbar-gutter: stable; }
.ticket-table { width: 100%; min-width: 980px; border-collapse: collapse; table-layout: fixed; }
.ticket-table th,
.ticket-table td { padding: 16px 14px; border-bottom: 1px solid var(--feedback-line); color: var(--feedback-text-muted); text-align: left; vertical-align: middle; }
.ticket-table th { padding-block: 13px; background: var(--tea); color: var(--cream); font-size: 11px; font-weight: 800; }
.ticket-table th:nth-child(1) { width: 112px; }
.ticket-table th:nth-child(2) { width: 116px; }
.ticket-table th:nth-last-child(4) { width: 104px; }
.ticket-table th:nth-last-child(3),
.ticket-table th:nth-last-child(2) { width: 126px; }
.ticket-table th.ticket-operation { width: 116px; }
.ticket-table tbody tr { outline: 0; transition: background-color .16s ease, box-shadow .16s ease; cursor: pointer; }
.ticket-table tbody tr:last-child td { border-bottom: 0; }
.ticket-table tbody tr:hover,
.ticket-table tbody tr:focus-visible,
.ticket-table tbody tr.selected { background: var(--feedback-panel-hover); box-shadow: inset 3px 0 var(--yellow-deep); }
.ticket-summary-cell strong { display: block; overflow: hidden; color: var(--feedback-text); font-size: 13px; font-weight: 700; line-height: 1.55; text-overflow: ellipsis; white-space: nowrap; }
.ticket-summary-cell code { display: block; margin-top: 5px; overflow: hidden; color: var(--feedback-text-dim); font: 10px var(--font-d); text-overflow: ellipsis; white-space: nowrap; }
.ticket-unread-marker { display: inline-flex; align-items: center; min-height: 22px; margin-top: 7px; padding: 2px 7px; border: 1px solid var(--rouge); border-radius: 5px; color: var(--rouge); font-size: 10px; font-weight: 800; line-height: 1.2; }
.ticket-table time { color: var(--feedback-text-dim); font: 10.5px var(--font-d); }
.ticket-operation button { min-height: 34px; display: inline-flex; align-items: center; gap: 6px; border: 0; background: transparent; color: var(--feedback-text); font: 800 12px var(--font-b); cursor: pointer; white-space: nowrap; }
.ticket-operation button:hover { color: var(--accent-strong); }
.ticket-type,
.ticket-category,
.ticket-status { min-height: 25px; display: inline-flex; align-items: center; padding: 2px 8px; border: 1px solid var(--feedback-line-strong); border-radius: 5px; color: var(--feedback-text-muted); font-size: 10.5px; font-weight: 800; white-space: nowrap; }
.ticket-type { border-color: var(--yellow-deep); background: var(--yellow); color: var(--ink); }
.ticket-category { border-color: var(--brand-blue); background: transparent; color: var(--brand-blue); }
.ticket-status { border-color: transparent; }
.ticket-status.status-OPEN { border-color: var(--accent); color: var(--accent-strong); }
.ticket-status.status-RESOLVED { border-color: var(--feedback-success); color: var(--feedback-success); }
.ticket-status.status-DISMISSED { border-color: var(--feedback-line-strong); color: var(--feedback-text-dim); }
.ticket-state { min-height: 260px; display: grid; place-content: center; justify-items: center; gap: 10px; border: 1px solid var(--feedback-line); border-radius: 8px; background: var(--feedback-panel); color: var(--feedback-text-muted); font-size: 13px; text-align: center; }
.ticket-state.error { color: var(--feedback-danger); }
.ticket-state button { display: inline-flex; align-items: center; gap: 6px; border: 0; background: transparent; color: var(--accent-strong); font-weight: 800; cursor: pointer; }
.ticket-state.empty strong { color: var(--feedback-text); }
.ticket-pagination { min-height: 62px; display: flex; align-items: center; justify-content: space-between; gap: 18px; color: var(--feedback-text-dim); font: 11px var(--font-d); }
.ticket-pagination > div { display: flex; align-items: center; overflow: hidden; border: 1px solid var(--feedback-line); border-radius: 7px; background: var(--feedback-panel); }
.ticket-pagination button { width: 40px; height: 40px; display: grid; place-items: center; border: 0; border-left: 1px solid var(--feedback-line); background: transparent; color: var(--feedback-text-muted); cursor: pointer; }
.ticket-pagination button:first-child { border-left: 0; }
.ticket-pagination button:disabled { opacity: .3; cursor: default; }
.ticket-pagination strong { min-width: 70px; color: var(--feedback-text); font-weight: 700; text-align: center; }
.ticket-detail-mask {
  --feedback-panel-deep: var(--surface);
  --feedback-panel: var(--cream);
  --feedback-line: var(--line);
  --feedback-line-strong: rgba(156, 122, 77, .46);
  --feedback-text: var(--ink);
  --feedback-text-muted: var(--ink-60);
  --feedback-text-dim: var(--ink-35);
  --feedback-accent: var(--tea);
  --feedback-success: #5f7f61;
  --feedback-warn: var(--accent-strong);
  --feedback-danger: var(--rouge);
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  padding: 28px;
  background: rgba(73, 59, 44, .52);
  backdrop-filter: blur(10px);
}
.ticket-detail-dialog { width: min(920px, 100%); max-height: min(820px, calc(100dvh - 56px)); display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--line); border-radius: 8px; background: var(--feedback-panel-deep); box-shadow: 0 30px 90px rgba(73, 59, 44, .32); }
.ticket-detail-head { min-height: 112px; display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 22px 26px; border-bottom: 1px solid var(--feedback-line); }
.ticket-detail-kicker { display: block; margin-bottom: 8px; color: var(--accent-strong); font: 800 11px var(--font-d); letter-spacing: .16em; }
.ticket-detail-head h2 { color: var(--feedback-text); font-family: var(--font-s); font-size: 25px; font-weight: 900; letter-spacing: .04em; }
.ticket-detail-head > button { width: 44px; height: 44px; flex: none; display: grid; place-items: center; border: 1px solid var(--feedback-line-strong); border-radius: 7px; background: transparent; color: var(--feedback-text); cursor: pointer; }
.ticket-detail-head > button:hover { border-color: var(--accent); color: var(--accent-strong); }
.ticket-detail-meta { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 26px 0; }
.ticket-badges { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.ticket-detail-meta code { overflow-wrap: anywhere; color: var(--feedback-text-dim); font: 10.5px var(--font-d); }
.ticket-detail-scroll { min-height: 0; overflow-y: auto; padding: 0 26px 26px; }

@media (max-width: 767px) {
  .ticket-workspace { margin-top: 12px; padding-bottom: 32px; }
  .ticket-table-wrap { overflow: visible; border: 0; background: transparent; }
  .ticket-table { min-width: 0; }
  .ticket-table thead { display: none; }
  .ticket-table tbody { display: grid; gap: 10px; }
  .ticket-table tbody tr { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); overflow: hidden; border: 1px solid var(--feedback-line); border-radius: 8px; background: var(--feedback-panel); }
  .ticket-table td { min-width: 0; display: grid; gap: 4px; padding: 11px 12px; border-bottom: 1px solid var(--feedback-line); font-size: 12px; }
  .ticket-table td::before { content: attr(data-label); color: var(--feedback-text-dim); font-size: 9.5px; font-weight: 800; }
  .ticket-table .ticket-summary-cell { grid-column: 1 / -1; grid-row: 1; }
  .ticket-table .ticket-operation { grid-column: 1 / -1; border-bottom: 0; }
  .ticket-table .ticket-operation button { width: 100%; justify-content: center; border: 1px solid var(--feedback-line-strong); }
  .ticket-pagination { align-items: flex-start; flex-direction: column; }
  .ticket-pagination > div { align-self: stretch; justify-content: center; }
  .ticket-detail-mask { padding: 0; place-items: stretch; }
  .ticket-detail-dialog { width: 100%; max-height: 100dvh; min-height: 100dvh; border: 0; border-radius: 0; }
  .ticket-detail-head { min-height: calc(86px + env(safe-area-inset-top)); padding: calc(14px + env(safe-area-inset-top)) 16px 14px; }
  .ticket-detail-head h2 { font-size: 21px; }
  .ticket-detail-meta { align-items: flex-start; flex-direction: column; padding: 16px 16px 0; }
  .ticket-detail-scroll { padding: 0 16px calc(20px + env(safe-area-inset-bottom)); }
}
</style>
