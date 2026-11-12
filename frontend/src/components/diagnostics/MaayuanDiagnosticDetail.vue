<template>
  <section class="diagnostic-detail" :class="{ 'diagnostic-detail-compact': compact }" aria-labelledby="diagnostic-detail-title" @keydown="onArrow">
    <header class="diagnostic-detail-header">
      <div class="diagnostic-detail-heading">
        <h2 id="diagnostic-detail-title" tabindex="-1">{{ detail ? diagnosticIssueTitle({ ...detail.issue, subjectName }) : '正在加载问题…' }}</h2>
        <span v-if="detail" class="diagnostic-badge">{{ diagnosticStatusLabels[detail.issue.status] }}</span>
        <span v-if="detail?.issue.status === 'NEW' && detail.issue.regressedAt" class="diagnostic-regressed">修复后复发</span>
      </div>
      <div class="diagnostic-detail-nav">
        <button v-if="compact" type="button" :disabled="saving" @click="emit('back')">返回列表</button>
        <span v-if="position >= 0" class="diagnostic-position">{{ position + 1 }} / {{ issueIds.length }}</span>
        <button type="button" :disabled="position <= 0 || saving" aria-label="上一组（左方向键）" @click="navigate(-1)">上一组</button>
        <button type="button" :disabled="position < 0 || position >= issueIds.length - 1 || saving" aria-label="下一组（右方向键）" @click="navigate(1)">下一组</button>
      </div>
    </header>
    <div ref="scrollPanel" class="diagnostic-detail-body">
      <p v-if="loading" class="diagnostic-state" role="status">正在加载问题详情…</p>
      <p v-else-if="error" class="diagnostic-state diagnostic-error" role="alert">{{ error }} <button type="button" @click="load">重试</button></p>
      <template v-else-if="detail">
        <section class="diagnostic-section diagnostic-conclusion">
          <p>{{ conclusion }}</p>
          <div v-if="detail.issue.agentAnalysis" class="diagnostic-analysis">
            <h4>AI 分析</h4><p>{{ detail.issue.agentAnalysis.summary }}</p><p>{{ detail.issue.agentAnalysis.suggestedAction }}</p>
            <small>来源：{{ detail.issue.agentAnalysis.source }}<template v-if="detail.issue.agentAnalysis.model"> · {{ detail.issue.agentAnalysis.model }}</template> · {{ formatTime(detail.issue.agentAnalysis.updatedAt) }}</small>
          </div>
        </section>
        <section class="diagnostic-section">
          <dl class="diagnostic-key-info"><div v-for="entry in keyInfo" :key="entry[0]"><dt>{{ entry[0] }}</dt><dd>{{ entry[1] }}</dd></div></dl>
          <details v-if="environment.length" class="diagnostic-environment-details"><summary>环境详情</summary><dl class="diagnostic-environment"><div v-for="entry in environment" :key="entry[0]"><dt>{{ entry[0] }}</dt><dd>{{ entry[1] }}</dd></div></dl></details>
        </section>
        <section class="diagnostic-section">
          <h3>发生记录</h3>
          <p v-if="!detail.events.length" class="diagnostic-muted">发生记录已过期（保留 90 天），问题组和处理记录继续保留。</p>
          <div v-else class="diagnostic-event-list" :class="{ 'diagnostic-event-list-scroll': detail.events.length > 8 }" role="group" aria-label="最近发生记录">
            <button v-for="event in detail.events" :key="event.id" type="button" :aria-pressed="selectedEvent === event.id" @click="selectedEvent = event.id">
              <time :datetime="event.createdAt" :title="formatTime(event.createdAt)">{{ shortTime(event.createdAt) }}</time><span>{{ diagnosticLabel(diagnosticResourceLabels, event.summary.resource) || '资源未提供' }}</span>
            </button>
          </div>
        </section>
        <MaayuanDiagnosticEvidence v-if="selectedEvent" :key="`${id}:${selectedEvent}`" :event-id="selectedEvent" :issue="detail.issue" :operator-names="detail.operatorNames" />
        <details v-else class="diagnostic-section diagnostic-raw"><summary>原始问题数据</summary><pre tabindex="0">{{ JSON.stringify(detail.issue, null, 2) }}</pre></details>
      </template>
    </div>
    <footer v-if="detail && !loading && !error" class="diagnostic-detail-footer" :aria-busy="saving">
      <label class="diagnostic-note"><span>处理备注</span><textarea v-model="note" maxlength="4000" rows="2" :disabled="saving" @focus="$event.target.scrollIntoView({ block: 'center', behavior: 'smooth' })" /></label>
      <div class="diagnostic-actions">
        <router-link v-if="identityIssue" class="diagnostic-action-link" to="/operator/admin">去密探目录处理</router-link>
        <button v-if="dirty" type="button" :disabled="saving" @click="save(detail.issue.status)">保存备注</button>
        <template v-if="detail.issue.status === 'NEW'">
          <button type="button" :disabled="saving" @click="save('IGNORED')">忽略此类</button>
          <button type="button" class="diagnostic-primary" :disabled="saving" @click="save('FIXED')">标记已修复</button>
        </template>
        <button v-else type="button" :disabled="saving" @click="save('NEW')">重新打开</button>
        <span v-if="saving" role="status">正在保存…</span>
      </div>
      <p v-if="actionMessage" :class="{ 'diagnostic-error': actionError }" :role="actionError ? 'alert' : 'status'">{{ actionMessage }}</p>
    </footer>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { getDiagnosticIssue, updateDiagnosticIssue } from '@/api/maayuanDiagnostics.js'
import { diagnosticCodeLabels, diagnosticIssueTitle, diagnosticLabel, diagnosticReason, diagnosticResourceLabels, diagnosticStatusLabels, diagnosticUiScriptLabels } from '@/data/maayuanDiagnostics.js'
import { dialog } from '@/utils/dialog.js'
import MaayuanDiagnosticEvidence from './MaayuanDiagnosticEvidence.vue'

const props = defineProps({ id: { type: String, required: true }, issueIds: { type: Array, required: true }, compact: { type: Boolean, default: false } })
const emit = defineEmits(['back', 'navigate', 'updated'])
const scrollPanel = ref(null)
const detail = ref(null), loading = ref(false), error = ref(''), note = ref(''), saving = ref(false)
const actionMessage = ref(''), actionError = ref(false), selectedEvent = ref('')
let generation = 0
const position = computed(() => props.issueIds.indexOf(props.id))
const dirty = computed(() => detail.value && note.value !== (detail.value.issue.note || ''))
const identityIssue = computed(() => detail.value?.issue.code === 'identity_unresolved')
const subjectName = computed(() => detail.value?.operatorNames?.[detail.value.issue.subject] || '')
const candidates = computed(() => (detail.value?.issue.candidateOperatorIds || []).map(id => detail.value.operatorNames?.[id] || id).join('、'))
const conclusion = computed(() => {
  if (!detail.value) return ''
  const issue = detail.value.issue
  if (issue.subjectKind === 'ocr_name') {
    if (detail.value.subjectInCatalog === true) return `OCR 读到「${issue.subject}」，目录中已有此名，可能已修复，可标记已修复。`
    const catalogText = detail.value.subjectInCatalog === false ? '密探目录中没有此名' : '暂无法核对密探目录'
    return `OCR 读到「${issue.subject}」，${catalogText}${candidates.value ? `；最接近：${candidates.value}` : ''} → 请核对是否为新密探或别名缺失。`
  }
  const reason = diagnosticReason(issue.reason)
  return reason.hint ? `可能原因：${reason.hint}` : diagnosticCodeLabels[issue.code] || '请结合发生记录和证据判断原因。'
})
const environment = computed(() => {
  if (!detail.value) return []
  const issue = detail.value.issue
  const counts = (values, labels) => Object.entries(values || {}).map(([value, count]) => `${diagnosticLabel(labels, value)} ${count} 次`).join('、')
  return [
    ['资源', counts(issue.resourceCounts, diagnosticResourceLabels)], ['界面文字', counts(issue.uiScriptCounts, diagnosticUiScriptLabels)],
    ['涉及密探', (issue.operatorIds || []).map(id => detail.value.operatorNames?.[id] || id).join('、')],
    ['涉及节点', (issue.nodes || []).join('、')],
    ['客户端版本', issue.clientVersions?.join('、')], ['资源版本', issue.resourceVersions?.join('、')], ['目录版本', issue.catalogVersions?.join('、')],
    ['用户数（近 90 天）', String(detail.value.userCount)], ['首次出现', formatTime(issue.firstSeenAt)], ['最近出现', formatTime(issue.lastSeenAt)]
  ].filter(([, value]) => value !== '' && value != null)
})
const keyInfo = computed(() => detail.value ? [
  ['累计次数', `${detail.value.issue.eventCount} 次`],
  ...environment.value.filter(([label]) => !['客户端版本', '资源版本', '目录版本'].includes(label))
] : [])
function formatTime(value) { return value ? new Date(value).toLocaleString('zh-CN') : '' }
function shortTime(value) { return value ? new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '' }
async function canLeave() {
  if (saving.value) return false
  return !dirty.value || await dialog.confirm({ title: '放弃未保存的备注？', message: '本次填写的处理备注尚未保存。', confirmText: '放弃备注', cancelText: '继续编辑' })
}
function navigate(offset) {
  if (position.value < 0) return
  const target = props.issueIds[position.value + offset]
  if (target) emit('navigate', target)
}
function onArrow(event) {
  if (event.repeat || event.target.closest('input, textarea, select, [contenteditable="true"], pre') || event.altKey || event.ctrlKey || event.metaKey) return
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); void navigate(event.key === 'ArrowLeft' ? -1 : 1) }
}
async function load() {
  const token = ++generation
  loading.value = true; error.value = ''; detail.value = null; selectedEvent.value = ''; actionMessage.value = ''
  try {
    const result = await getDiagnosticIssue(props.id)
    if (token !== generation) return
    detail.value = result; note.value = result.issue.note || ''; selectedEvent.value = result.events[0]?.id || ''
    if (scrollPanel.value) scrollPanel.value.scrollTop = 0
  } catch (failure) { if (token === generation) error.value = failure.status === 403 ? '没有 MaaYuan 诊断的查看权限' : failure.message || '问题详情加载失败' }
  finally { if (token === generation) loading.value = false }
}
async function save(status) {
  if (saving.value || !detail.value) return
  const token = generation, id = props.id
  const next = position.value >= 0 ? props.issueIds[position.value + 1] : null
  const advance = status !== detail.value.issue.status && (status === 'FIXED' || status === 'IGNORED')
  saving.value = true; actionMessage.value = ''; actionError.value = false
  try {
    const result = await updateDiagnosticIssue(id, { status, note: note.value })
    if (token !== generation) return
    detail.value = result; note.value = result.issue.note || ''; actionMessage.value = '处理记录已保存'
    saving.value = false
    if (advance && next) emit('navigate', next)
    emit('updated')
  } catch (failure) { if (token === generation) { actionError.value = true; actionMessage.value = failure.message || '保存失败，请重试' } }
  finally { if (token === generation) saving.value = false }
}
watch(() => props.id, load, { immediate: true })
onBeforeRouteLeave(canLeave)
onBeforeUnmount(() => { generation++ })
defineExpose({ canLeave })
</script>
