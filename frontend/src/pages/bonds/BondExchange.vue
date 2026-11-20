<template>
  <DataExchangeDialog :open="open" v-model:tab="tab" :account-name="accountName" :game="game" :busy="busy" @update:open="emit('update:open', $event)">
    <template #import>
      <section class="bond-exchange" aria-label="备份迁移">
        <div class="bond-toolbar bond-file-actions">
          <button class="btn primary" type="button" :disabled="busy" @click="fileInput.click()">选择备份文件</button>
          <input ref="fileInput" type="file" hidden accept=".json,application/json" :disabled="busy" @change="readFile">
          <button v-if="document && !preview && !error && !busy && notice !== '导入已保存到所选账号。' && !source?.conflict && (!document.format || document.game === game)" type="button" :disabled="!canPreview" @click="previewFile">预览这个文件</button>
        </div>
        <ImportGuide :sources="bondImportSources" />
        <p v-if="!identity">可先选择文件查看来源；登录并选择账号后才能预览导入。</p>
        <template v-if="document">
          <p>{{ document.format ? '本站羁绊备份' : '旧助手备份' }} · {{ filename }}</p>
          <label v-if="!document.format">来源账号<select v-model="sourceKey" :disabled="busy"><option value="">请选择一个来源账号</option><option v-for="source in sources" :key="source.key" :value="source.key">{{ source.key }} · {{ source.game || '游戏未明确' }} · 鸢报 {{ source.count }} 项／战斗 {{ source.battleCount }} 项{{ source.conflict ? '（游戏信息冲突）' : '' }}</option></select></label>
          <label v-if="!document.format">来源游戏<select v-model="sourceGame" :disabled="busy || !!source?.game"><option value="">缺少游戏信息时必须选择</option><option>代号鸢</option><option>如鸢</option></select></label>
          <label>现有目标账号<select :value="accountId" :disabled="busy || !identity" @change="$emit('target', $event.target.value)"><option value="">请选择目标账号</option><option v-for="item in accounts" :key="item.id" :value="item.id">{{ item.name }} · {{ item.game }}</option></select></label>
          <p>目标：{{ accountName || '尚未选择' }} · {{ game }}。此处不会创建账号。</p>
          <label v-if="document.format">恢复策略<select v-model="strategy" :disabled="busy"><option value="merge">合并已记录项（默认）</option><option value="use_file">采用文件显式状态（缺项保留）</option></select></label>
          <p v-if="document.format && document.game !== game" class="bond-error" role="alert">备份游戏与目标账号不匹配，请选择同游戏账号。</p>
          <p v-if="source?.conflict" class="bond-error" role="alert">来源游戏信息有冲突，请先核对文件。</p>
          <div class="bond-toolbar"><button v-if="error && !preview" type="button" :disabled="!canPreview" @click="previewFile">重新预览</button><button type="button" :disabled="busy" @click="clearFile">移除文件</button></div>
        </template>
        <section v-if="preview" aria-label="导入预览结果">
          <h3>确认导入到 {{ accountName }} · {{ game }}</h3>
          <p>预计修改 {{ preview.affected }} 条。</p>
          <p>确认后才会写入所选账号，文件缺项和旧助手的未收录状态会保留现有记录。</p>
          <dl class="bond-import-stats">
            <div v-for="group in previewGroups" :key="group.name">
              <dt>{{ group.name }}</dt>
              <dd>{{ Object.entries(group.stats).map(([key, count]) => labels[key] + ' ' + count).join(' · ') }}</dd>
            </div>
          </dl>
          <p v-if="preview.stats.conflict">冲突项会按所选恢复策略写入。</p>
          <p v-if="!document.format">旧助手的未拥有名单和本地游戏可用性覆盖不会写入本站公共资料或密探成长资料。</p>
          <details><summary class="touch-target">逐项核对记录（{{ preview.items.length }} 项）</summary><ul class="bond-import-items"><li v-for="(item, index) in pageItems" :key="index"><strong>{{ item.kind === 'battle' ? '战斗' : '鸢报' }} · {{ labels[item.outcome] }}</strong> · {{ item.key }}<small v-if="item.message"> · {{ item.message }}</small></li></ul><div class="bond-toolbar"><button type="button" :disabled="itemPage === 0" @click="itemPage--">上一页</button><span>{{ itemPage + 1 }} / {{ Math.max(1, Math.ceil(preview.items.length / 50)) }}</span><button type="button" :disabled="(itemPage + 1) * 50 >= preview.items.length" @click="itemPage++">下一页</button></div></details>
          <label v-if="preview.stats.unknown" class="bond-skip-unknown"><input v-model="skipUnknown" type="checkbox" :disabled="busy">我已核对，跳过 {{ preview.stats.unknown }} 条未知或未开放的鸢报与战斗记录</label>
          <p v-if="preview.stats.invalid || preview.stats.mismatched" class="bond-error" role="alert">存在非法或不匹配记录，不能确认；请修正文件后重新预览。</p>
        </section>
        <p v-if="busy" role="status">正在处理，请稍候…</p>
        <p v-if="error" class="bond-error" role="alert">{{ error }}</p>
        <p class="action-feedback" v-if="notice" role="status">{{ notice }}</p>
        <ImportMoreOptions>
          <ImportGuide :sources="bondImportSources" detail />
        </ImportMoreOptions>
      </section>
    </template>
    <template #import-footer>
      <button class="btn primary" type="button" :disabled="!preview || busy || !canUse || !!preview.stats.invalid || !!preview.stats.mismatched || !!preview.stats.unknown && !skipUnknown" @click="confirmFile">{{ busy ? '正在处理…' : preview ? '确认导入 ' + preview.affected + ' 条' : '确认导入' }}</button>
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
watch(() => props.open, open => { if (open) tab.value = 'import'; else exportNotice.value = '' })
const document = ref(null), filename = ref(''), sourceKey = ref(''), sourceGame = ref(''), strategy = ref('merge'), preview = ref(null), busy = ref(false), error = ref(''), notice = ref(''), skipUnknown = ref(false), itemPage = ref(0)
const labels = { add: '新增', same: '相同／保留', conflict: '冲突', unknown: '未知', mismatched: '不匹配', invalid: '非法' }
const sources = computed(() => legacySources(document.value))
const source = computed(() => sources.value.find(s => s.key === sourceKey.value))
const previewGroups = computed(() => [
  { name: '鸢报羁绊', stats: preview.value?.yuan_stats ?? preview.value?.stats },
  { name: '战斗羁绊', stats: preview.value?.battle_stats }
].filter(group => group.stats))
const pageItems = computed(() => preview.value?.items.slice(itemPage.value * 50, (itemPage.value + 1) * 50) || [])
const canPreview = computed(() => props.canUse && !busy.value && !!document.value && (document.value.format ? document.value.game === props.game : !!source.value && !source.value.conflict && !!sourceGame.value && sourceGame.value === props.game))
let serial = 0, alive = true
const token = () => ({ serial: ++serial, identity: props.identity, account: props.accountId, game: props.game, generation: props.generation })
const matches = t => alive && t.serial === serial && t.identity === props.identity && t.account === props.accountId && t.game === props.game && t.generation === props.generation
function setBusy(value) { busy.value = value; emit('busy', value) }
function invalidate() { preview.value = null; skipUnknown.value = false; itemPage.value = 0; error.value = ''; notice.value = ''; exportNotice.value = '' }
function clearFile() { serial++; invalidate(); document.value = null; filename.value = ''; sourceKey.value = ''; sourceGame.value = ''; strategy.value = 'merge' }
watch(sourceKey, () => { sourceGame.value = source.value?.game || ''; invalidate() })
watch([sourceGame, strategy], invalidate)
watch(() => [props.accountId, props.game, props.revision, props.catalogVersion, props.generation], () => { serial++; invalidate(); setBusy(false) })
watch(() => props.identity, () => { clearFile(); setBusy(false) })
function readFile(event) {
  const file = event.target.files?.[0]; event.target.value = ''
  return readBackupFile(file)
}
async function readBackupFile(input) {
  if (!input || busy.value) return
  clearFile(); const t = token(); setBusy(true)
  try {
    const file = await unwrapFullBackup(input, 'bonds')
    if (!matches(t)) return
    if (file.size > MAX_BYTES) throw new Error('文件最多8MiB。')
    const parsed = readBondBackup(await file.text())
    if (!matches(t)) return
    document.value = parsed; filename.value = file.name
    if (!parsed.format && !legacySources(parsed).length) throw new Error('文件中没有可选择的旧账号。')
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
  if (!props.canUse || busy.value || !preview.value) return
  const t = token(), value = preview.value
  setBusy(true); error.value = ''; notice.value = ''
  try {
    const result = await confirmBonds(t.identity, { ...body(), expected_revision: value.expected_revision, catalog_version: value.catalog_version, preview_token: value.preview_token, skip_unknown: skipUnknown.value })
    if (!matches(t)) return
    if (result.account_id !== t.account || result.game !== t.game) throw new Error('导入响应归属不一致，请刷新核对。')
    preview.value = null; notice.value = '导入已保存到所选账号。'; emit('committed', result)
  } catch (e) { if (matches(t)) { preview.value = null; error.value = e.status === 409 ? '预览或档案版本冲突，请刷新档案后重新预览。' : e.message } }
  finally { if (matches(t)) setBusy(false) }
}
onScopeDispose(() => { alive = false; serial++ })
</script>

<style scoped>
.bond-exchange { min-width: 0; font-size: 14px; }
.bond-exchange p { margin-block: 12px; }
.bond-import-items small { font-size: 13px; }
.bond-import-stats { display: grid; gap: 8px; margin-block: 12px; }
.bond-import-stats dt { font-weight: 700; }
.bond-import-stats dd { margin: 0; }
.bond-skip-unknown { display: flex; align-items: center; gap: 8px; min-height: 44px; }
.bond-skip-unknown input { flex: none; }
.bond-exchange button, .bond-exchange :is(select, input:not([type="checkbox"])) { min-height: 44px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 7px; color: var(--ink); background: var(--surface); font: inherit; box-sizing: border-box; max-width: 100%; min-width: 0; }
.bond-exchange :is(select, input[type="file"]) { width: 100%; }
.bond-exchange button, .bond-exchange summary { cursor: pointer; }
.bond-file-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.bond-file-actions .btn.primary { background: var(--tea); color: var(--on-strong); border-color: var(--tea); }
.bond-exchange :is(button, select, input):disabled { opacity: .55; cursor: not-allowed; }
.bond-exchange :is(button, input, select, summary):focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 3px; }
</style>
