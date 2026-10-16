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
      <slot name="empty" />
    </div>
    <div v-else class="ticket-table-wrap">
      <table class="ticket-table" :class="{ 'is-workflow': workflow }">
        <thead>
          <tr>
            <th class="ticket-content-heading">反馈内容</th>
            <th class="ticket-category-heading">反馈板块</th>
            <th v-if="workflow" class="ticket-state-heading">待办 / 状态</th>
            <th v-if="workflow" class="ticket-owner-heading">负责人</th>
            <th v-if="showReporter && !workflow">提交人</th>
            <th v-if="!workflow">状态</th>
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
            <td class="ticket-summary-cell" data-label="反馈内容">
              <strong>{{ item.title || truncate(item.content, 72) }}</strong>
              <details @click.stop @keydown.stop><summary>工单编号</summary><code>{{ item.id }}</code><button class="ticket-copy" type="button" @click="copyId(item.id)">复制编号</button></details>
              <div v-if="workflow" class="ticket-workflow-tags">
                <span v-if="item.category !== item.workArea" class="ticket-origin">来源 · {{ categoryLabel(item.category) }}</span>
                <span v-if="showReporter" class="ticket-origin">提交人 · {{ reporterName(item) }}</span>
              </div>
              <span v-if="isUnread(item)" class="ticket-unread-marker">{{ workflow ? '新消息未读' : '有新更新' }}</span>
            </td>
            <td data-label="反馈板块"><span class="ticket-category">{{ categoryLabel(workflow ? item.workArea : item.category) }}</span></td>
            <td v-if="showReporter && !workflow" data-label="提交人">{{ reporterName(item) }}</td>
            <td :data-label="workflow ? '待办 / 状态' : '状态'">
              <span class="ticket-status" :class="['status-' + item.status, 'stage-' + item.workflowStage]">
                {{ statusLabel(item.status, item.hasAdminReply, item) }}
              </span>
              <span v-if="workflow && item.needsReply && item.status === 'OPEN'" class="ticket-reply-marker">需回复</span>
            </td>
            <td v-if="workflow" data-label="负责人"><span class="ticket-operator" :title="item.operatorAssigneeName || '未分配'">{{ item.operatorAssigneeName || '未分配' }}</span></td>
            <td data-label="更新时间"><time :datetime="item.updatedAt || item.createdAt">{{ formatDate(item.updatedAt || item.createdAt) }}</time></td>
            <td class="ticket-operation" data-label="操作">
              <button type="button" @click.stop="$emit('select', item.id)">
                <MessageSquareText :size="16" aria-hidden="true" />{{ workflow ? '查看工单' : '查看反馈' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="copyMessage" class="ticket-copy-message" role="status">{{ copyMessage }}</p>

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
      <div v-if="selectedItem" class="ticket-detail-mask" :class="{ 'is-short-viewport': shortViewport }" :style="viewportStyle" role="presentation" @click.self="$emit('close')">
        <section ref="detailPanel" @focusin="revealFocusedControl" class="ticket-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="ticket-detail-title" tabindex="-1">
          <header class="ticket-detail-head">
            <div>
              <span class="ticket-detail-kicker">FEEDBACK / TICKET</span>
              <h2 id="ticket-detail-title">反馈工单详情</h2>
            </div>
            <button ref="detailCloseButton" type="button" aria-label="关闭工单详情" title="关闭" @click="$emit('close')">
              <X :size="22" />
            </button>
          </header>
          <div ref="scrollBody" class="ticket-detail-scroll">
            <div class="ticket-detail-meta">
              <div class="ticket-detail-overview">
                <span class="ticket-status ticket-detail-status" :class="['status-' + selectedItem.status, 'stage-' + selectedItem.workflowStage]">
                  {{ statusLabel(selectedItem.status, selectedItem.hasAdminReply, selectedItem) }}
                </span>
                <span v-if="showReporter" class="ticket-detail-fact">
                  <span>提交人</span>
                  <strong>{{ reporterName(selectedItem) }}</strong>
                </span>
                <span class="ticket-detail-fact">
                  <span>提交于</span>
                  <time :datetime="selectedItem.createdAt">{{ formatDate(selectedItem.createdAt) }}</time>
                </span>
                <span v-if="workflow" class="ticket-operator" :title="selectedItem.operatorAssigneeName || '未分配'">运营 · {{ selectedItem.operatorAssigneeName || '未分配' }}</span>
              </div>
              <div class="ticket-detail-context">
                <div class="ticket-badges ticket-badges-secondary">
                  <span class="ticket-category">{{ workflow ? '负责板块' : '板块' }} · {{ categoryLabel(workflow ? selectedItem.workArea : selectedItem.category) }}</span>
                </div>
                <code><span>工单</span>{{ selectedItem.id }}</code>
              </div>
            </div>
            <slot name="detail" :item="selectedItem" />
          </div>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useModalFocus } from '@/composables/useModalFocus.js'
import { useModalViewport } from '@/composables/useModalViewport.js'
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
  workflow: { type: Boolean, default: false },
  unreadFeedbackIds: { type: Array, default: () => [] },
  categoryLabel: { type: Function, required: true },
  statusLabel: { type: Function, required: true },
  formatDate: { type: Function, required: true }
})

const emit = defineEmits(['select', 'close', 'retry', 'page'])
const detailPanel = ref(null)
const detailCloseButton = ref(null)
const copyMessage = ref('')

const selectedItem = computed(() => props.selectedItem || props.items.find(item => item.id === props.selectedId) || (props.selectedId ? { id: props.selectedId } : null))
const scrollBody = ref(null)
const { viewportStyle, shortViewport, revealFocusedControl } = useModalViewport(() => Boolean(selectedItem.value), scrollBody, detailPanel)
useModalFocus(() => Boolean(selectedItem.value), detailPanel, {
  initialFocus: () => detailCloseButton.value,
  onEscape: () => { if (!hasOpenOverlayAbove()) emit('close') }
})
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
  return item && (props.workflow ? item.teamUnread : props.unreadFeedbackIds.includes(String(item.id)))
}

// 详情层之上可能还压着二级弹窗（如管理端的“合并反馈”，见 main.css 的浮层刻度）：
// Escape 属于最上层弹窗，详情层必须让位，不能连带一起关闭。
function hasOpenOverlayAbove() {
  return typeof document !== 'undefined' && Boolean(document.querySelector('.modal-mask, .dialog-mask'))
}

async function copyId(id) {
  try {
    await navigator.clipboard.writeText(String(id))
    copyMessage.value = '工单编号已复制。'
  } catch {
    copyMessage.value = '复制失败，请选中编号手动复制。'
  }
}
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.ticket-detail-dialog .ticket-detail-scroll :deep(textarea) { min-height: min(120px, max(48px, calc(var(--modal-viewport-height, 100dvh) - 180px))); max-height: max(48px, calc(var(--modal-viewport-height, 100dvh) - 180px)); }
.ticket-table-wrap { border: 1px solid var(--feedback-line); border-radius: 8px; background: var(--feedback-panel); box-shadow: 0 16px 36px -32px rgba(73, 59, 44, .42); }
.ticket-table { border-collapse: collapse; }
.ticket-table th,
.ticket-table td { border-bottom: 1px solid var(--feedback-line); color: var(--feedback-text-muted); }
.ticket-table th { background: var(--tea); color: var(--cream); }
.ticket-table tbody tr { outline: 0; transition: background-color .16s ease, box-shadow .16s ease; cursor: pointer; }
.ticket-table tbody tr:last-child td { border-bottom: 0; }
.ticket-table tbody tr:hover,
.ticket-table tbody tr:focus-visible,
.ticket-table tbody tr.selected { background: var(--feedback-panel-hover); box-shadow: inset 3px 0 var(--yellow-deep); }
.ticket-summary-cell strong { color: var(--feedback-text); }
.ticket-origin { color: var(--feedback-text-muted); }
.ticket-copy { border: 0; background: transparent; color: var(--feedback-text); cursor: pointer; }
.ticket-copy-message { color: var(--feedback-text); }
.ticket-summary-cell code { color: var(--feedback-text-dim); }
.ticket-summary-cell summary { color: var(--feedback-text-muted); cursor: pointer; }
.ticket-unread-marker { border: 1px solid var(--rouge); border-radius: 5px; color: var(--rouge); }
.ticket-operator { border: 1px solid var(--feedback-line-strong); border-radius: 5px; color: var(--feedback-text-muted); }
.ticket-reply-marker { color: var(--feedback-warn); }
.ticket-status.stage-PROCESSING { border-color: var(--brand-blue); color: var(--brand-blue); }
.ticket-status.stage-DEV_HANDOFF { border-color: var(--tea); color: var(--tea); }
.ticket-table time { color: var(--feedback-text-dim); }
.ticket-operation button { border: 0; background: transparent; color: var(--feedback-text); cursor: pointer; }
.ticket-operation button:hover { color: var(--accent-strong); }
.ticket-type,
.ticket-category,
.ticket-status { border: 1px solid var(--feedback-line-strong); border-radius: 5px; color: var(--feedback-text-muted); }
.ticket-type { border-color: var(--yellow-deep); background: var(--yellow); color: var(--ink); }
.ticket-category { border-color: var(--brand-blue); background: transparent; color: var(--brand-blue); }
.ticket-status { border-color: transparent; }
.ticket-status.status-OPEN { border-color: var(--accent); color: var(--accent-strong); }
.ticket-status.status-RESOLVED { border-color: var(--feedback-success); color: var(--feedback-success); }
.ticket-status.status-DISMISSED { border-color: var(--feedback-line-strong); color: var(--feedback-text-dim); }
.ticket-state { border: 1px solid var(--feedback-line); border-radius: 8px; background: var(--feedback-panel); color: var(--feedback-text-muted); }
.ticket-state.error { color: var(--feedback-danger); }
.ticket-state button { border: 0; background: transparent; color: var(--accent-strong); cursor: pointer; }
.ticket-state.empty strong { color: var(--feedback-text); }
.ticket-pagination { color: var(--feedback-text-dim); }
.ticket-pagination > div { border: 1px solid var(--feedback-line); border-radius: 7px; background: var(--feedback-panel); }
.ticket-pagination button { border: 0; border-left: 1px solid var(--feedback-line); background: transparent; color: var(--feedback-text-muted); cursor: pointer; }
.ticket-pagination button:first-child { border-left: 0; }
.ticket-pagination button:disabled { opacity: .3; cursor: default; }
.ticket-pagination strong { color: var(--feedback-text); }
.ticket-detail-mask {
  background: rgba(73, 59, 44, .52);
  backdrop-filter: blur(10px);
}
.ticket-detail-dialog { border: 1px solid var(--line); border-radius: 8px; background: var(--feedback-panel-deep); box-shadow: 0 30px 90px rgba(73, 59, 44, .32); }
.ticket-detail-head { border-bottom: 1px solid var(--feedback-line); }
.ticket-detail-kicker { color: var(--accent-strong); }
.ticket-detail-head h2 { color: var(--feedback-text); }
.ticket-detail-head > button { border: 1px solid var(--feedback-line-strong); border-radius: 7px; background: transparent; color: var(--feedback-text); cursor: pointer; }
.ticket-detail-head > button:hover { border-color: var(--accent); color: var(--accent-strong); }
.ticket-detail-overview { border-bottom: 1px solid var(--feedback-line); }
.ticket-detail-fact { color: var(--feedback-text-muted); }
.ticket-detail-fact > span { color: var(--feedback-text-dim); }
.ticket-detail-fact strong { color: var(--feedback-text); }
.ticket-detail-fact time { color: var(--feedback-text-muted); }
.ticket-badges-secondary .ticket-type,
.ticket-badges-secondary .ticket-category { border-color: var(--feedback-line); background: var(--feedback-panel); color: var(--feedback-text-muted); }
.ticket-detail-meta code { color: var(--feedback-text-dim); }
.ticket-detail-meta code span { color: var(--feedback-text-dim); }

@media (max-width: 767px) {
  .ticket-table-wrap { border: 0; background: transparent; }
  .ticket-table tbody tr { border: 1px solid var(--feedback-line); border-radius: 8px; background: var(--feedback-panel); }
  .ticket-table td { border-bottom: 1px solid var(--feedback-line); }
  .ticket-table td::before { content: attr(data-label); color: var(--feedback-text-dim); }
  .ticket-table .ticket-operation { border-bottom: 0; }
  .ticket-table .ticket-operation button { border: 1px solid var(--feedback-line-strong); }
  .ticket-detail-dialog { border: 0; border-radius: 0; }
}
</style>
<style scoped src="./feedbackTicketWorkspaceDesktop.css"></style>
<style scoped src="./feedbackTicketWorkspaceMobile.css"></style>
