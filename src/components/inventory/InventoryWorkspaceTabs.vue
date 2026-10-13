<template>
  <div
    class="inventory-tabs tool-workspace-tabs"
    data-tour="inventory-workspace"
    role="tablist"
    @keydown="onWorkspaceTabKeydown"
    @focusin="onWorkspaceTabFocus" @focusout="onWorkspaceTabFocus"
    aria-label="库存工作区"
  >
    <button
      type="button"
      role="tab"
      id="inventory-tab-manifest"
      aria-controls="inventory-panel-manifest"
      :tabindex="activeTab === 'manifest' ? 0 : -1"
      :aria-selected="activeTab === 'manifest'"
      :class="{ on: activeTab === 'manifest' }"
      @click="$emit('select', 'manifest')"
    >
      <Layers3 :size="17" aria-hidden="true" /><span>库存清单</span>
    </button>
    <button
      type="button"
      role="tab"
      id="inventory-tab-acquired"
      aria-controls="inventory-panel-acquired"
      :tabindex="activeTab === 'acquired' ? 0 : -1"
      :aria-selected="activeTab === 'acquired'"
      :class="{ on: activeTab === 'acquired' }"
      @click="$emit('select', 'acquired')"
    >
      <CalendarDays :size="17" aria-hidden="true" /><span
        >统计报告</span
      >
    </button>
    <button
      type="button"
      role="tab"
      id="inventory-tab-records"
      aria-controls="inventory-panel-records"
      :tabindex="activeTab === 'records' ? 0 : -1"
      :aria-selected="activeTab === 'records'"
      :class="{ on: activeTab === 'records' }"
      @click="$emit('select', 'records')"
    >
      <ListFilter :size="17" aria-hidden="true" /><span>操作历史</span>
    </button>
  </div>
</template>

<script setup>
import { CalendarDays, Layers3, ListFilter } from '@lucide/vue'
import { onWorkspaceTabKeydown, onWorkspaceTabFocus } from '../../utils/workspaceTabs.js'
defineProps({ activeTab: { type: String, required: true } })
defineEmits(['select'])
</script>

<style scoped>
/* 当前 Tab 字段外观为刻意共享契约，设备几何规则另行维护。 */

.inventory-tabs {
  border: 1px solid var(--line);
  background: var(--surface);
  box-shadow: none;
  backdrop-filter: none;
}
.inventory-tabs button {
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--ink-60);
  font: 600 14px/1.5 var(--font-b);
  white-space: nowrap;
  cursor: pointer;
  transition: none;
}
.inventory-tabs button[aria-selected="true"] {
  border-bottom-color: var(--tea);
  background: color-mix(in srgb, var(--yellow) 45%, var(--surface));
  color: var(--tea);
}
@media (hover: hover) {
  .inventory-tabs button:hover:not([aria-selected="true"]):not(:disabled) {
    background: var(--cream);
    color: var(--ink);
  }
}
.inventory-tabs button:focus-visible {
  outline: 2px solid var(--tea);
  outline-offset: -3px;
}
.inventory-tabs button:disabled {
  color: var(--ink-35);
  cursor: not-allowed;
}
.inventory-tabs button[aria-haspopup="dialog"] {
  border: 1px dashed var(--line);
}
</style>
<style scoped src="./inventoryWorkspaceTabsDesktop.css"></style>
<style scoped src="./inventoryWorkspaceTabsMobile.css"></style>
