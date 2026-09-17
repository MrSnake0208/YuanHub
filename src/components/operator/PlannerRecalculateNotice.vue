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
.recalculate-notice { display: flex; align-items: center; gap: 16px; padding: 14px 16px; border-left: 3px solid var(--accent); background: var(--cream); color: var(--ink); }
p { margin: 0; font-size: 13px; line-height: 1.7; }
p + p { margin-top: 4px; }
strong { color: var(--tea); }
button { display: flex; flex: none; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 10px 14px; border: 1px solid var(--tea); border-radius: 8px; background: var(--tea); color: var(--cream); font: inherit; font-size: 13px; cursor: pointer; }
button:hover:not(:disabled) { filter: brightness(1.1); }
button:active:not(:disabled) { filter: brightness(.95); }
button:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 3px; }
button:disabled { opacity: .6; cursor: wait; }
svg { flex: none; }
@media (max-width: 640px) { .recalculate-notice { flex-direction: column; align-items: stretch; } }
</style>
