<template>
  <DataExchangeDialog :open="open" v-model:tab="tab" :account-name="accountName" :game="game" :busy="busy" @update:open="emit('update:open', $event)">
    <template #import>
      <input ref="fileInput" type="file" hidden accept=".json,application/json" :disabled="busy" @change="readFile">
      <BackupImportPanel feature="羁绊" :account-name="accountName" :filename="filename"
        :source-name="document?.source_account?.name || source?.key" :sources="bondImportSources" :disabled="busy" :done="success"
        @choose="fileInput.click()" @again="clearFile">
        <template #intro><p v-if="!identity" class="backup-import-hint">可先查看文件来源；登录并选择账号后可以预览导入。</p></template>
        <template v-if="document && !success">
          <template v-if="!document.format">
            <p v-if="sources.length === 1">来源账号：{{ sourceKey }}<template v-if="source?.game"> · {{ source.game }}</template></p>
            <label v-else>来源账号<select v-model="sourceKey" :disabled="busy" @change="sourceGame = source?.game || ''"><option value="">请选择一个来源账号</option><option v-for="item in sources" :key="item.key" :value="item.key">{{ item.key }} · {{ item.game || '游戏未明确' }} · 鸢报 {{ item.count }} 项／战斗 {{ item.battleCount }} 项</option></select></label>
            <label v-if="!source?.game">来源游戏<select v-model="sourceGame" :disabled="busy"><option value="">缺少游戏信息时必须选择</option><option>代号鸢</option><option>如鸢</option></select></label>
          </template>
          <p v-if="document.format && document.game !== game" class="bond-error" role="alert">备份游戏与目标账号不匹配，请选择同游戏账号。</p>
          <p v-if="source?.conflict" class="bond-error" role="alert">来源游戏信息有冲突，请先核对文件。</p>
          <p v-else-if="!document.format && sourceGame && sourceGame !== game" class="bond-error" role="alert">备份游戏与目标账号不匹配，请选择同游戏账号。</p>
          <template v-if="preview">
            <BackupImportSummary aria-label="导入预览结果" :counts="[['新增', preview.stats.add], ['已有', preview.stats.same], ['冲突', preview.stats.conflict]]">
              确认后将修改 {{ preview.affected }} 条。文件缺项和旧助手的未收录状态会保留现有记录。
            </BackupImportSummary>
            <p v-if="preview.stats.unknown">有 {{ preview.stats.unknown }} 条记录本站暂不认识，会自动跳过，不会写入。</p>
            <p v-if="preview.stats.invalid || preview.stats.mismatched" class="bond-error" role="alert">存在非法或不匹配记录，不能确认；请修正文件后重新选择。</p>
            <BackupImportDetails>
              <dl class="bond-import-stats">
                <div v-for="group in previewGroups" :key="group.name"><dt>{{ group.name }}</dt><dd>{{ Object.entries(group.stats).map(([key, count]) => labels[key] + ' ' + count).join(' · ') }}</dd></div>
              </dl>
              <p v-if="!document.format">旧助手的未拥有名单和本地游戏可用性覆盖不会写入本站公共资料或密探成长资料。</p>
              <ul class="bond-import-items"><li v-for="(item, index) in pageItems" :key="index"><strong>{{ item.kind === 'battle' ? '战斗' : '鸢报' }} · {{ labels[item.outcome] }}</strong> · {{ item.key }}<small v-if="item.message"> · {{ item.message }}</small></li></ul>
              <div v-if="preview.items.length > 50" class="backup-import-actions"><button class="backup-import-text" type="button" :disabled="itemPage === 0" @click="itemPage--">上一页</button><span>{{ itemPage + 1 }} / {{ Math.ceil(preview.items.length / 50) }}</span><button class="backup-import-text" type="button" :disabled="(itemPage + 1) * 50 >= preview.items.length" @click="itemPage++">下一页</button></div>
            </BackupImportDetails>
          </template>
          <ImportMoreOptions v-if="document.format && preview" summary="冲突时怎么处理">
            <label>恢复策略<select v-model="strategy" :disabled="busy"><option value="merge">合并已记录项（默认）</option><option value="use_file">采用文件显式状态（缺项保留）</option></select></label>
          </ImportMoreOptions>
        </template>
        <p v-if="busy" role="status">正在处理，请稍候…</p>
        <div v-if="error" class="backup-import-actions"><p class="bond-error" role="alert">{{ error }}</p><button v-if="!preview && canPreview" class="backup-import-text" type="button" @click="previewFile">重试</button></div>
        <ImportMoreOptions>
          <label v-if="document && !success">导入到其他账号<select :value="accountId" :disabled="busy || !identity" @change="$emit('target', $event.target.value)"><option value="">请选择目标账号</option><option v-for="item in accounts" :key="item.id" :value="item.id">{{ item.name }} · {{ item.game }}</option></select></label>
          <ImportGuide :sources="bondImportSources" detail />
        </ImportMoreOptions>
      </BackupImportPanel>
    </template>
    <template #import-footer>
      <button v-if="preview && !success" class="btn primary" type="button" :disabled="!canConfirm" @click="confirmFile">{{ busy ? '正在处理…' : '确认导入 ' + preview.affected + ' 条' }}</button>
    </template>
    <template #export>
      <BackupExportPanel title="羁绊备份" contents="鸢报和战斗羁绊进度" :notice="exportNotice">
        <template #feedback>
          <p v-if="busy" role="status">正在处理，请稍候…</p>
          <p v-if="error" class="bond-error" role="alert">{{ error }}</p>
        </template>
      </BackupExportPanel>
    </template>
    <template #export-footer><button class="btn primary" type="button" :disabled="!canUse || busy" @click="exportFile">{{ busy ? '正在处理…' : '下载备份' }}</button></template>
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
import { usePendingBackupRestore } from '../../utils/pendingBackupRestore.js'
import { exportBonds, previewBonds, confirmBonds } from '../../api/bonds.js'
import { downloadBondFile, legacySources, MAX_BYTES, readBondBackup } from './rules.js'
import { backupDownloadNotice, unwrapFullBackup } from '../../utils/backupFile.js'
import BackupExportPanel from '../../components/BackupExportPanel.vue'
const props = defineProps({ open: Boolean, identity: String, accountId: String, accountName: String, game: String, revision: Number, catalogVersion: String, generation: Number, accounts: Array, canUse: Boolean })
const emit = defineEmits(['update:open', 'busy', 'committed', 'target'])
const tab = ref('import')
const fileInput = ref(null)
const bondImportSources = [
  { title: '本站羁绊备份', from: '在羁绊页「导入/导出」里导出的原生备份。' },
  { title: '旧版羁绊助手备份', from: '从羁绊助手导出。导入时请手动选择来源账号，如果文件里没有游戏信息，也要选择来源游戏。' },
]
const exportNotice = ref('')
watch(() => props.open, open => { if (open) tab.value = 'import'; else { exportNotice.value = ''; clearFile() } })
const document = ref(null), filename = ref(''), sourceKey = ref(''), sourceGame = ref(''), strategy = ref('merge'), preview = ref(null), busy = ref(false), error = ref(''), success = ref(''), itemPage = ref(0)
const labels = { add: '新增', same: '相同／保留', conflict: '冲突', unknown: '未知', mismatched: '不匹配', invalid: '非法' }
const sources = computed(() => legacySources(document.value))
const source = computed(() => sources.value.find(s => s.key === sourceKey.value))
const previewGroups = computed(() => [
  { name: '鸢报羁绊', stats: preview.value?.yuan_stats ?? preview.value?.stats },
  { name: '战斗羁绊', stats: preview.value?.battle_stats }
].filter(group => group.stats))
const pageItems = computed(() => preview.value?.items.slice(itemPage.value * 50, (itemPage.value + 1) * 50) || [])
const canPreview = computed(() => props.canUse && !busy.value && !!document.value && (document.value.format ? document.value.game === props.game : !!source.value && !source.value.conflict && !!sourceGame.value && sourceGame.value === props.game))
const canConfirm = computed(() => props.canUse && !busy.value && !!preview.value && !preview.value.stats.invalid && !preview.value.stats.mismatched)
let serial = 0, alive = true
const token = () => ({ serial: ++serial, identity: props.identity, account: props.accountId, game: props.game, generation: props.generation })
const matches = t => alive && t.serial === serial && t.identity === props.identity && t.account === props.accountId && t.game === props.game && t.generation === props.generation
function setBusy(value) { busy.value = value; emit('busy', value) }
function invalidate() { preview.value = null; itemPage.value = 0; error.value = ''; exportNotice.value = '' }
function clearFile() { serial++; invalidate(); success.value = ''; document.value = null; filename.value = ''; sourceKey.value = ''; sourceGame.value = ''; strategy.value = 'merge' }
watch([sourceKey, sourceGame, strategy], () => {
  invalidate()
  if (props.open && !success.value && !busy.value) void previewFile()
})
watch(() => [props.accountId, props.game, props.generation], () => {
  serial++; invalidate(); success.value = ''; setBusy(false)
  if (props.open && document.value) void previewFile()
})
watch(() => [props.revision, props.catalogVersion], () => {
  const needsPreview = !!preview.value || busy.value && !!document.value
  serial++; invalidate(); setBusy(false)
  if (needsPreview && !success.value) error.value = '档案或目录已变化，请重试预览。'
})
watch(() => props.identity, () => { clearFile(); setBusy(false) })
watch(() => props.canUse, ready => {
  if (ready && props.open && document.value && !preview.value && !error.value && !success.value) void previewFile()
})
function readFile(event) {
  const file = event.target.files?.[0]; event.target.value = ''
  return readBackupFile(file)
}
async function readBackupFile(input) {
  if (!input || busy.value) return
  clearFile(); filename.value = input.name; const t = token(); setBusy(true)
  try {
    const file = await unwrapFullBackup(input, 'bonds')
    if (!matches(t)) return
    if (file.size > MAX_BYTES) throw new Error('文件最多8MiB。')
    const parsed = readBondBackup(await file.text())
    if (!matches(t)) return
    document.value = parsed; filename.value = file.name
    if (!parsed.format) {
      const legacy = legacySources(parsed)
      if (!legacy.length) throw new Error('文件中没有可选择的旧账号。')
      if (legacy.length === 1) { sourceKey.value = legacy[0].key; sourceGame.value = legacy[0].game || '' }
    }
  } catch (e) { if (matches(t)) { document.value = null; error.value = e.message } }
  finally { if (matches(t)) setBusy(false) }
  await nextTick()
  if (matches(t) && document.value) await previewFile()
}
usePendingBackupRestore(['bonds'], () => props.canUse && !!props.identity && !!props.accountId && !busy.value, async ({ file }, confirmOpened) => {
  tab.value = 'import'
  emit('update:open', true)
  await nextTick()
  if (props.open && confirmOpened()) await readBackupFile(file)
})
const body = () => ({ account_id: props.accountId, document: document.value, strategy: document.value?.format ? strategy.value : 'merge', source_account: document.value?.format ? null : sourceKey.value, source_game: document.value?.format ? null : sourceGame.value })
async function exportFile() {
  if (!props.canUse || busy.value) return
  const t = token(); setBusy(true); error.value = ''; exportNotice.value = ''
  try {
    const result = await exportBonds(t.account, t.identity)
    if (!matches(t)) return
    if (result.format !== 'yuanhub-bonds' || result.game !== t.game) throw new Error('导出游戏或格式不一致。')
    exportNotice.value = backupDownloadNotice(downloadBondFile(result, props.accountName))
  } catch (e) { if (matches(t)) error.value = e.message }
  finally { if (matches(t)) setBusy(false) }
}
async function previewFile() {
  if (!canPreview.value) return
  invalidate(); const t = token(); setBusy(true)
  try {
    const result = await previewBonds(t.identity, body())
    if (!matches(t)) return
    if (result.account_id !== t.account || result.game !== t.game) throw new Error('预览归属不一致。')
    preview.value = result
  } catch (e) { if (matches(t)) error.value = e.message }
  finally { if (matches(t)) setBusy(false) }
}
async function confirmFile() {
  if (!canConfirm.value) return
  const t = token(), value = preview.value
  setBusy(true); error.value = ''
  try {
    const result = await confirmBonds(t.identity, { ...body(), expected_revision: value.expected_revision, catalog_version: value.catalog_version, preview_token: value.preview_token, skip_unknown: true })
    if (!matches(t)) return
    if (result.account_id !== t.account || result.game !== t.game) throw new Error('导入响应归属不一致，请刷新核对。')
    preview.value = null; success.value = `已处理 ${value.affected} 条记录。`; emit('committed', result)
  } catch (e) { if (matches(t)) { preview.value = null; error.value = e.status === 409 ? '预览或档案版本冲突，请刷新档案后重新预览。' : e.message } }
  finally { if (matches(t)) setBusy(false) }
}
onScopeDispose(() => { alive = false; serial++ })
</script>

<style scoped>
.bond-import-items small { font-size: 13px; }
.bond-import-stats { display: grid; gap: 8px; margin-block: 12px; }
.bond-import-stats dt { font-weight: 700; }
.bond-import-stats dd { margin: 0; }
</style>
