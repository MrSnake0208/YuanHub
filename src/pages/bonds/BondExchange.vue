<template>
  <section class="bond-exchange" aria-label="备份迁移">
    <h2>备份迁移</h2>
    <p>先选择来源，再选择现有目标账号。账号名称不会用于自动关联；文件缺项和旧助手的 false 不会清空当前记录。</p>
    <div class="bond-toolbar">
      <button type="button" :disabled="!canUse || busy" @click="exportFile">导出当前账号原生备份</button>
      <label>选择备份文件<input type="file" accept=".json,application/json" :disabled="busy" @change="readFile"></label>
    </div>
    <p v-if="!identity">可先选择文件查看来源；登录并选择账号后才能预览导入。</p>
    <template v-if="document">
      <p>{{ document.format ? 'YuanHub 原生羁绊备份 v1' : '旧助手备份' }} · {{ filename }}</p>
      <label v-if="!document.format">来源账号<select v-model="sourceKey" :disabled="busy"><option value="">请选择一个来源账号</option><option v-for="source in sources" :key="source.key" :value="source.key">{{ source.key }} · {{ source.game || '游戏未明确' }} · 已记录 {{ source.count }} 项{{ source.conflict ? '（游戏信息冲突）' : '' }}</option></select></label>
      <label v-if="!document.format">来源游戏<select v-model="sourceGame" :disabled="busy || !!source?.game"><option value="">缺少游戏信息时必须选择</option><option>代号鸢</option><option>如鸢</option></select></label>
      <label>现有目标账号<select :value="accountId" :disabled="busy || !identity" @change="$emit('target', $event.target.value)"><option value="">请选择目标账号</option><option v-for="item in accounts" :key="item.id" :value="item.id">{{ item.name }} · {{ item.game }}</option></select></label>
      <p>目标：{{ accountName || '尚未选择' }} · {{ game }}。此处不会创建账号。</p>
      <label v-if="document.format">恢复策略<select v-model="strategy" :disabled="busy"><option value="merge">合并已记录项（默认）</option><option value="use_file">采用文件显式状态（缺项保留）</option></select></label>
      <p v-if="document.format && document.game !== game" class="bond-error" role="alert">备份游戏与目标账号不匹配，请选择同游戏账号。</p>
      <p v-if="source?.conflict" class="bond-error" role="alert">来源游戏信息有冲突，请先核对文件。</p>
      <div class="bond-toolbar"><button type="button" :disabled="!canPreview" @click="previewFile">生成导入预览</button><button type="button" :disabled="busy" @click="clearFile">移除文件</button></div>
    </template>
    <p v-if="busy" role="status">正在处理，请稍候…</p>
    <p v-if="error" class="bond-error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <section v-if="preview" aria-label="导入预览结果">
      <h3>确认导入到 {{ accountName }} · {{ game }}</h3>
      <p>预计修改 {{ preview.affected }} 条；档案版本 {{ preview.expected_revision }}。</p>
      <p>{{ Object.entries(preview.stats).map(([key, count]) => labels[key] + ' ' + count).join(' · ') }}</p>
      <p v-if="!document.format">旧助手的未拥有名单和本地游戏可用性覆盖不会写入本站公共资料或密探成长资料。</p>
      <details><summary>逐项核对记录（{{ preview.items.length }} 项）</summary><ul class="bond-import-items"><li v-for="(item, index) in pageItems" :key="index"><strong>{{ labels[item.outcome] }}</strong> · {{ item.key }}<small v-if="item.message"> · {{ item.message }}</small></li></ul><div class="bond-toolbar"><button type="button" :disabled="itemPage === 0" @click="itemPage--">上一页</button><span>{{ itemPage + 1 }} / {{ Math.max(1, Math.ceil(preview.items.length / 50)) }}</span><button type="button" :disabled="(itemPage + 1) * 50 >= preview.items.length" @click="itemPage++">下一页</button></div></details>
      <label v-if="preview.stats.unknown"><input v-model="skipUnknown" type="checkbox" :disabled="busy">我已核对，跳过 {{ preview.stats.unknown }} 条未知或未开放记录</label>
      <p v-if="preview.stats.invalid || preview.stats.mismatched" class="bond-error" role="alert">存在非法或不匹配记录，不能确认；请修正文件后重新预览。</p>
      <button type="button" :disabled="busy || !canUse || !!preview.stats.invalid || !!preview.stats.mismatched || !!preview.stats.unknown && !skipUnknown" @click="confirmFile">确认导入 {{ preview.affected }} 条修改</button>
    </section>
    <p>原生备份保留历史记录，不包含登录凭据。来源和时间以本站服务器本次保存为准，不代表游戏内首次触发时间；成就人工完成状态需单独备份。</p>
  </section>
</template>

<script setup>
import { computed, onScopeDispose, ref, watch } from 'vue'
import { exportBonds, previewBonds, confirmBonds } from '../../api/bonds.js'
import { downloadBondFile, legacySources, MAX_BYTES, readBondBackup } from './rules.js'
const props = defineProps({ identity: String, accountId: String, accountName: String, game: String, revision: Number, catalogVersion: String, generation: Number, accounts: Array, canUse: Boolean })
const emit = defineEmits(['busy', 'committed', 'target'])
const document = ref(null), filename = ref(''), sourceKey = ref(''), sourceGame = ref(''), strategy = ref('merge'), preview = ref(null), busy = ref(false), error = ref(''), notice = ref(''), skipUnknown = ref(false), itemPage = ref(0)
const labels = { add: '新增', same: '已有／保留', conflict: '状态冲突，按所选策略修改', unknown: '未知', mismatched: '不匹配', invalid: '非法' }
const sources = computed(() => legacySources(document.value))
const source = computed(() => sources.value.find(s => s.key === sourceKey.value))
const pageItems = computed(() => preview.value?.items.slice(itemPage.value * 50, (itemPage.value + 1) * 50) || [])
const canPreview = computed(() => props.canUse && !busy.value && !!document.value && (document.value.format ? document.value.game === props.game : !!source.value && !source.value.conflict && !!sourceGame.value && sourceGame.value === props.game))
let serial = 0, alive = true
const token = () => ({ serial: ++serial, identity: props.identity, account: props.accountId, game: props.game, generation: props.generation })
const matches = t => alive && t.serial === serial && t.identity === props.identity && t.account === props.accountId && t.game === props.game && t.generation === props.generation
function setBusy(value) { busy.value = value; emit('busy', value) }
function invalidate() { preview.value = null; skipUnknown.value = false; itemPage.value = 0; error.value = ''; notice.value = '' }
function clearFile() { serial++; invalidate(); document.value = null; filename.value = ''; sourceKey.value = ''; sourceGame.value = ''; strategy.value = 'merge' }
watch(sourceKey, () => { sourceGame.value = source.value?.game || ''; invalidate() })
watch([sourceGame, strategy], invalidate)
watch(() => [props.accountId, props.game, props.revision, props.catalogVersion, props.generation], () => { serial++; invalidate(); setBusy(false) })
watch(() => props.identity, () => { clearFile(); setBusy(false) })
async function readFile(event) {
  const file = event.target.files?.[0]; event.target.value = ''
  if (!file) return
  clearFile(); const t = token(); setBusy(true)
  try {
    if (file.size > MAX_BYTES) throw new Error('文件最多8MiB。')
    const parsed = readBondBackup(await file.text())
    if (!matches(t)) return
    document.value = parsed; filename.value = file.name
    if (!parsed.format && !legacySources(parsed).length) throw new Error('文件中没有可选择的旧账号。')
  } catch (e) { if (matches(t)) { document.value = null; error.value = e.message } }
  finally { if (matches(t)) setBusy(false) }
}
const body = () => ({ account_id: props.accountId, document: document.value, strategy: document.value?.format ? strategy.value : 'merge', source_account: document.value?.format ? null : sourceKey.value, source_game: document.value?.format ? null : sourceGame.value })
async function exportFile() {
  if (!props.canUse || busy.value) return
  const t = token(); setBusy(true); error.value = ''; notice.value = ''
  try {
    const result = await exportBonds(t.account, t.identity)
    if (!matches(t)) return
    if (result.format !== 'yuanhub-bonds' || result.game !== t.game) throw new Error('导出游戏或格式不一致。')
    downloadBondFile(result); notice.value = '已生成当前账号完整原生备份。'
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
