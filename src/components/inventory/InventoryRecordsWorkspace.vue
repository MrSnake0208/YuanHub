<template>
  <div class="inventory-records-workspace">
    <section class="records-overview" aria-labelledby="records-overview-title">
      <div class="records-overview-copy">
        <span class="records-kicker">库存追踪 · 操作历史</span>
        <h2 id="records-overview-title">浏览库存变更记录</h2>
        <p>
          新增奖励请用「记录奖励」；本地报告可在此导入。
        </p>
      </div>
      <div class="records-overview-actions">
        <div class="records-count" aria-live="polite">
          <span>当前已加载</span>
          <strong>{{ recordsList.length }}</strong>
          <small>条记录</small>
        </div>
        <button type="button" class="btn ghost records-report-entry" :disabled="rewardEntryDisabled || rewardImportBusy"
          aria-haspopup="dialog" aria-controls="reward-entry-panel" :aria-expanded="reportOpen"
          @click="$emit('open-report', $event.currentTarget)"><Upload :size="16" aria-hidden="true" />导入本地报告</button>
      </div>
    </section>
    <div class="records-head" v-reveal>
      <span class="hint"
        >删除记录后会重新计算库存，可在本页撤销。</span
      >
      <span class="sp"></span>
      <div
        class="records-filter"
        role="group"
        aria-label="操作历史类型筛选"
      >
        <button
          type="button"
          :aria-pressed="recordsEntityType === 'all'"
          :class="{ on: recordsEntityType === 'all' }"
          :disabled="recordsLoading"
          @click="$emit('filter', 'all')"
        >
          全部
        </button>
        <button
          type="button"
          :aria-pressed="recordsEntityType === 'item'"
          :class="{ on: recordsEntityType === 'item' }"
          :disabled="recordsLoading"
          @click="$emit('filter', 'item')"
        >
          道具
        </button>
        <button
          type="button"
          :aria-pressed="recordsEntityType === 'agent'"
          :class="{ on: recordsEntityType === 'agent' }"
          :disabled="recordsLoading"
          @click="$emit('filter', 'agent')"
        >
          心纸
        </button>
      </div>
      <button
        class="act-btn ghost"
        :disabled="recordsLoading"
        @click="$emit('load', true)"
      >
        刷新
      </button>
    </div>

    <div v-for="notice in deletedRecordNotices" :key="notice.recordId" class="inventory-inline-state" role="status">
      已删除「{{ notice.summary }}」，库存已重新计算。
      <button type="button" class="link" :disabled="Boolean(recordsBusyId)" @click="$emit('restore', notice)">撤销删除</button>
    </div>
    <div v-if="recordsActionError" class="inventory-inline-state is-error" role="alert">{{ recordsActionError }}</div>

    <div
      v-if="recordsLoading && recordsList.length === 0"
      class="state"
    >
      正在加载记录…
    </div>
    <div v-else-if="!accountId" class="state">请先创建并选择一个子账号，库存变更记录会归属到该账号。</div>
    <div v-else-if="recordsError && recordsList.length === 0" class="state err" role="alert">
      {{ recordsError }}
      <button type="button" class="link" @click="$emit('load', true)">重试加载</button>
    </div>
    <div v-else-if="recordsList.length === 0" class="state">
      <strong>还没有库存变更记录</strong><br />
      更新库存、记录奖励或导入本地报告后，记录会出现在这里。请使用顶部「记录奖励」「更新库存」，或此处的「导入本地报告」。
    </div>
    <template v-else>
      <slot />
      <div v-if="recordsError" class="inventory-inline-state is-error" role="alert">
        {{ recordsError }}，已加载的记录仍可查看。
        <button type="button" class="link" :disabled="recordsLoading" @click="$emit('load', recordsRetryReset)">重试加载</button>
      </div>
      <button
        v-if="recordsNextCursor && !recordsError"
        class="load-more"
        :disabled="recordsLoading"
        @click="$emit('load', false)"
      >
        加载更多
      </button>
    </template>
  </div>
</template>

<script setup>
import { Upload } from '@lucide/vue'
defineProps({
  recordsList: { type: Array, required: true },
  accountId: { type: String, required: true },
  recordsEntityType: { type: String, required: true },
  recordsLoading: Boolean,
  recordsBusyId: { type: String, default: '' },
  deletedRecordNotices: { type: Array, required: true },
  recordsError: { type: String, default: '' },
  recordsActionError: { type: String, default: '' },
  recordsRetryReset: Boolean,
  recordsNextCursor: { type: String, default: null },
  rewardEntryDisabled: Boolean,
  rewardImportBusy: Boolean,
  reportOpen: Boolean,
})
defineEmits(['filter', 'load', 'restore', 'open-report'])
</script>

<style scoped>
/* 共用字段及按钮外观，布局由两端文件分别持有。 */

.load-more {
  border: 1.5px solid var(--line);
  background: var(--surface);
  color: var(--ink);
  font-weight: 800;
  cursor: pointer;
  font-family: var(--font-b);
  transition:
    color 0.3s var(--ease),
    background-color 0.3s var(--ease),
    border-color 0.3s var(--ease);
}
.load-more:hover:not(:disabled) {
  border-color: var(--ink);
  background: var(--cream);
}
.load-more:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.act-btn {
  border: 1.5px solid var(--line);
  background: var(--surface);
  font-weight: 700;
  color: var(--ink-60);
  cursor: pointer;
  font-family: var(--font-b);
  transition:
    color 0.3s var(--ease),
    background-color 0.3s var(--ease),
    border-color 0.3s var(--ease);
  white-space: nowrap;
}
.act-btn.ghost:hover:not(:disabled) {
  border-color: var(--ink);
  color: var(--ink);
}
.act-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.btn {
  font-weight: 800;
  font-family: var(--font-b);
  cursor: pointer;
  transition:
    color 0.35s var(--ease),
    background-color 0.35s var(--ease),
    border-color 0.35s var(--ease),
    transform 0.35s var(--ease);
  border: none;
}
.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.btn.ghost {
  background: var(--paper);
  border: 1.5px solid var(--line);
  color: var(--ink);
}
.btn.ghost:hover:not(:disabled) {
  background: var(--cream);
  color: var(--ink);
}

.state {
  background: var(--surface);
  border: 1.5px dashed var(--line);
  color: var(--ink-35);
  font-weight: 700;
}
.state.err {
  color: var(--ink-60);
}
.inventory-inline-state {
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink-60);
  line-height: 1.6;
}
.inventory-inline-state.is-error {
  border-color: var(--rouge);
  color: var(--rouge);
}
.inventory-inline-state .link,
.state .link {
  background: none;
  border: none;
  color: var(--accent-strong);
  font: inherit;
  font-weight: 800;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.records-overview {
  border: 1px solid var(--line);
  background:
    linear-gradient(118deg, rgba(255, 248, 236, 0.92), rgba(255, 253, 246, 0.98));
  box-shadow: 0 14px 34px -32px rgba(73, 59, 44, 0.48);
}
.records-kicker {
  color: var(--accent-strong);
  font-weight: 800;
  letter-spacing: 0.13em;
}
.records-overview h2 {
  color: var(--ink);
  font-family: var(--font-s);
  font-weight: 900;
  letter-spacing: 0.04em;
}
.records-overview p {
  color: var(--ink-60);
  font-weight: 600;
  line-height: 1.75;
}
.records-count {
  color: var(--ink-60);
  font-weight: 700;
}
.records-count strong {
  color: var(--ink);
  font-family: "Archivo", var(--font-b);
  font-weight: 700;
  line-height: 1;
}
.records-head .hint {
  color: var(--ink-60);
  font-weight: 600;
}
.records-filter {
  border: 1px solid var(--line);
  background: var(--paper);
}
.records-filter button {
  border: 0;
  background: transparent;
  color: var(--ink-60);
  font-family: var(--font-b);
  font-weight: 800;
  cursor: pointer;
}
.records-filter button.on {
  background: var(--tea);
  color: var(--cream);
}
.records-filter button:hover:not(.on):not(:disabled) {
  color: var(--ink);
}
.records-filter button:focus-visible {
  outline: 2px solid var(--brand-blue);
  outline-offset: 1px;
}
.records-filter button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.records-report-entry { white-space: nowrap; }
</style>
<style scoped src="./inventoryRecordsWorkspaceDesktop.css"></style>
<style scoped src="./inventoryRecordsWorkspaceMobile.css"></style>
