<template>
  <section class="diagnostic-section" aria-label="识别轨迹">
    <h3>识别轨迹 <small>最近 {{ trace.length }} 步</small></h3>
    <p v-if="!trace.length" class="diagnostic-muted">本次上报未包含识别轨迹。</p>
    <ol v-else class="diagnostic-trace">
      <li v-for="(step, index) in trace" :key="index" :class="{ 'diagnostic-trace-failure': highlighted.has(index) }">
        <div class="diagnostic-trace-meta">
          <span class="diagnostic-number">+{{ (step.t / 1000).toFixed(3) }} s</span>
          <span>{{ diagnosticLabel(diagnosticStageLabels, step.stage) }}</span>
          <span>{{ step.kind === 'reco' ? '识别' : '动作' }}<template v-if="step.algo"> · {{ step.algo }}</template></span>
        </div>
        <strong>{{ step.node }}</strong>
        <div class="diagnostic-trace-result">
          <span :class="{ 'diagnostic-error': !step.hit }">{{ step.kind === 'reco' ? (step.hit ? '命中' : '未命中') : (step.hit ? '成功' : '失败') }}</span>
          <span>×{{ step.n }}</span>
          <span v-if="step.score != null">最高分 {{ Number(step.score).toFixed(3) }}</span>
          <span v-if="step.dt != null">持续 {{ step.dt }} ms</span>
          <span v-if="highlighted.has(index)" class="diagnostic-badge">问题关联的最后未命中</span>
          <span v-if="frameSteps.has(index)" class="diagnostic-badge">对应画面</span>
        </div>
        <p v-if="step.text">OCR：{{ step.text }}</p>
      </li>
    </ol>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { diagnosticLabel, diagnosticStageLabels } from '@/data/maayuanDiagnostics.js'

const props = defineProps({
  trace: { type: Array, default: () => [] },
  issues: { type: Array, default: () => [] },
  issue: { type: Object, default: () => ({}) },
  images: { type: Array, default: () => [] }
})
const frameSteps = computed(() => new Set(props.images.filter(image => image.role === 'last_frame' && image.traceIndex != null).map(image => image.traceIndex)))
const highlighted = computed(() => {
  const indices = new Set()
  for (const issue of props.issues) {
    if (!issue.node) continue
    const group = props.issue
    if (group.subjectKind === 'node' && issue.node !== group.subject) continue
    if (group.subjectKind === 'stage' && issue.stage !== group.subject) continue
    if (group.subjectKind === 'operator' && !(issue.operatorIds || []).includes(group.subject)) continue
    if (group.subjectKind === 'ocr_name' && issue.ocrSamples?.[0] !== group.subject) continue
    for (let index = props.trace.length - 1; index >= 0; index--) {
      const step = props.trace[index]
      if (step.kind === 'reco' && !step.hit && step.node === issue.node && step.stage === issue.stage) {
        indices.add(index)
        break
      }
    }
  }
  return indices
})
</script>

<style scoped>
.diagnostic-trace { margin: 0; padding: 0; list-style: none; }
.diagnostic-trace li { padding: 12px; border: 1px solid var(--line); border-radius: 6px; margin-top: 8px; overflow-wrap: anywhere; }
.diagnostic-trace .diagnostic-trace-failure { background: var(--cream); border-color: var(--theme-danger-text, var(--rouge)); }
.diagnostic-trace-meta, .diagnostic-trace-result { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; font-size: 12px; line-height: 1.7; }
.diagnostic-trace-meta { color: var(--ink-60); margin-bottom: 4px; }
.diagnostic-trace strong { display: block; font-size: 13px; margin-bottom: 4px; }
.diagnostic-trace p { font-size: 13px; }
</style>
