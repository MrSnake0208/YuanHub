<template>
  <section v-show="open" class="exchange-card" aria-labelledby="recruitment-exchange-title">
    <h2 id="recruitment-exchange-title">备份与恢复</h2>
    <p class="hint">JSON 保存完整档案与删除记录，可用于恢复。CSV 用于阅读和分析，不能导入恢复。导出从云端获取同一版本的完整快照。</p>
    <div class="actions"><button type="button" :disabled="!canExport || exporting" @click="exportFile('json')">{{ exporting ? '导出中…' : '导出完整 JSON' }}</button><button type="button" :disabled="!canExport || exporting" @click="exportFile('csv')">导出 CSV</button></div>
    <p v-if="readOnly" class="hint">游戏快照不一致，仍可导出，暂不能导入。</p>
    <form @submit.prevent="generatePreview">
      <label>选择招募档案 JSON（最多 5 MiB / 20,000 条结果）<input ref="fileInput" type="file" accept=".json,application/json" :disabled="!canImport || loading || committing" @change="selectFile"></label>
      <template v-if="documentData">
        <p class="hint">已选择 {{ filename }} · {{ documentData.game }} · {{ documentData.events.length }} 条结果。目标：{{ accountName || '当前游戏账号' }}。</p>
        <p v-if="documentData.source_account.account_id !== accountId" class="hint">备份来自另一游戏账号，将按稳定记录身份合并到当前账号。请核对数据归属。</p>
        <label>基准、进度与当前池的处理<select v-model="options.state_strategy" :disabled="!canImport || loading || committing"><option value="keep_current">保留当前状态（空档案恢复备份状态）</option><option value="use_backup">使用备份中的基准、进度与当前池</option></select></label>
        <label class="check"><input v-model="options.confirm_count_change" type="checkbox" :disabled="!canImport || loading || committing">我已核对记录与基准、当前进度的重叠，允许本次改变计入抽数</label>
        <p class="hint">默认保留当前状态并跳过可能重复计数的新增。修改处理方式后，须重新预览；冲突保留当前数据，不自动复活已删除记录。</p>
        <button type="submit" :disabled="!canImport || loading || committing || !!submittedIntent">{{ loading ? '正在预览…' : preview ? '重新生成预览' : '生成导入预览' }}</button>
      </template>
    </form>
    <div v-if="submittedIntent?.status === 'retry'" class="retry-intent" role="status"><p>上次导入的响应未确认。重试同一次导入会先查询原结果，不会重复计入抽数。</p><button type="button" :disabled="!canImport || committing" @click="retryCommit">{{ committing ? '正在确认原结果…' : '重试上次导入' }}</button></div>
    <section v-if="preview" class="preview" aria-labelledby="import-preview-title">
      <h3 id="import-preview-title">导入预览</h3>
      <p>新增 {{ preview.stats.added }} · 已有相同内容 {{ preview.stats.duplicates }} · 冲突 {{ preview.stats.conflicts }} · 跳过 {{ preview.stats.skipped }}</p>
      <p>当前已知累计 {{ preview.current_known_total }} 抽 → 提交后 {{ preview.candidate_known_total }} 抽。备份已知累计 {{ preview.backup_known_total }} 抽。</p>
      <p class="hint">这些均为已知抽数；未知跨度和未知进度保持未知。预览过期或账号、文件、选项、档案版本变化后须重新预览。</p>
      <ul v-if="preview.risks.length" class="risks"><li v-for="risk in preview.risks" :key="risk">{{ risk }}</li></ul>
      <p v-if="!preview.can_commit" class="error" role="alert">当前预览不能提交，请按提示核对处理选项并重新预览。</p>
      <ol class="preview-items"><li v-for="item in visibleItems" :key="item.entity_type + ':' + item.id"><strong>{{ itemName(item) }}</strong><span>{{ statusLabel(item.status) }}</span><p>{{ item.reason }}</p></li></ol>
      <div v-if="preview.items.length > 50" class="actions"><button type="button" :disabled="previewPage === 0" @click="previewPage--">上一页明细</button><span>{{ previewPage + 1 }} / {{ Math.ceil(preview.items.length / 50) }}</span><button type="button" :disabled="(previewPage + 1) * 50 >= preview.items.length" @click="previewPage++">下一页明细</button></div>
      <button class="primary" type="button" :disabled="!canImport || !preview.can_commit || expired || committing" @click="commit">{{ committing ? '正在导入…' : expired ? '预览已过期，请重新生成' : '确认按预览导入' }}</button>
    </section>
    <p v-if="error" ref="errorPanel" class="error" role="alert" tabindex="-1">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
  </section>
</template>

<script setup>
import { computed, nextTick, onScopeDispose, reactive, ref, watch } from 'vue'
import { commitRecruitmentImport, exportRecruitment, previewRecruitmentImport } from '../../api/recruitment.js'
import { downloadFile, MAX_IMPORT_BYTES, recruitmentCsv } from './rules.js'
const props = defineProps({ open: Boolean, accountId: String, accountName: String, identity: String, revision: Number, game: String, readOnly: Boolean, busy: Boolean, contextVersion: Number, requestVersion: Number })
const emit = defineEmits(['committed', 'busy', 'update:open'])
const documentData = ref(null), filename = ref(''), preview = ref(null), previewPage = ref(0), loading = ref(false), exporting = ref(false), committing = ref(false), error = ref(''), notice = ref(''), fileInput = ref(null), errorPanel = ref(null), expired = ref(false)
const submittedIntent = ref(null)
const options = reactive({ state_strategy: 'keep_current', confirm_count_change: false })
const canExport = computed(() => !!props.identity && !!props.accountId && !props.busy)
const canImport = computed(() => canExport.value && !props.readOnly)
async function openImport() {
  if (!canImport.value) return
  emit('update:open', true)
  await nextTick()
  fileInput.value?.focus()
}
defineExpose({ openImport, hasDraft: () => !!documentData.value || !!submittedIntent.value, isBusy: () => committing.value || loading.value })
const visibleItems = computed(() => preview.value?.items.slice(previewPage.value * 50, (previewPage.value + 1) * 50) || [])
const itemNames = computed(() => {
  const names = new Map(), document = documentData.value
  if (!document) return names
  for (const pool of document.pools) names.set('pool:' + pool.pool_id, pool.snapshot.name)
  for (const agent of document.temporary_agents) names.set('agent:' + agent.agent_id, agent.name)
  for (const event of document.events) names.set('event:' + event.event_id, event.agent_snapshot.name + ' · ' + (event.pull_span == null ? '抽数未知' : event.pull_span + ' 抽'))
  for (const batch of document.batches) names.set('batch:' + batch.batch_id, '计数批次 · ' + batch.total_pull_count + ' 抽')
  return names
})
let generation = 0, alive = true, expiryTimer = null, requestId = '', binding = null
const capture = () => ({ generation, identity: props.identity, accountId: props.accountId, contextVersion: props.contextVersion, game: props.game })
const sameOwner = token => alive && token.identity === props.identity && token.accountId === props.accountId && token.contextVersion === props.contextVersion && token.game === props.game
const matches = token => sameOwner(token) && token.generation === generation
function clearPreview() { generation++; preview.value = null; binding = null; requestId = ''; expired.value = false; previewPage.value = 0; clearTimeout(expiryTimer) }
watch([() => props.identity, () => props.accountId, () => props.contextVersion, () => props.game], () => {
  clearPreview(); submittedIntent.value = null; documentData.value = null; filename.value = ''; error.value = ''; notice.value = ''; loading.value = false; committing.value = false; exporting.value = false; options.state_strategy = 'keep_current'; options.confirm_count_change = false
  if (fileInput.value) fileInput.value.value = ''
})
watch([() => props.revision, () => props.requestVersion, () => props.readOnly], clearPreview)
watch([() => options.state_strategy, () => options.confirm_count_change], () => { clearPreview(); submittedIntent.value = null })
async function showError(message) { error.value = message; await nextTick(); errorPanel.value?.focus() }
async function selectFile(event) {
  clearPreview(); submittedIntent.value = null; documentData.value = null; notice.value = ''; error.value = ''
  const file = event.target.files?.[0], token = capture()
  if (!file || !canImport.value) return
  try {
    if (file.size > MAX_IMPORT_BYTES) throw new Error('文件超过 5 MiB，请选择完整且符合限制的招募档案备份')
    const data = JSON.parse((await file.text()).replace(/^\uFEFF/, ''))
    if (!matches(token)) return
    if (data?.schema !== 'yuanhub.recruitment.v1' || !Array.isArray(data.events) || !Array.isArray(data.batches) || !Array.isArray(data.pools) || !Array.isArray(data.temporary_agents) || !data.source_account?.account_id) throw new Error('这不是支持的招募档案 JSON，CSV 不能用于恢复')
    if (data.events.length > 20000) throw new Error('备份超过 20,000 条结果，不能部分导入')
    documentData.value = data; filename.value = file.name
  } catch (failure) { if (matches(token)) await showError(failure.message || '无法读取此备份') }
}
async function exportFile(format) {
  if (!canExport.value || exporting.value) return
  const token = capture(); exporting.value = true; error.value = ''; notice.value = ''
  try {
    const document = await exportRecruitment(token.accountId)
    if (!sameOwner(token)) return
    const filename = 'recruitment-' + token.accountId + '.' + format
    if (format === 'json') {
      const json = JSON.stringify(document)
      if (new Blob([json]).size > MAX_IMPORT_BYTES || document.events.length > 20000) throw new Error('快照超过可恢复备份的 5 MiB / 20,000 条结果限制，未生成截断文件')
      downloadFile(json, filename, 'application/json;charset=utf-8')
    }
    else downloadFile(recruitmentCsv({ accountId: document.source_account.account_id, accountName: props.accountName, game: document.game, baseline: document.baseline, pools: document.pools, events: document.events, batches: document.batches }), filename, 'text/csv;charset=utf-8')
    notice.value = '已导出完整快照'
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
  finally { if (sameOwner(token)) loading.value = false }
}
async function commit() {
  const approved = binding
  if (!canImport.value || committing.value || expired.value || Date.now() >= Date.parse(preview.value?.expires_at) || !preview.value?.can_commit || !approved || !matches(approved.token) || approved.revision !== props.revision) return
  submittedIntent.value = { ...approved, requestId, status: 'sending' }
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
    submittedIntent.value = null; clearPreview(); documentData.value = null; filename.value = ''; if (fileInput.value) fileInput.value.value = ''; notice.value = '导入已完成，正在读取最新档案'; emit('committed')
  } catch (failure) {
    if (!sameOwner(approved.token) || submittedIntent.value !== approved) return
    if (failure.status === 409) { submittedIntent.value = null; clearPreview(); emit('committed'); await showError('档案或预览已变化，请重新生成预览后导入') }
    else if (failure.status >= 400 && failure.status < 500 && failure.status !== 408) { submittedIntent.value = null; await showError(failure.message || '导入请求被拒绝') }
    else { approved.status = 'retry'; await showError((failure.message || '网络异常') + '。响应未确认，可重试上次导入。') }
  } finally { if (sameOwner(approved.token)) { committing.value = false; emit('busy', false) } }
}
const statusLabel = status => ({ add: '新增', duplicate: '已有相同内容', conflict: '冲突，保留当前', skip: '跳过', count_overlap: '可能重复计数' })[status] || status
function itemName(item) {
  return itemNames.value.get(item.entity_type + ':' + item.id) || ({ pool: '卡池', agent: '临时密探', event: '绝密记录', batch: '计数批次', state: '基准、进度与当前池' })[item.entity_type]
}
onScopeDispose(() => { alive = false; generation++; clearTimeout(expiryTimer) })
</script>

<style scoped>
.exchange-card{padding:16px;background:var(--surface);border:1px solid var(--line);border-radius:16px;margin:16px 0;min-width:0}.exchange-card h2{font-family:var(--font-s);font-size:22px;font-weight:800;margin:0 0 12px}.hint{font-size:13px;line-height:1.8;color:var(--ink-60);margin:12px 0}.actions{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:12px 0}button{min-height:44px;border:1px solid var(--line);border-radius:10px;padding:9px 14px;background:var(--surface);color:var(--ink);font:inherit;cursor:pointer}button:disabled{opacity:.5;cursor:not-allowed}button.primary{margin-top:16px;background:var(--tea);color:var(--cream)}label{display:flex;flex-direction:column;gap:8px;min-width:0;overflow-wrap:anywhere;font-weight:700;font-size:14px;margin:16px 0}input:not([type=checkbox]),select{min-height:44px;width:100%;min-width:0;padding:9px;border:1px solid var(--line);border-radius:10px;background:var(--cream);color:var(--ink);font:inherit}input[type=file]{max-width:100%}.check{flex-direction:row;align-items:flex-start;font-weight:500}.check input{margin-top:3px;flex:none}.preview{border-top:1px solid var(--line);margin-top:20px;padding-top:20px}.preview h3{font-family:var(--font-s);font-size:20px}.preview p{line-height:1.8;margin:8px 0;overflow-wrap:anywhere}.preview-items{list-style:none;padding:0;margin:16px 0}.preview-items li{border:1px solid var(--line);border-radius:10px;padding:12px;margin:8px 0;overflow-wrap:anywhere}.preview-items span{display:block;color:var(--accent-strong);font-size:13px;margin-top:4px}.preview-items p{font-size:13px;margin-bottom:0}.error{color:var(--rouge);line-height:1.8;overflow-wrap:anywhere}.risks{padding-left:22px;color:var(--rouge);line-height:1.8}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:3px}@media(min-width:768px){.exchange-card{padding:22px}.preview-items span{display:inline;margin-left:14px}}
</style>
