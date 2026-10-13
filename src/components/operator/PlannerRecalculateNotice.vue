<template>
  <div class="recalculate-notice">
    <div>
      <p role="status" aria-atomic="true"><strong>{{ dateLabel }}的体力获取或支出已调整，可重新计算日程</strong></p>
      <p>点击后重新安排当日历练与 6-24，并更新后续自动日程。保留体力来源、派遣、自定义支出及未来手工安排。</p>
    </div>
    <button type="button" :disabled="disabled || busy" @click="$emit('recalculate')">
      <RefreshCw :size="15" aria-hidden="true" />
      {{ busy ? '正在保存…' : '重新计算当日及后续日程' }}
    </button>
  </div>
</template>

<script setup>
import { RefreshCw } from '@lucide/vue'
defineProps({ dateLabel: String, disabled: Boolean, busy: Boolean })
defineEmits(['recalculate'])
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.recalculate-notice { border-left: 3px solid var(--accent); background: var(--cream); color: var(--ink); }
strong { color: var(--tea); }
button { border: 1px solid var(--tea); border-radius: 8px; background: var(--tea); color: var(--cream); cursor: pointer; }
button:hover:not(:disabled) { filter: brightness(1.1); }
button:active:not(:disabled) { filter: brightness(.95); }
button:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 3px; }
button:disabled { opacity: .6; cursor: wait; }
</style>
<style scoped src="./plannerRecalculateNoticeDesktop.css"></style>
<style scoped src="./plannerRecalculateNoticeMobile.css"></style>
