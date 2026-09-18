<template>
  <p v-if="state.status === 'idle'" class="state-note">尚未检查兼容性。</p>
  <p v-else-if="state.status === 'loading'" class="state-note">正在分析兼容性…</p>
  <div v-else-if="state.status === 'error'" class="target-error" role="alert">
    <span>{{ state.error }}</span>
    <button type="button" @click="$emit('retry')">重试</button>
  </div>
  <template v-else-if="state.data">
    <div class="compat-summary" :class="'status-' + state.data.status">
      <div><span>{{ label }}</span><strong>{{ statusInfo(state.data.status).label }}</strong></div>
      <p>{{ statusInfo(state.data.status).description }}</p>
    </div>
    <IssueList :issues="state.data.issues" empty-text="目标平台没有报告兼容性问题。" />
    <details v-if="state.data.target_document" class="document-viewer">
      <summary>查看标准化文档</summary>
      <button type="button" @click="copyDocument">复制标准化文档</button>
      <pre>{{ safeJson(state.data.target_document) }}</pre>
    </details>
    <p v-else class="document-note">此分析没有返回目标文档，不提供下载或执行入口。</p>
    <p class="copy-feedback" aria-live="polite">{{ copyFeedback }}</p>
  </template>
</template>

<script setup>
import { ref } from 'vue'
import IssueList from '@/components/work/IssueList.vue'
import { safeJson, statusInfo } from '@/utils/workDisplay.js'

const props = defineProps({
  label: { type: String, required: true },
  state: { type: Object, required: true }
})
defineEmits(['retry'])
const copyFeedback = ref('')

async function copyDocument() {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
    await navigator.clipboard.writeText(safeJson(props.state.data.target_document))
    copyFeedback.value = props.label + ' 标准化文档已复制。'
  } catch (_) {
    copyFeedback.value = '复制失败，请手动选择文本复制。'
  }
}
</script>

<style scoped>
.state-note { padding-top: 20px; color: var(--ink-60); }
.target-error { padding-top: 20px; display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--rouge); }
button { min-height: 44px; padding: 8px 13px; border: 1px solid var(--tea); border-radius: 999px; background: var(--tea); color: var(--cream); font: 800 12px var(--font-b); cursor: pointer; }
.compat-summary { margin-top: 20px; padding: 18px 20px; border: 1px solid currentColor; border-radius: 14px; background: var(--surface); }
.compat-summary > div { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.compat-summary span, .compat-summary p { color: var(--ink-60); font-size: 12px; }
.compat-summary strong { font-family: var(--font-s); }
.compat-summary p { margin-top: 8px; line-height: 1.6; }
.status-exact { color: #47704b; }
.status-partial { color: var(--accent-strong); }
.status-unsupported, .status-unknown { color: var(--rouge); }
.document-viewer { margin-top: 16px; padding: 16px; border: 1px solid var(--line); border-radius: 14px; background: var(--cream); }
.document-viewer summary { min-height: 44px; display: flex; align-items: center; font-weight: 800; cursor: pointer; }
.document-viewer button { margin: 10px 0; }
.document-viewer pre { max-width: 100%; max-height: 520px; overflow: auto; padding: 14px; border-radius: 10px; background: var(--paper); color: var(--ink); font: 11px/1.65 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
.document-note { margin-top: 14px; color: var(--ink-60); font-size: 12px; line-height: 1.6; }
.copy-feedback { min-height: 20px; margin-top: 10px; color: var(--accent-strong); font-size: 12px; }
</style>
