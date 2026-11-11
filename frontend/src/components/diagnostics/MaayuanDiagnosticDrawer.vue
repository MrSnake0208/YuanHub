<template>
  <Teleport to="body">
    <div class="diagnostic-mask">
      <section ref="panel" class="diagnostic-drawer" role="dialog" aria-modal="true" aria-labelledby="diagnostic-detail-title" tabindex="-1" @keydown="onArrow">
        <header class="diagnostic-drawer-header">
          <h2 id="diagnostic-detail-title">诊断详情</h2>
          <div class="diagnostic-drawer-nav">
            <button type="button" :disabled="position <= 0 || saving" aria-label="上一组（左方向键）" @click="navigate(-1)">上一组</button>
            <button type="button" :disabled="position < 0 || position >= issueIds.length - 1 || saving" aria-label="下一组（右方向键）" @click="navigate(1)">下一组</button>
            <button ref="closeButton" type="button" :disabled="saving" @click="close">关闭</button>
          </div>
        </header>
        <div ref="scrollPanel" class="diagnostic-drawer-body">
          <p v-if="loading" class="diagnostic-state" role="status">正在加载问题详情…</p>
          <p v-else-if="error" class="diagnostic-state diagnostic-error" role="alert">{{ error }} <button type="button" @click="load">重试</button></p>
          <template v-else-if="detail">
            <section class="diagnostic-section diagnostic-conclusion">
              <h3>{{ diagnosticIssueTitle({ ...detail.issue, subjectName }) }}</h3>
              <p>{{ conclusion }}</p>
              <p class="diagnostic-muted">原因：{{ diagnosticReasonLabel(detail.issue) }}</p>
              <span class="diagnostic-badge">{{ diagnosticStatusLabels[detail.issue.status] }}</span>
              <span v-if="detail.issue.status === 'NEW' && detail.issue.regressedAt" class="diagnostic-regressed">修复后复发</span>
              <div v-if="detail.issue.agentAnalysis" class="diagnostic-analysis">
                <h4>AI 分析</h4><p>{{ detail.issue.agentAnalysis.summary }}</p><p>{{ detail.issue.agentAnalysis.suggestedAction }}</p>
                <small>来源：{{ detail.issue.agentAnalysis.source }}<template v-if="detail.issue.agentAnalysis.model"> · {{ detail.issue.agentAnalysis.model }}</template> · {{ formatTime(detail.issue.agentAnalysis.updatedAt) }}</small>
              </div>
            </section>
            <section class="diagnostic-section">
              <h3>处理</h3>
              <div class="diagnostic-actions">
                <router-link v-if="identityIssue" class="diagnostic-primary" to="/operator/admin">去密探目录处理</router-link>
                <button v-if="detail.issue.status !== 'FIXED'" type="button" :disabled="saving" @click="save('FIXED')">标记已修复</button>
                <button v-if="detail.issue.status !== 'IGNORED'" type="button" :disabled="saving" @click="save('IGNORED')">忽略此类</button>
                <button v-if="detail.issue.status !== 'NEW'" type="button" :disabled="saving" @click="save('NEW')">重新打开</button>
              </div>
              <label class="diagnostic-note"><span>处理备注</span><textarea v-model="note" maxlength="4000" rows="3" :disabled="saving" @focus="$event.target.scrollIntoView({ block: 'center', behavior: 'smooth' })" /></label>
              <button type="button" :disabled="saving || !dirty" @click="save(detail.issue.status)">{{ saving ? '正在保存…' : '保存备注' }}</button>
              <p v-if="actionMessage" :class="{ 'diagnostic-error': actionError }" :role="actionError ? 'alert' : 'status'">{{ actionMessage }}</p>
            </section>
            <section v-if="environment.length" class="diagnostic-section">
              <h3>环境</h3><dl class="diagnostic-environment"><div v-for="entry in environment" :key="entry[0]"><dt>{{ entry[0] }}</dt><dd>{{ entry[1] }}</dd></div></dl>
            </section>
            <section class="diagnostic-section">
              <h3>发生记录 <small>累计 {{ detail.issue.eventCount }} 次</small></h3>
              <p v-if="!detail.events.length" class="diagnostic-muted">发生记录已过期（保留 90 天），问题组和处理记录继续保留。</p>
              <div v-else class="diagnostic-event-list" role="group" aria-label="最近发生记录">
                <button v-for="event in detail.events" :key="event.id" type="button" :aria-pressed="selectedEvent === event.id" @click="selectedEvent = event.id">
                  <time :datetime="event.createdAt">{{ formatTime(event.createdAt) }}</time><span>{{ diagnosticLabel(diagnosticResourceLabels, event.summary.resource) || '资源未提供' }} · {{ event.summary.resourceVersion }}</span>
                </button>
              </div>
            </section>
            <MaayuanDiagnosticEvidence v-if="selectedEvent" :key="`${id}:${selectedEvent}`" :event-id="selectedEvent" :issue="detail.issue" :operator-names="detail.operatorNames" />
            <details v-else class="diagnostic-section diagnostic-raw"><summary>原始问题数据</summary><pre tabindex="0">{{ JSON.stringify(detail.issue, null, 2) }}</pre></details>
          </template>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { getDiagnosticIssue, updateDiagnosticIssue } from '@/api/maayuanDiagnostics.js'
import { diagnosticCodeLabels, diagnosticIssueTitle, diagnosticLabel, diagnosticReason, diagnosticReasonLabel, diagnosticResourceLabels, diagnosticStatusLabels, diagnosticUiScriptLabels } from '@/data/maayuanDiagnostics.js'
import { useModalFocus } from '@/composables/useModalFocus.js'
import { useBodyScrollLock } from '@/composables/useBodyScrollLock.js'
import { dialog } from '@/utils/dialog.js'
import MaayuanDiagnosticEvidence from './MaayuanDiagnosticEvidence.vue'

const props = defineProps({ id: { type: String, required: true }, issueIds: { type: Array, required: true } })
const emit = defineEmits(['close', 'navigate', 'updated'])
const panel = ref(null), closeButton = ref(null), scrollPanel = ref(null)
const detail = ref(null), loading = ref(false), error = ref(''), note = ref(''), saving = ref(false)
const actionMessage = ref(''), actionError = ref(false), selectedEvent = ref('')
const open = ref(true)
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
  return reason.hint || diagnosticCodeLabels[issue.code] || '请结合发生记录和证据判断原因。'
})
const environment = computed(() => {
  if (!detail.value) return []
  const issue = detail.value.issue
  const counts = (values, labels) => Object.entries(values || {}).map(([value, count]) => `${diagnosticLabel(labels, value)} ${count} 次`).join('、')
  return [
    ['资源', counts(issue.resourceCounts, diagnosticResourceLabels)], ['界面文字', counts(issue.uiScriptCounts, diagnosticUiScriptLabels)],
    ['涉及密探', (issue.operatorIds || []).map(id => detail.value.operatorNames?.[id] || id).join('、')],
    ['客户端版本', issue.clientVersions?.join('、')], ['资源版本', issue.resourceVersions?.join('、')], ['目录版本', issue.catalogVersions?.join('、')],
    ['用户数（近 90 天）', String(detail.value.userCount)], ['首次出现', formatTime(issue.firstSeenAt)], ['最近出现', formatTime(issue.lastSeenAt)]
  ].filter(([, value]) => value !== '' && value != null)
})
useBodyScrollLock(open)
useModalFocus(open, panel, { initialFocus: () => closeButton.value, onEscape: close })
function formatTime(value) { return value ? new Date(value).toLocaleString('zh-CN') : '' }
async function canLeave() {
  if (saving.value) return false
  return !dirty.value || await dialog.confirm({ title: '放弃未保存的备注？', message: '本次填写的处理备注尚未保存。', confirmText: '放弃备注', cancelText: '继续编辑' })
}
async function close() { if (await canLeave()) emit('close') }
async function navigate(offset) {
  if (position.value < 0) return
  const target = props.issueIds[position.value + offset]
  if (target && await canLeave()) emit('navigate', target)
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
  saving.value = true; actionMessage.value = ''; actionError.value = false
  try {
    const result = await updateDiagnosticIssue(id, { status, note: note.value })
    if (token !== generation) return
    detail.value = result; note.value = result.issue.note || ''; actionMessage.value = '处理记录已保存'; emit('updated')
  } catch (failure) { if (token === generation) { actionError.value = true; actionMessage.value = failure.message || '保存失败，请重试' } }
  finally { if (token === generation) saving.value = false }
}
watch(() => props.id, load, { immediate: true })
onBeforeRouteLeave(canLeave)
onBeforeUnmount(() => { generation++; open.value = false })
</script>
