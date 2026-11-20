<template>
  <DataExchangeDialog :open="open || restoreOpen" v-model:tab="tab" :account-name="accountName" :game="game" :busy="working" :before-close="beforeClose" @close="closeExchange">
    <template #import>
      <input ref="fileInput" type="file" hidden accept=".json,application/json" :disabled="!canRecord || working" @change="selectFile">
      <BackupImportPanel feature="成就" :account-name="accountName" :filename="filename" :source-name="documentData?.source_account?.name"
        :sources="achievementImportSources" :disabled="!canRecord || working" :done="success" @choose="fileInput.click()" @again="clearFile">
        <template v-if="preview && !success">
          <BackupImportSummary aria-label="成就导入预览" :counts="[['新增', preview.stats.add], ['已有', preview.stats.same], ['冲突', preview.stats.conflict]]">
            确认后影响 {{ preview.affected }} 条。{{ strategy === 'keep_current' ? '冲突记录保持现状。' : '采用备份中的冲突字段，文件缺项保留现有记录。' }}
          </BackupImportSummary>
          <p v-if="preview.stats.unknown">有 {{ preview.stats.unknown }} 条记录本站暂不认识，会自动跳过，不会写入。</p>
          <p v-if="preview.stats.invalid || preview.stats.mismatched" class="achievement-error" role="alert">存在非法或不匹配记录，无法确认导入。</p>
          <BackupImportDetails>
            <p v-if="documentData?.catalog_version !== preview.catalog_version" class="backup-import-hint">目录版本可能不同，按稳定 ID 核对。</p>
            <ol class="achievement-import-items"><li v-for="item in preview.items" :key="item.index">第 {{ item.index + 1 }} 条 · {{ item.achievement_id || '无 ID' }} · {{ OUTCOMES[item.outcome] }}<span v-if="item.message">：{{ item.message }}</span></li></ol>
          </BackupImportDetails>
          <ImportMoreOptions summary="冲突时怎么处理">
            <label>冲突处理<select v-model="strategy" :disabled="working"><option value="keep_current">保留当前冲突记录（默认）</option><option value="use_file">采用文件内容（空备注保留现有内容）</option></select></label>
          </ImportMoreOptions>
        </template>
        <p v-if="working && !preview" role="status">正在核对备份…</p>
        <div v-if="tab === 'import' && error" class="backup-import-actions">
          <p ref="errorPanel" class="achievement-error" role="alert" tabindex="-1">{{ error }}</p>
          <button v-if="documentData && !preview && !working" class="backup-import-text" type="button" :disabled="!canRecord" @click="generatePreview">重试</button>
        </div>
        <ImportMoreOptions><ImportGuide :sources="achievementImportSources" detail /></ImportMoreOptions>
      </BackupImportPanel>
    </template>
    <template #import-footer><button v-if="preview && !success" class="btn primary" type="button" :disabled="!canConfirm" @click="commit">{{ working ? '正在处理…' : '确认导入 ' + preview.affected + ' 条' }}</button></template>
    <template #export>
      <BackupExportPanel title="成就备份" contents="成就完成记录" :notice="exportNotice">
        <template #feedback>
          <p v-if="tab === 'export' && error" ref="errorPanel" class="achievement-error" role="alert" tabindex="-1">{{ error }}</p>
        </template>
      </BackupExportPanel>
    </template>
    <template #export-footer><button class="btn primary" type="button" :disabled="!canRecord || working" @click="exportFile">{{ working ? '正在处理…' : '下载备份' }}</button></template>
  </DataExchangeDialog>
</template>

<script setup>
import BackupImportPanel from '../../components/BackupImportPanel.vue'
import BackupImportSummary from '../../components/BackupImportSummary.vue'
import BackupImportDetails from '../../components/BackupImportDetails.vue'
import { computed, nextTick, onScopeDispose, ref, watch } from 'vue'
import DataExchangeDialog from '../../components/DataExchangeDialog.vue'
import ImportGuide from '../../components/ImportGuide.vue'
import ImportMoreOptions from '../../components/ImportMoreOptions.vue'
import * as api from '../../api/achievement.js'
import { dialog } from '../../utils/dialog.js'
import { usePendingBackupRestore } from '../../utils/pendingBackupRestore.js'
import { downloadAchievementBackup, MAX_IMPORT_BYTES, readAchievementBackup } from './rules.js'
import { backupDownloadNotice, unwrapFullBackup } from '../../utils/backupFile.js'
import BackupExportPanel from '../../components/BackupExportPanel.vue'

const props = defineProps({ open: Boolean, accountId: String, accountName: String, identity: String, game: String, revision: Number, contextVersion: Number, canRecord: Boolean })
const emit = defineEmits(['close', 'busy', 'committed'])
const tab = ref('import'), restoreOpen = ref(false)
const exportNotice = ref('')
const achievementImportSources = [
  { title: '本站成就备份', from: '在成就页「导入/导出」里下载，可在其他设备或账号恢复。' },
]
const fileInput = ref(null), errorPanel = ref(null), documentData = ref(null), filename = ref(''), strategy = ref('keep_current'), preview = ref(null), working = ref(false), error = ref(''), success = ref('')
const OUTCOMES = { add: '新增', same: '相同', conflict: '冲突', unknown: '未知 ID', invalid: '非法' }
let generation = 0, alive = true
const capture = () => ({ generation, accountId: props.accountId, identity: props.identity, game: props.game, contextVersion: props.contextVersion })
const matches = token => alive && token.generation === generation && token.accountId === props.accountId && token.identity === props.identity && token.game === props.game && token.contextVersion === props.contextVersion
const canConfirm = computed(() => props.canRecord && !working.value && !!preview.value && !preview.value.stats.invalid && !preview.value.stats.mismatched)
function busy(value) { working.value = value; emit('busy', value) }
function clearPreview() { preview.value = null }
function clearFile() {
  generation++; clearPreview(); documentData.value = null; filename.value = ''; strategy.value = 'keep_current'; error.value = ''; success.value = ''
  if (fileInput.value) fileInput.value.value = ''
}
function reset() { restoreOpen.value = false; clearFile(); exportNotice.value = ''; busy(false) }
watch(() => props.contextVersion, reset, { flush: 'sync' })
watch(() => props.open, value => { if (!value) { reset(); tab.value = 'import' } })
function closeExchange() {
  if (restoreOpen.value) { reset(); tab.value = 'import' }
  emit('close')
}
watch(() => props.revision, () => { if (preview.value) { clearPreview(); error.value = '档案已变化，请重试预览。' } })
watch(strategy, async () => { clearPreview(); if (documentData.value && !working.value) await generatePreview() })
async function showError(message) { error.value = message; await nextTick(); errorPanel.value?.focus() }
async function beforeClose() {
  if (working.value) return false
  const token = capture()
  if (documentData.value && !await dialog.confirm({ title: '关闭导入预览？', message: '文件尚未导入，关闭后需要重新选择。', confirmText: '关闭预览', cancelText: '继续核对' })) return false
  return matches(token) && !working.value
}
function selectFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  return readBackupFile(file)
}
async function readBackupFile(input) {
  if (!input || !props.canRecord || working.value) return
  const token = capture()
  clearPreview(); error.value = ''; success.value = ''; documentData.value = null; filename.value = input.name
  busy(true)
  try {
    const file = await unwrapFullBackup(input, 'achievement')
    if (!matches(token)) return
    if (file.size > MAX_IMPORT_BYTES) throw new Error('文件最多16MiB。')
    const data = readAchievementBackup(await file.text())
    if (!matches(token)) return
    if (data.game !== props.game) throw new Error('备份游戏与目标账号不匹配。')
    documentData.value = data; filename.value = file.name
  } catch (failure) { if (matches(token)) await showError(failure.message) }
  finally { if (matches(token)) busy(false) }
  if (matches(token) && documentData.value) await generatePreview()
}
usePendingBackupRestore(['achievement'], () => props.canRecord && !!props.identity && !!props.accountId && !working.value, async ({ file }, confirmOpened) => {
  tab.value = 'import'
  restoreOpen.value = true
  await nextTick()
  if (restoreOpen.value && confirmOpened()) await readBackupFile(file)
})
async function generatePreview() {
  if (!props.canRecord || working.value || !documentData.value) return
  const token = capture()
  clearPreview(); error.value = ''; busy(true)
  try {
    const result = await api.previewAchievements(token.accountId, token.identity, documentData.value, strategy.value)
    if (matches(token)) preview.value = result
  } catch (failure) { if (matches(token)) await showError(failure.message || '预览失败，请重试。') }
  finally { if (matches(token)) busy(false) }
}
async function commit() {
  if (!canConfirm.value) return
  const token = capture(), plan = preview.value
  busy(true)
  try {
    if (!await dialog.confirm({ title: '确认导入成就档案？', message: `目标：${props.accountName} · ${props.game}，将影响 ${plan.affected} 条记录。${plan.strategy === 'use_file' ? '冲突字段将采用文件内容。' : '保留当前冲突记录。'}`, confirmText: '确认导入', cancelText: '返回预览' })) return
    if (!matches(token) || plan !== preview.value) return
    const result = await api.importAchievements(token.accountId, token.identity, documentData.value, plan, true)
    if (!matches(token)) return
    clearPreview(); documentData.value = null
    success.value = `已处理 ${plan.affected} 条记录。`
    emit('committed', result)
  } catch (failure) {
    if (matches(token)) {
      if (failure.status === 409) clearPreview()
      await showError(failure.message || '导入失败，请重新读取档案并预览。')
    }
  } finally { if (matches(token)) busy(false) }
}
async function exportFile() {
  if (!props.canRecord || working.value) return
  const token = capture()
  busy(true); error.value = ''; exportNotice.value = ''
  try {
    const data = await api.exportAchievements(token.accountId, token.identity)
    if (matches(token)) exportNotice.value = backupDownloadNotice(downloadAchievementBackup(data, props.accountName))
  } catch (failure) { if (matches(token)) await showError(failure.message || '导出失败，请重试。') }
  finally { if (matches(token)) busy(false) }
}
onScopeDispose(() => { alive = false; generation++ })
defineExpose({ hasDraft: () => !!documentData.value })
</script>

<style scoped>
.achievement-import-items { max-height: none; overflow: visible; }
</style>
