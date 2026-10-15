<template>
  <section v-show="open" class="exchange-card" aria-labelledby="recruitment-exchange-title">
    <div class="exchange-heading"><span class="archive-mark" aria-hidden="true"><ArrowLeftRight :size="16" aria-hidden="true" /></span><div><h2 id="recruitment-exchange-title">导入与导出</h2><p class="hint">将招募记录整理到当前账号</p></div></div>
    <div class="actions">
      <button ref="importButton" class="primary" type="button" :disabled="!canImport || loading || committing || !!submittedIntent" @click="fileInput.value = ''; fileInput.click()">导入 JSON</button>
      <button type="button" :disabled="!canImport || loading || committing || !!submittedIntent" @click="openPaste">粘贴 JSON</button>
      <input ref="fileInput" class="file-input" type="file" aria-label="选择招募记录 JSON" accept=".json,application/json" :disabled="!canImport || loading || committing || !!submittedIntent" @change="selectFile">
      <details ref="exportMenu" class="export-menu"><summary>{{ exporting ? '正在导出…' : '导出' }}</summary><div class="export-options"><button type="button" :disabled="!canExport || exporting" @click="exportFile('json')">下载完整备份（JSON）<small>用于恢复招募档案</small></button><button type="button" :disabled="!canExport || exporting" @click="exportFile('csv')">导出表格（CSV）<small>用于查看和分析</small></button></div></details>
      <button v-if="documentData || submittedIntent || pastedText" type="button" class="text-button" :disabled="committing" @click="resumeImport">继续导入</button>
    </div>
    <button class="text-button guide-link" type="button" :disabled="!game || guideLoading" @click="downloadGuide">{{ guideLoading ? '正在获取规范…' : '获取 AI 导入规范' }}</button>
    <p v-if="readOnly" class="hint">当前账号暂不能导入，仍可导出。</p>
    <p v-if="error && !dialogOpen" ref="errorPanel" class="error" role="alert" tabindex="-1">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <Teleport to="body">
      <div v-if="dialogOpen" class="exchange-mask" @click.self="closeDialog">
        <section ref="panel" class="exchange-dialog" role="dialog" aria-modal="true" aria-labelledby="import-dialog-title" tabindex="-1" :aria-busy="loading || committing">
          <header class="dialog-header"><div><p class="eyebrow">招募档案</p><h2 id="import-dialog-title">{{ success ? '导入完成' : pasteMode ? '粘贴 JSON' : '导入招募记录' }}</h2></div><button class="close-button" type="button" aria-label="关闭导入弹窗" :disabled="committing" @click="closeDialog"><X :size="16" aria-hidden="true" /></button></header>
          <div class="dialog-body">
            <template v-if="success"><p class="success-mark" aria-hidden="true"><CircleCheck :size="32" aria-hidden="true" /></p><h3>已导入 {{ success.events }} 条招募记录</h3><p v-if="success.other">另有 {{ success.other }} 项批次或档案信息已导入。</p><p v-if="success.duplicates">{{ success.duplicates }} 项已有内容未重复添加。</p><p v-if="success.skipped">{{ success.skipped }} 项内容未导入，已保留现有档案。</p></template>
            <template v-else-if="pasteMode">
              <form id="recruitment-paste-form" @submit.prevent="previewPaste">
                <label class="paste-label" for="recruitment-paste-input">JSON 内容</label>
                <p id="recruitment-paste-hint" class="hint">粘贴 AI 返回的完整 JSON，也支持单个 JSON 代码块。</p>
                <textarea id="recruitment-paste-input" ref="pasteInput" v-model="pastedText" class="paste-input" aria-describedby="recruitment-paste-hint" :disabled="loading || committing" spellcheck="false" autocomplete="off" placeholder="在这里粘贴 JSON" />
              </form>
              <p v-if="error" ref="errorPanel" class="error" role="alert" tabindex="-1">{{ error }}</p>
            </template>
            <template v-else>
              <button v-if="pastedText && !submittedIntent" class="text-button" type="button" :disabled="loading || committing" @click="editPaste">修改粘贴内容</button>
              <p class="file-caption">{{ filename }}<span>{{ game }} · 目标：{{ accountName || '当前游戏账号' }}</span></p>
              <p v-if="documentData?.source_account?.account_id && documentData.source_account.account_id !== accountId" class="hint">备份来自另一游戏账号，请确认要导入到此账号。</p>
              <p v-if="loading" class="loading-message" role="status">正在核对文件中的招募记录…</p>
              <form v-if="documentData" @submit.prevent="generatePreview">
                <label v-if="!recordsOnly" class="restore-option">恢复状态<select v-model="options.state_strategy" :disabled="!canImport || loading || committing || !!submittedIntent"><option value="keep_current">保留当前状态（空档案使用备份状态）</option><option value="use_backup">使用备份中的进度、基准与心愿</option></select></label>
                <div v-if="options.confirm_count_change || preview?.items.some(item => item.status === 'count_overlap') || (!recordsOnly && options.state_strategy === 'use_backup' && preview?.items.some(item => item.entity_type === 'state' && item.status === 'add'))" class="overlap-warning"><p>{{ !recordsOnly && options.state_strategy === 'use_backup' ? '备份进度将替换现有进度，同时替换心愿密探，请核对抽数与选择变化。' : '部分记录可能已计入现有抽数，请先核对下方明细。' }}</p><label class="check"><input v-model="options.confirm_count_change" type="checkbox" :disabled="!canImport || loading || committing || !!submittedIntent">{{ !recordsOnly && options.state_strategy === 'use_backup' ? '我已核对，确认使用备份进度、心愿及本次抽数变化' : '我已核对，确认这些记录不会重复计数' }}</label></div>
                <button v-if="!loading && (!preview || expired) && !submittedIntent" type="submit" :disabled="!canImport || committing">{{ expired ? '更新预览' : '重新核对' }}</button>
              </form>
              <section v-if="preview" class="preview" aria-label="导入预览">
                <div class="import-summary"><div><strong>{{ eventCount }}</strong><span>条新增记录</span></div><div><strong>{{ duplicateEvents }}</strong><span>条已有记录</span></div></div>
                <p v-if="otherCount" class="hint">另有 {{ otherCount }} 项批次或档案信息将导入。</p>
                <p class="total-change">已知累计抽数 <span>{{ preview.current_known_total }} <span aria-label="变为">→</span> <strong>{{ preview.candidate_known_total }}</strong> 抽</span></p>
                <p v-if="!preview.stats.added && !preview.stats.conflicts && !preview.stats.skipped" class="hint">这些记录已在档案中，无需再次导入。</p>
                <p v-if="preview.stats.conflicts || preview.stats.skipped" class="hint">{{ preview.stats.conflicts }} 项冲突 · {{ preview.stats.skipped }} 项跳过；保留现有内容。</p>
                <ul v-if="preview.risks.length" class="risks"><li v-for="risk in preview.risks" :key="risk">{{ risk }}</li></ul>
                <p v-if="!preview.can_commit" class="error" role="alert">请先处理需要确认的内容。</p>
                <p v-if="expired" class="error" role="status">预览已过期，请更新后确认。</p>
                <h3 class="list-title">{{ showAll ? '全部导入明细' : '本次导入内容' }}</h3>
                <ol class="preview-items"><li v-for="item in visibleItems" :key="item.entity_type + ':' + item.id"><div><strong>{{ itemName(item) }}</strong><span>{{ statusLabel(item.status) }}</span></div><p v-if="item.status !== 'add' && item.status !== 'duplicate'">{{ item.reason }}</p></li></ol>
                <button v-if="preview.items.length > 5" class="text-button" type="button" :aria-expanded="showAll" @click="showAll = !showAll; previewPage = 0">{{ showAll ? '收起明细' : '查看全部 ' + preview.items.length + ' 项明细' }}</button>
                <div v-if="showAll && preview.items.length > 50" class="actions"><button type="button" :disabled="previewPage === 0" @click="previewPage--">上一页</button><span>{{ previewPage + 1 }} / {{ Math.ceil(preview.items.length / 50) }}</span><button type="button" :disabled="(previewPage + 1) * 50 >= preview.items.length" @click="previewPage++">下一页</button></div>
              </section>
              <div v-if="submittedIntent?.status === 'retry'" class="retry-intent" role="status"><p>正在等待确认导入结果，请查询本次结果，无需重新上传。</p><button type="button" :disabled="!canImport || committing" @click="retryCommit">{{ committing ? '正在确认结果…' : '重试上次导入' }}</button></div>
              <p v-if="error" ref="errorPanel" class="error" role="alert" tabindex="-1">{{ error }}</p>
            </template>
          </div>
          <footer class="dialog-footer"><button v-if="success" class="primary" type="button" @click="closeDialog(); emit('update:open', false)">返回招募档案</button><template v-else><button type="button" :disabled="committing" @click="closeDialog">取消</button><button v-if="pasteMode" class="primary" type="submit" form="recruitment-paste-form" :disabled="!canImport || !pastedText.trim() || loading || committing">核对内容</button><button v-else-if="preview" class="primary" type="button" :disabled="!canImport || !preview.can_commit || !preview.stats.added || expired || loading || committing || !!submittedIntent" @click="commit">{{ committing ? '正在导入…' : eventCount ? '导入 ' + eventCount + ' 条记录' : '确认导入档案信息' }}</button></template></footer>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<script setup>
import { ArrowLeftRight, CircleCheck, X } from '@lucide/vue'
import { useModalFocus } from '../../composables/useModalFocus.js'
import { computed, nextTick, onScopeDispose, reactive, ref, watch } from 'vue'
import { commitRecruitmentImport, exportRecruitment, previewRecruitmentImport, getRecruitmentCatalog } from '../../api/recruitment.js'
import { getOperatorCatalog } from '../../api/operator.js'
import { RECORD_IMPORT_SCHEMA, recruitmentImportGuide } from './recruitmentImportGuide.js'
import { downloadFile, MAX_IMPORT_BYTES, recruitmentCsv } from './rules.js'
const props = defineProps({ open: Boolean, accountId: String, accountName: String, identity: String, revision: Number, game: String, readOnly: Boolean, busy: Boolean, contextVersion: Number, requestVersion: Number })
const emit = defineEmits(['committed', 'busy', 'update:open'])
const documentData = ref(null), filename = ref(''), preview = ref(null), previewPage = ref(0), loading = ref(false), exporting = ref(false), committing = ref(false), error = ref(''), notice = ref(''), fileInput = ref(null), errorPanel = ref(null), expired = ref(false)
const pasteMode = ref(false), pastedText = ref(''), pasteInput = ref(null)
const dialogOpen = ref(false), panel = ref(null), exportMenu = ref(null), importButton = ref(null), success = ref(null), showAll = ref(false)
watch(dialogOpen, (visible, _, onCleanup) => {
  if (!visible) return
  const bodyOverflow = document.body.style.overflow, rootOverflow = document.documentElement.style.overflow
  document.body.style.overflow = document.documentElement.style.overflow = 'hidden'
  onCleanup(() => { document.body.style.overflow = bodyOverflow; document.documentElement.style.overflow = rootOverflow })
})
useModalFocus(dialogOpen, panel, { initialFocus: () => pasteMode.value ? pasteInput.value : panel.value, onEscape: closeDialog })
function closeDialog() {
  if (committing.value) return
  dialogOpen.value = false
  if (!submittedIntent.value) { clearPreview(); loading.value = false }
}
function openPaste() {
  if (!canImport.value || loading.value || committing.value || submittedIntent.value) return
  clearPreview(); documentData.value = null; success.value = null; error.value = ''; notice.value = ''
  pasteMode.value = true; dialogOpen.value = true
}
async function editPaste() {
  openPaste()
  await nextTick(); pasteInput.value?.focus()
}
async function previewPaste() {
  if (!canImport.value || loading.value || committing.value || submittedIntent.value || !pastedText.value.trim()) return
  clearPreview(); error.value = ''; documentData.value = null
  const token = capture()
  try {
    await readImport(pastedText.value, '粘贴的 JSON', token, true)
  } catch (failure) { if (matches(token)) await showError(failure.message || '无法读取粘贴内容') }
}
async function resumeImport() {
  success.value = null; dialogOpen.value = true
  if (!submittedIntent.value && !pasteMode.value) await generatePreview()
}
const submittedIntent = ref(null), guideLoading = ref(false)
const recordsOnly = computed(() => documentData.value?.schema === RECORD_IMPORT_SCHEMA)
const options = reactive({ state_strategy: 'keep_current', confirm_count_change: false })
const canExport = computed(() => !!props.identity && !!props.accountId && !props.busy)
const canImport = computed(() => canExport.value && !props.readOnly)
async function openImport() {
  if (!canImport.value) return
  emit('update:open', true)
  await nextTick()
  importButton.value?.focus()
}
defineExpose({ openImport, hasDraft: () => !!documentData.value || !!submittedIntent.value || !!pastedText.value, isBusy: () => committing.value || loading.value })
const deletedEventIds = computed(() => new Set(documentData.value?.events.filter(event => event.deleted_at).map(event => event.event_id) || []))
const eventCount = computed(() => preview.value?.items.filter(item => item.entity_type === 'event' && item.status === 'add' && !deletedEventIds.value.has(item.id)).length || 0)
const duplicateEvents = computed(() => preview.value?.items.filter(item => item.entity_type === 'event' && item.status === 'duplicate').length || 0)
const otherCount = computed(() => (preview.value?.stats.added || 0) - eventCount.value)
const visibleItems = computed(() => preview.value?.items.slice(showAll.value ? previewPage.value * 50 : 0, showAll.value ? (previewPage.value + 1) * 50 : 5) || [])
const itemNames = computed(() => {
  const names = new Map(), document = documentData.value
  if (!document) return names
  if (document.schema === RECORD_IMPORT_SCHEMA) return names
  for (const pool of document.pools) names.set('pool:' + pool.pool_id, pool.snapshot.name)
  for (const agent of document.temporary_agents) names.set('agent:' + agent.agent_id, agent.name)
  for (const event of document.events) names.set('event:' + event.event_id, (names.get('pool:' + event.pool_id) || '历史卡池') + ' · ' + event.agent_snapshot.name + (event.deleted_at ? '（删除标记）' : '') + ' · ' + (event.agent_snapshot.rarity === 4 ? '4星计次' : event.pull_span == null ? '抽数未知' : event.pull_span + ' 抽'))
  for (const batch of document.batches) names.set('batch:' + batch.batch_id, '计数批次 · ' + batch.total_pull_count + ' 抽')
  return names
})
let generation = 0, alive = true, expiryTimer = null, requestId = '', binding = null
const capture = () => ({ generation, identity: props.identity, accountId: props.accountId, contextVersion: props.contextVersion, game: props.game })
const sameOwner = token => alive && token.identity === props.identity && token.accountId === props.accountId && token.contextVersion === props.contextVersion && token.game === props.game
const matches = token => sameOwner(token) && token.generation === generation
function clearPreview() { generation++; preview.value = null; binding = null; requestId = ''; expired.value = false; previewPage.value = 0; clearTimeout(expiryTimer) }
watch([() => props.identity, () => props.accountId, () => props.contextVersion, () => props.game], () => {
  dialogOpen.value = false; success.value = null; pasteMode.value = false; pastedText.value = ''; clearPreview(); submittedIntent.value = null; documentData.value = null; filename.value = ''; error.value = ''; notice.value = ''; loading.value = false; committing.value = false; exporting.value = false; options.state_strategy = 'keep_current'; options.confirm_count_change = false
  if (fileInput.value) fileInput.value.value = ''
})
watch([() => props.revision, () => props.requestVersion, () => props.readOnly], () => { clearPreview(); loading.value = false })
watch([() => options.state_strategy, () => options.confirm_count_change], async () => {
  clearPreview(); submittedIntent.value = null
  if (dialogOpen.value && documentData.value && !loading.value) await generatePreview()
})
async function showError(message) { error.value = message; await nextTick(); errorPanel.value?.focus() }
async function selectFile(event) {
  if (committing.value || submittedIntent.value) return
  clearPreview(); documentData.value = null; notice.value = ''; error.value = ''; success.value = null; showAll.value = false
  const file = event.target.files?.[0], token = capture()
  if (!file || !canImport.value) return
  try {
    if (file.size > MAX_IMPORT_BYTES) throw new Error('文件超过 5 MiB，请选择完整且符合限制的招募档案备份')
    const text = await file.text()
    if (!matches(token)) return
    pastedText.value = ''; pasteMode.value = false
    await readImport(text, file.name, token)
  } catch (failure) { if (matches(token)) await showError(failure.message || '无法读取此备份') }
}
async function readImport(text, name, token, allowCodeBlock = false) {
  if (new Blob([text]).size > MAX_IMPORT_BYTES) throw new Error('内容超过 5 MiB，请精简后重新导入')
  let content = text.replace(/^\uFEFF/, '').trim()
  if (allowCodeBlock && content.startsWith('```')) {
    const block = content.match(/^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i)
    if (!block) throw new Error('请只复制一个完整 JSON 代码块，不要包含解释文字或多个代码块')
    content = block[1]
  }
  let data
  try { data = JSON.parse(content) }
  catch { throw new Error('JSON 格式不完整或包含额外文字，请重新复制完整 JSON；不要包含解释、多个 JSON 或省略号') }
  const recordImport = data?.schema === RECORD_IMPORT_SCHEMA
  if (!Array.isArray(data?.events) || (recordImport
    ? data.batches !== undefined && !Array.isArray(data.batches)
    : data?.schema !== 'yuanhub.recruitment.v1' || !Array.isArray(data.batches) || !Array.isArray(data.pools) || !Array.isArray(data.temporary_agents))) throw new Error('请选择符合导入规范的记录 JSON 或完整备份；CSV 和规范说明文件不能直接导入')
  if (data.game !== props.game) throw new Error('文件游戏与当前账号不一致，请切换到对应游戏账号')
  if (data.events.length > 20000) throw new Error('备份超过 20,000 条结果，不能部分导入')
  options.state_strategy = 'keep_current'; options.confirm_count_change = false
  await nextTick()
  if (!sameOwner(token)) return
  documentData.value = data; filename.value = name; pasteMode.value = false
  await nextTick()
  if (!sameOwner(token)) return
  dialogOpen.value = true
  await nextTick(); panel.value?.focus()
  await generatePreview()
}

async function downloadGuide() {
  if (!props.game || guideLoading.value) return
  const token = capture(); guideLoading.value = true; error.value = ''; notice.value = ''
  try {
    const [catalog, operators] = await Promise.all([getRecruitmentCatalog(token.game), getOperatorCatalog()])
    if (!sameOwner(token)) return
    const guide = recruitmentImportGuide(token.game, catalog, operators)
    downloadFile(JSON.stringify(guide, null, 2), 'YuanHub-招募档案导入规范-' + token.game + '.json', 'application/json;charset=utf-8')
    notice.value = '已下载导入规范和当前公共目录，请交给 AI 与原始资料一起使用'
  } catch (failure) { if (sameOwner(token)) await showError(failure.message || '获取目录失败，请稍后重试') }
  finally { guideLoading.value = false }
}
async function exportFile(format) {
  if (!canExport.value || exporting.value) return
  if (exportMenu.value) exportMenu.value.open = false
  const token = capture(); exporting.value = true; error.value = ''; notice.value = ''
  try {
    const document = await exportRecruitment(token.accountId)
    if (!sameOwner(token)) return
    const accountName = (props.accountName || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 48) || '未命名账号'
    const filename = 'YuanHub-' + (format === 'json' ? '招募档案完整备份-' : '招募记录表格-') + token.game + '-' + accountName + '.' + format
    if (format === 'json') {
      const json = JSON.stringify(document)
      if (new Blob([json]).size > MAX_IMPORT_BYTES || document.events.length > 20000) throw new Error('快照超过可恢复备份的 5 MiB / 20,000 条结果限制，未生成截断文件')
      downloadFile(json, filename, 'application/json;charset=utf-8')
    }
    else downloadFile(recruitmentCsv({ accountId: document.source_account.account_id, accountName: props.accountName, game: document.game, baseline: document.baseline, pools: document.pools, events: document.events, batches: document.batches }), filename, 'text/csv;charset=utf-8')
    notice.value = format === 'json' ? '已下载完整备份，可用于恢复' : '已导出表格，用于查看和分析'
  } catch (failure) { if (sameOwner(token)) await showError(failure.message || '导出失败') }
  finally { if (sameOwner(token)) exporting.value = false }
}
async function generatePreview() {
  if (!canImport.value || !documentData.value || loading.value || committing.value || submittedIntent.value) return
  clearPreview(); const token = capture(), document = documentData.value, selectedOptions = { ...options }, revision = props.revision
  loading.value = true; error.value = ''; notice.value = ''
  try {
    const response = await previewRecruitmentImport({ accountId: token.accountId, document, options: selectedOptions })
    if (!matches(token)) return
    if (response.target_revision !== revision) { emit('committed'); await showError('云端档案已变化，请刷新后重新预览'); return }
    preview.value = response; binding = { token, document, options: selectedOptions, revision, documentHash: response.document_hash, previewToken: response.preview_token }
    requestId = crypto.randomUUID()
    const remaining = Date.parse(response.expires_at) - Date.now()
    expired.value = !Number.isFinite(remaining) || remaining <= 0
    if (!expired.value) expiryTimer = setTimeout(() => { expired.value = true }, remaining)
  } catch (failure) { if (matches(token)) await showError(failure.message || '预览失败') }
  finally { if (matches(token)) loading.value = false }
}
async function commit() {
  const approved = binding
  if (!canImport.value || committing.value || expired.value || Date.now() >= Date.parse(preview.value?.expires_at) || !preview.value?.can_commit || !preview.value?.stats.added || !approved || !matches(approved.token) || approved.revision !== props.revision) return
  submittedIntent.value = { ...approved, requestId, status: 'sending', result: { events: eventCount.value, other: otherCount.value, duplicates: preview.value.stats.duplicates, skipped: preview.value.stats.conflicts + preview.value.stats.skipped } }
  return submitIntent()
}
async function retryCommit() {
  if (!canImport.value || committing.value || !submittedIntent.value || !sameOwner(submittedIntent.value.token)) return
  return submitIntent()
}
async function submitIntent() {
  const approved = submittedIntent.value
  approved.status = 'sending'
  committing.value = true; emit('busy', true); error.value = ''; notice.value = ''
  try {
    await commitRecruitmentImport({ accountId: approved.token.accountId, document: approved.document, options: approved.options, previewToken: approved.previewToken, documentHash: approved.documentHash, expectedRevision: approved.revision, requestId: approved.requestId })
    if (!sameOwner(approved.token) || submittedIntent.value !== approved) return
    success.value = approved.result; pastedText.value = ''; pasteMode.value = false; submittedIntent.value = null; clearPreview(); documentData.value = null; filename.value = ''; if (fileInput.value) fileInput.value.value = ''; notice.value = '导入已完成'; emit('committed')
  } catch (failure) {
    if (!sameOwner(approved.token) || submittedIntent.value !== approved) return
    if (failure.status === 409) { submittedIntent.value = null; clearPreview(); emit('committed'); await showError('档案或预览已变化，请重新生成预览后导入') }
    else if (failure.status >= 400 && failure.status < 500 && failure.status !== 408) { submittedIntent.value = null; await showError(failure.message || '导入请求被拒绝') }
    else { approved.status = 'retry'; await showError((failure.message || '网络异常') + '。响应未确认，可重试上次导入。') }
  } finally { if (sameOwner(approved.token)) { committing.value = false; emit('busy', false) } }
}
const statusLabel = status => ({ add: '新增', duplicate: '已有相同内容', conflict: '冲突，保留当前', skip: '跳过', count_overlap: '可能重复计数' })[status] || status
function itemName(item) {
  return item.display_name || itemNames.value.get(item.entity_type + ':' + item.id) || ({ pool: '卡池', agent: '临时密探', event: '绝密记录', batch: '计数批次', state: '基准、进度与当前池' })[item.entity_type]
}
onScopeDispose(() => { alive = false; generation++; clearTimeout(expiryTimer) })
</script>

<style scoped>
.exchange-card,.exchange-dialog{background:var(--surface);color:var(--ink);border:1px solid var(--line)}
h2,h3{font-family:var(--font-s)}h2,p{margin:0}button,summary,select{font:inherit}button,summary{cursor:pointer}button{border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--ink);padding:10px 16px}button:disabled{opacity:.5;cursor:not-allowed}button.primary{background:var(--tea);color:var(--cream);border-color:var(--tea)}button.text-button{border:0;background:transparent;padding:4px 0;color:var(--tea);text-decoration:underline;text-underline-offset:4px}.hint,.file-caption,.eyebrow{color:var(--ink-60)}.file-input{display:none}.archive-mark{border:1px solid var(--line);border-radius:12px;background:var(--cream);font-size:26px}.export-menu{position:relative}.export-menu summary{border:1px solid var(--line);border-radius:10px;padding:10px 18px}.export-options{position:absolute;inset-inline-end:0;top:calc(100% + 8px);z-index:var(--z-popover);background:var(--surface);border:1px solid var(--line);border-radius:12px;box-shadow:0 12px 32px #493b2c18;min-width:220px;padding:6px}.export-options button{display:block;width:100%;text-align:left;border:0}.export-options small{display:block;color:var(--ink-60);margin-top:4px}.exchange-mask{position:fixed;inset:0;z-index:var(--z-overlay-panel);background:#30271f66;overscroll-behavior:contain}.exchange-dialog{box-shadow:0 24px 80px #30271f33;animation:exchange-enter 180ms ease-out}.dialog-header,.dialog-footer{background:var(--surface)}.dialog-header{border-bottom:1px solid var(--line)}.dialog-footer{border-top:1px solid var(--line)}.close-button{border:0;font-size:24px;background:transparent}.import-summary strong{font-variant-numeric:tabular-nums;font-weight:500}.total-change{background:var(--cream);border-radius:10px;font-variant-numeric:tabular-nums}.preview-items{list-style:none;padding:0}.preview-items li{border-bottom:1px solid var(--line)}.preview-items strong{font-weight:500}.preview-items span{color:var(--ink-60);font-size:12px;white-space:nowrap}.error,.risks{color:var(--rouge)}.overlap-warning{background:var(--cream);border-inline-start:3px solid var(--rouge);padding:12px}.success-mark{color:var(--tea);font-size:36px}.restore-option select{border:1px solid var(--line);border-radius:8px;background:var(--cream);color:var(--ink);padding:10px;max-width:100%}button:focus-visible,summary:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid var(--accent);outline-offset:3px}@keyframes exchange-enter{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@media(prefers-reduced-motion:reduce){.exchange-dialog{animation:none}}
.paste-label{display:block;margin-top:18px;font-weight:600}.paste-input{display:block;box-sizing:border-box;width:100%;resize:vertical;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--cream);color:var(--ink);font:14px/1.6 monospace}
</style>
<style scoped src="./recruitmentExchangeDesktop.css"></style>
<style scoped src="./recruitmentExchangeMobile.css"></style>
