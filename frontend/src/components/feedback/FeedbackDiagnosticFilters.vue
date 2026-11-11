<template>
  <form class="diagnostic-filters" aria-label="诊断筛选" @submit.prevent="$emit('apply', { ...draft })">
    <label><span>来源</span><select v-model="draft.source">
      <option value="">全部来源</option><option value="manual">人工反馈</option><option value="maayuan_diagnostic">MaaYuan 诊断</option>
    </select></label>
    <button class="feedback-button" type="submit">应用筛选</button>
    <button class="feedback-button" type="button" @click="reset">清除诊断筛选</button>
    <details class="diagnostic-advanced">
      <summary>按错误码、密探或版本筛选</summary>
      <div class="diagnostic-fields">
        <label><span>错误码</span><input v-model="draft.issueCode" list="diagnostic-issue-codes" maxlength="100" placeholder="全部错误码" /></label>
        <label><span>密探 ID</span><input v-model="draft.operatorId" list="diagnostic-operators" maxlength="100" placeholder="char_xxx" /></label>
        <label><span>资源版本</span><input v-model="draft.resourceVersion" list="diagnostic-versions" maxlength="100" placeholder="全部版本" /></label>
      </div>
    </details>
    <datalist id="diagnostic-issue-codes"><option v-for="(count, value) in counts.issue_code" :key="value" :value="value">{{ count }} 条</option></datalist>
    <datalist id="diagnostic-operators"><option v-for="(count, value) in counts.operator_id" :key="value" :value="value">{{ count }} 条</option></datalist>
    <datalist id="diagnostic-versions"><option v-for="(count, value) in counts.resource_version" :key="value" :value="value">{{ count }} 条</option></datalist>
    <p v-if="counts.source" class="feedback-result-meta" role="status">
      当前筛选：人工 {{ counts.source.manual ?? 0 }} 条 · MaaYuan 诊断 {{ counts.source.maayuan_diagnostic ?? 0 }} 条
      <span v-for="(count, outcome) in counts.outcome" :key="outcome"> · {{ outcomeLabels[outcome] || outcome }} {{ count }} 条</span>
    </p>
  </form>
</template>

<script setup>
import { reactive, watch } from 'vue'

const props = defineProps({ modelValue: { type: Object, required: true }, counts: { type: Object, default: () => ({}) } })
const emit = defineEmits(['apply'])
const draft = reactive({ ...props.modelValue })
const outcomeLabels = { failed: '采集失败', upload_failed: '上传失败', data_review: '待核对' }
watch(() => props.modelValue, value => Object.assign(draft, value))
function reset() { emit('apply', { source: '', issueCode: '', operatorId: '', resourceVersion: '' }) }
</script>

<style scoped>
.diagnostic-filters { display: flex; flex-wrap: wrap; align-items: end; gap: 10px; margin: 12px 0; }
.diagnostic-filters label { display: grid; flex: 1 1 160px; min-width: 0; gap: 5px; font-size: 12px; }
.diagnostic-filters input, .diagnostic-filters select { width: 100%; min-width: 0; min-height: 38px; padding: 8px; font: inherit; color: inherit; background: var(--surface); border: 1px solid var(--theme-line, #d6c9ad); border-radius: 6px; }
.diagnostic-filters p { flex-basis: 100%; margin: 0; overflow-wrap: anywhere; }
.diagnostic-advanced { flex-basis: 100%; font-size: 12px; }
.diagnostic-advanced summary { cursor: pointer; }
.diagnostic-fields { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; }
@media (max-width: 480px) { .diagnostic-filters label { flex-basis: 100%; } }
</style>
