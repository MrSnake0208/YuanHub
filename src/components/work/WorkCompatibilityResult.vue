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
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.state-note { color: var(--ink-60); }
.target-error { color: var(--rouge); }
button { border: 1px solid var(--tea); border-radius: 999px; background: var(--tea); color: var(--cream); cursor: pointer; }
.compat-summary { border: 1px solid currentColor; border-radius: 14px; background: var(--surface); }
.compat-summary span, .compat-summary p { color: var(--ink-60); }
.status-exact { color: #47704b; }
.status-partial { color: var(--accent-strong); }
.status-unsupported, .status-unknown { color: var(--rouge); }
.document-viewer { border: 1px solid var(--line); border-radius: 14px; background: var(--cream); }
.document-viewer summary { cursor: pointer; }
.document-viewer pre { border-radius: 10px; background: var(--paper); color: var(--ink); }
.document-note { color: var(--ink-60); }
.copy-feedback { color: var(--accent-strong); }
</style>
<style scoped src="./workCompatibilityResultDesktop.css"></style>
<style scoped src="./workCompatibilityResultMobile.css"></style>
