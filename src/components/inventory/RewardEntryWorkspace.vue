<template>
  <div class="reward-workspace">
    <div class="workspace-actions">
      <span v-if="disabled" class="muted">登录并选择子账号后可补录奖励</span>
      <button ref="manualButton" type="button" class="entry-button" :class="{ active: mode === 'manual' }" :disabled="disabled || locked" :aria-expanded="mode === 'manual'" aria-controls="reward-entry-panel" @click="open('manual')"><Plus :size="15" aria-hidden="true" />添加奖励流水</button>
      <button ref="reportButton" type="button" class="entry-button" :class="{ active: mode === 'report' }" :disabled="disabled || locked" :aria-expanded="mode === 'report'" aria-controls="reward-entry-panel" @click="open('report')"><Upload :size="15" aria-hidden="true" />导入本地报告</button>
    </div>

    <section v-if="mode" id="reward-entry-panel" class="reward-panel" :class="`mode-${mode}`" aria-labelledby="reward-entry-title" :aria-busy="busy">
      <header class="panel-heading">
        <span class="heading-emblem" aria-hidden="true"><BookOpen v-if="mode === 'manual'" :size="25" /><ScrollText v-else :size="25" /></span>
        <div class="heading-copy"><span class="eyebrow">广陵库房 · 奖励入簿</span><h3 id="reward-entry-title" ref="heading" tabindex="-1">{{ mode === 'manual' ? '添加奖励流水' : '导入本地报告' }}</h3></div>
        <span class="account-badge"><span class="account-dot" />{{ accountName }}</span>
        <button type="button" class="icon-button close-button" :disabled="locked" aria-label="收起奖励补录" @click="close"><X :size="18" aria-hidden="true" /></button>
      </header>

      <div v-if="error" ref="errorBox" class="error-message" role="alert" tabindex="-1"><CircleAlert :size="17" aria-hidden="true" /><span>{{ error }}</span></div>
      <div v-if="catalogLoading" class="loading-state" role="status">正在准备奖励目录…</div>
      <button v-else-if="!entities.length" type="button" class="outline-button retry-catalog" :disabled="busy" @click="loadCatalog">重新加载奖励目录</button>

      <form v-if="mode === 'manual' && entities.length" class="manual-form" novalidate @submit.prevent="previewManual">
        <fieldset :disabled="locked || !!result || disabled">
          <legend class="sr-only">填写奖励流水</legend>
          <div class="channel-section">
            <div class="section-label">获取渠道<span>选择本次奖励的来源</span></div>
              <div class="channel-options" role="group" aria-label="获取渠道">
                <button v-for="channel in REWARD_CHANNELS" :key="channel.id" type="button" class="channel-option" :class="{ selected: manual.channel === channel.id }" :aria-pressed="manual.channel === channel.id" @click="changeChannel(channel.id)">
                <component :is="channelIcons[channel.icon]" :size="20" aria-hidden="true" /><span><b>{{ channel.label }}</b><small>{{ channel.hint }}</small></span><span v-if="manual.channel === channel.id" class="channel-check"><Check :size="11" aria-hidden="true" /></span>
              </button>
            </div>
            <div class="reward-metadata">
              <label v-if="manual.channel === '手动补录'" class="custom-channel-field"><span>自定义渠道名称 <small>例如：活动邮件、月卡奖励</small></span><input v-model.trim="manual.customChannel" type="text" maxlength="64" placeholder="填写这笔奖励的来源" @input="clearPreview" /></label>
              <RewardDateTimePicker v-model:date="manual.date" v-model:clock="manual.clock" :disabled="locked || !!result || disabled" @update:date="clearPreview" @update:clock="clearPreview" />
              <label v-if="requiresStamina" class="stamina-field"><span>消耗体力<small>本次派遣</small></span><span class="stamina-input"><Flame :size="16" aria-hidden="true" /><input v-model="manual.stamina" type="text" inputmode="numeric" aria-label="消耗体力" placeholder="填写实际消耗" @input="clearPreview" /><span>点</span></span></label>
              <p v-if="manualBeforeLatestSnapshot" class="baseline-note"><History :size="14" aria-hidden="true" /><span>时间早于已知最新库存快照；服务端会保留这条历史，已被快照覆盖的数量不会再次增加当前库存。</span></p>
            </div>
          </div>
          <div class="manual-columns">
            <section class="reward-picker" aria-label="选择奖励">
              <div class="picker-heading"><h4>{{ manual.entityType === 'agent' ? '选择密探心纸' : '选择奖励道具' }}</h4><span>点击图标添加，重复点击累加</span></div>
              <div v-if="manual.channel === '手动补录'" class="type-options" role="group" aria-label="奖励类型"><button v-for="type in [{ id: 'item', label: '背包道具' }, { id: 'agent', label: '密探心纸' }]" :key="type.id" type="button" :class="{ selected: manual.entityType === type.id }" :aria-pressed="manual.entityType === type.id" @click="changeType(type.id)">{{ type.label }}</button></div>
              <div v-if="manual.channel !== '派遣-洛阳'" class="picker-tools">
                <label class="search-field"><Search :size="16" aria-hidden="true" /><input v-model="search" type="text" :aria-label="manual.entityType === 'agent' ? '搜索密探姓名' : '搜索奖励道具'" :placeholder="manual.entityType === 'agent' ? '搜索密探姓名…' : '搜索道具名称…'" /><button v-if="search" type="button" class="clear-search" aria-label="清空搜索" @click="search = ''"><X :size="14" aria-hidden="true" /></button></label>
                <div v-if="manual.entityType === 'agent'" class="rarity-options" role="group" aria-label="密探品质筛选"><button v-for="quality in qualities" :key="quality.id" type="button" :class="{ selected: rarity === quality.id }" :aria-pressed="rarity === quality.id" @click="rarity = quality.id">{{ quality.label }}</button></div>
              </div>
              <div class="reward-grid" :class="{ 'agent-grid': manual.entityType === 'agent', 'luoyang-grid': manual.channel === '派遣-洛阳' }">
                <button v-for="entity in visibleOptions" :key="entity.id" type="button" class="reward-tile" :class="{ chosen: countOf(entity.id) > 0, 'is-agent': entity.entity_type === 'agent' }" :style="{ '--quality': qualityColor(entity.rarity) }" :aria-label="`添加${entity.name}，当前已选 ${countOf(entity.id)}`" @click="addReward(entity)">
                  <span class="tile-image"><img v-if="!failedImages.has(entity.id)" :src="iconSrc(entity)" alt="" loading="lazy" @error="failedImages.add(entity.id)" /><span v-else class="image-fallback">{{ entity.name.slice(0, 1) }}</span><span class="tile-plus" aria-hidden="true"><Plus :size="12" /></span></span>
                  <span class="tile-name">{{ entity.name }}</span><span v-if="countOf(entity.id)" class="tile-count">{{ countOf(entity.id) }}</span>
                </button>
              </div>
              <p v-if="!visibleOptions.length" class="empty-search">没有匹配的奖励，试试其他名称或品质。</p>
              <p class="picker-caption">{{ entryOptions.length }} {{ manual.entityType === 'agent' ? '位密探可选' : '种道具可选' }}<span v-if="search || rarity"> · 当前显示 {{ visibleOptions.length }} 项</span></p>
            </section>

            <aside class="reward-receipt" aria-label="本次入账清单">
              <div class="receipt-heading"><span class="eyebrow">本次入账</span><span class="receipt-mark" aria-hidden="true"><ScrollText :size="20" /></span><h4>奖励清单</h4></div>
              <div class="basket-heading"><span>已选 <b>{{ manual.entries.length }}</b> 项</span><button v-if="manual.entries.length" type="button" class="text-button" @click="clearBasket">清空</button></div>
              <div v-if="!manual.entries.length" class="basket-empty"><PackageOpen :size="32" aria-hidden="true" /><span>从左侧选取本次奖励</span><small>选中后可在这里调整数量</small></div>
              <ul v-else class="basket-list"><li v-for="entry in manual.entries" :key="entry.id"><span class="basket-name">{{ entry.name }}</span><div class="quantity-control"><button type="button" :aria-label="`减少${entry.name}`" @click="adjustReward(entry, -1)"><Minus :size="12" aria-hidden="true" /></button><input :value="entry.count" type="text" inputmode="numeric" :aria-label="`${entry.name}数量`" @input="setCount(entry, $event.target.value)" /><button type="button" :aria-label="`增加${entry.name}`" @click="adjustReward(entry, 1)"><Plus :size="12" aria-hidden="true" /></button></div><button type="button" class="remove-reward" :aria-label="`移除${entry.name}`" @click="removeReward(entry.id)"><X :size="13" aria-hidden="true" /></button></li></ul>
              <button type="submit" class="primary-button preview-button" :disabled="!manual.entries.length"><span>{{ previewed ? '更新预览' : '预览本次流水' }}</span><ArrowRight :size="16" aria-hidden="true" /></button>
            </aside>
          </div>
        </fieldset>
      </form>

      <div v-if="mode === 'report' && entities.length" class="report-workbench">
        <fieldset :disabled="locked || disabled">
          <legend class="sr-only">选择上报报告</legend>
          <div class="report-source">
            <div class="file-section">
              <input ref="fileInput" class="sr-only" type="file" tabindex="-1" aria-label="选择上报报告文件" accept=".txt,.json,text/plain,application/json" @change="pickFile" />
              <button type="button" class="file-drop" :class="{ dragging: dragActive, loaded: fileName }" :disabled="readingFile" @click="fileInput?.click()" @dragover.prevent="dragActive = true" @dragleave.prevent="dragActive = false" @drop.prevent="dropFile">
                <span class="file-emblem"><FileCheck2 v-if="fileName" :size="27" aria-hidden="true" /><Upload v-else :size="27" aria-hidden="true" /></span>
                <span class="file-description"><b>{{ readingFile ? '正在读取报告…' : fileName || '点击选择，或拖入本地报告' }}</b><small>{{ fileName ? '已读取 · 点击更换文件' : 'DailyRewards TXT / 库存交换 JSON · 最大 5 MB' }}</small></span><ArrowUpRight :size="20" aria-hidden="true" />
              </button>
            </div>
            <div class="import-notes"><span><Check :size="14" aria-hidden="true" />默认选中上报失败的奖励</span><span><Check :size="14" aria-hidden="true" />重复记录自动去重</span><span><Check :size="14" aria-hidden="true" />未注明账号时归入「{{ accountName }}」</span></div>
          </div>
          <button type="button" class="paste-toggle" :aria-expanded="showPaste" aria-controls="reward-report-text" @click="showPaste = !showPaste"><ClipboardPaste :size="15" aria-hidden="true" />{{ showPaste ? '收起文本输入' : '也可以粘贴报告内容' }}<ChevronDown :size="14" :class="{ rotated: showPaste }" aria-hidden="true" /></button>
          <div v-if="showPaste" id="reward-report-text" class="paste-area"><label><span class="sr-only">上报报告内容</span><textarea v-model="reportText" rows="5" placeholder="粘贴 MaaYuan 库存记录或库存交换 v2 JSON…" @input="clearReportPreview" /></label><button type="button" class="outline-button" :disabled="!reportText.trim() || readingFile" @click="previewReport">解析并预览<ArrowRight :size="14" aria-hidden="true" /></button></div>
        </fieldset>
      </div>

      <div v-if="previewed" class="preview-section">
        <div class="preview-heading"><h4>{{ mode === 'manual' ? '确认本次流水' : '报告中的奖励' }}</h4><span class="preview-count" role="status" aria-live="polite">已选 <b>{{ selectedRecords.length }}</b> 条<span v-if="skipped"> · 跳过 {{ skipped }} 个库存快照</span></span><div v-if="mode === 'report' && rows.length" class="preview-tools"><button type="button" class="text-button" :disabled="locked || !!result" @click="selectFailed">仅选失败</button><span>·</span><button type="button" class="text-button" :disabled="locked || !!result" @click="rows.forEach(row => row.selected = false)">清空选择</button></div></div>
        <p v-if="!rows.length" class="empty-search">报告中没有可补录的奖励流水。</p>
        <ul v-else class="preview-list"><li v-for="row in rows" :key="row.key" :class="{ invalid: row.error, selected: row.selected }">
          <div v-if="row.record" class="preview-record">
            <label v-if="mode === 'report'" class="record-checkbox"><input v-model="row.selected" type="checkbox" :disabled="!!row.error || locked || !!result" :aria-label="`选择 ${row.record.acquisition_channel || '奖励'} ${row.record.effective_at}`" /><span class="checkbox-art"><Check :size="13" aria-hidden="true" /></span></label>
            <div class="record-date"><small>{{ new Date(row.record.effective_at).getFullYear() }}</small><b>{{ displayDay(row.record.effective_at) }}</b><time :datetime="row.record.effective_at" :title="row.record.effective_at">{{ displayClock(row.record.effective_at) }}</time></div>
            <div class="record-body"><div class="record-title"><b>{{ row.record.acquisition_channel || '未注明渠道' }}</b><span class="record-status" :class="{ failed: row.status?.includes('失败') }">{{ statusLabel(row.status) }}</span><span v-if="row.record.stamina_cost !== undefined" class="record-stamina"><Flame :size="12" aria-hidden="true" />{{ row.record.stamina_cost }}</span></div><div class="record-rewards"><span v-for="entry in row.record.entries" :key="entry.id">{{ entry.name || entry.id }}<b>× {{ entry.count }}</b></span></div></div>
            <button type="button" class="record-info" :aria-label="`查看${row.record.acquisition_channel || '奖励'}记录详情`" :aria-expanded="expandedRows.has(row.key)" @click="toggleDetails(row.key)"><ChevronDown :size="16" :class="{ rotated: expandedRows.has(row.key) }" aria-hidden="true" /></button>
          </div>
          <div v-if="row.record && expandedRows.has(row.key)" class="record-details"><span>{{ row.record.effective_at }}</span><span>{{ row.status }}</span><span>{{ row.record.record_id }}</span></div>
          <p v-if="row.error" class="row-error">第 {{ row.block }} 个记录块：{{ row.error }}</p>
        </li></ul>
        <div v-if="!result" class="confirm-bar"><p><ShieldCheck :size="16" aria-hidden="true" /><span>{{ pendingDocument ? '本次内容已锁定，请原样重试确认补录结果。' : '请核对发生时间与奖励内容，再确认入账。' }}</span></p><button type="button" class="primary-button submit-button" :disabled="busy || disabled || !selectedRecords.length || selectedRecords.length > 1000" @click="submit"><Check :size="16" aria-hidden="true" />{{ busy ? '正在补录…' : pendingDocument ? '原样重试补录' : `确认补录 ${selectedRecords.length} 条` }}</button></div>
      </div>
      <div v-if="result" class="result" role="status"><CircleCheck :size="23" aria-hidden="true" /><div><h4>{{ result.accepted === 0 && result.duplicates > 0 ? '记录已存在，未重复补录' : '奖励已入簿' }}</h4><p>接受 {{ result.accepted }} 条 · 重复 {{ result.duplicates }} 条 · 仅历史 {{ result.history_only }} 条 · 已归档 {{ result.superseded }} 条</p><ul v-if="result.warnings?.length"><li v-for="(warning, index) in result.warnings" :key="index">{{ warningText(warning) }}</li></ul></div><button type="button" class="outline-button" @click="startNext">{{ mode === 'manual' ? '再添加一条' : '继续导入' }}<ArrowRight :size="14" aria-hidden="true" /></button></div>
      <footer class="panel-footnote"><Info :size="13" aria-hidden="true" />历史奖励会补齐获得量；已被较新库存快照覆盖的部分，不重复增加库存。</footer>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { Plus, Minus, Upload, X, Check, BookOpen, ScrollText, Bird, Flower2, Pencil, Search, Flame, PackageOpen, ArrowRight, ArrowUpRight, FileCheck2, ClipboardPaste, ChevronDown, CircleAlert, CircleCheck, ShieldCheck, Info, History } from '@lucide/vue'
import { importInventory } from '../../api/inventory.js'
import { getRewardCatalog } from '../../api/rewardCatalog.js'
import { buildRewardDocument, parseRewardReport } from '../../data/inventory/rewardImport.js'
import { REWARD_CHANNELS, rewardOptionsForChannel, validateManualRewardChannel, manualAcquisitionChannel, manualRewardTimestamp } from '../../data/inventory/rewardChannels.js'
import RewardDateTimePicker from './RewardDateTimePicker.vue'

const props = defineProps({ accountId: { type: String, default: '' }, accountName: { type: String, default: '当前账号' }, latestInventoryAt: { type: String, default: '' }, disabled: Boolean })
const emit = defineEmits(['imported', 'busy'])
const mode = ref('')
const entities = ref([])
const catalogLoading = ref(false)
const busy = ref(false)
const error = ref('')
const result = ref(null)
const errorBox = ref(null)
const heading = ref(null)
const manualButton = ref(null)
const reportButton = ref(null)
const fileInput = ref(null)
const reportText = ref('')
const fileName = ref('')
const readingFile = ref(false)
const showPaste = ref(false)
const dragActive = ref(false)
const rows = ref([])
const skipped = ref(0)
const previewed = ref(false)
const pendingDocument = ref(null)
const search = ref('')
const rarity = ref(0)
const failedImages = ref(new Set())
const expandedRows = ref(new Set())
const locked = computed(() => busy.value || !!pendingDocument.value)
const selectedRecords = computed(() => rows.value.filter(row => row.selected && !row.error).map(row => row.record))
const channelIcons = { bird: Bird, flower: Flower2, scroll: ScrollText, book: BookOpen, pencil: Pencil }
const qualities = [{ id: 0, label: '全部' }, { id: 5, label: '金' }, { id: 4, label: '紫' }, { id: 3, label: '蓝' }]
let fileReadSeq = 0
function freshManual() {
  const date = new Date()
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString()
  return { date: local.slice(0, 10), clock: local.slice(11, 19), channel: '派遣-洛阳', customChannel: '', entityType: 'item', stamina: '', entries: [] }
}
const manual = ref(freshManual())
const entryOptions = computed(() => rewardOptionsForChannel(manual.value.channel, entities.value, manual.value.entityType))
const visibleOptions = computed(() => entryOptions.value.filter(entity => (!rarity.value || entity.rarity === rarity.value) && (!search.value.trim() || entity.name.includes(search.value.trim()) || entity.id.toLowerCase().includes(search.value.trim().toLowerCase()))))
const requiresStamina = computed(() => manual.value.channel.includes('派遣') || (manual.value.channel === '手动补录' && manual.value.customChannel.trim().includes('派遣')))
const manualBeforeLatestSnapshot = computed(() => {
  if (!props.latestInventoryAt || !manual.value.date || !manual.value.clock) return false
  const selected = Date.parse(`${manual.value.date}T${manual.value.clock}`)
  const latest = Date.parse(props.latestInventoryAt)
  return Number.isFinite(selected) && Number.isFinite(latest) && selected < latest
})
const counts = computed(() => new Map(manual.value.entries.map(entry => [entry.id, entry.count])))
const countOf = id => counts.value.get(id) || 0
const qualityColor = rarity => ({ 5: 'var(--accent)', 4: 'var(--brand-blue)', 3: 'var(--line)' })[rarity] || 'var(--line)'
const iconSrc = entity => `${import.meta.env.BASE_URL}inventory-icons/${entity.entity_type === 'agent' ? 'agents' : 'items'}/${encodeURIComponent(entity.id)}.png`

watch(locked, value => emit('busy', value), { flush: 'sync' })
watch(() => props.accountId, () => {
  fileReadSeq++
  readingFile.value = false
  mode.value = ''
  pendingDocument.value = null
  reportText.value = ''
  fileName.value = ''
  showPaste.value = false
  manual.value = freshManual()
  search.value = ''; rarity.value = 0
  clearPreview()
})
async function showError(message) {
  error.value = /Failed to fetch|NetworkError|Load failed/i.test(message) ? '网络连接失败，请检查连接后重试。' : message
  await nextTick()
  errorBox.value?.focus()
}
async function loadCatalog() {
  if (catalogLoading.value) return
  catalogLoading.value = true
  clearPreview()
  entities.value = []
  try {
    const catalog = await getRewardCatalog()
    if (!catalog.length) throw new Error('奖励目录为空，请稍后重试')
    entities.value = catalog
  } catch (err) { await showError(err.message || '奖励目录加载失败') }
  finally { catalogLoading.value = false }
}
async function open(nextMode) {
  if (props.disabled || locked.value) return
  if (mode.value !== nextMode) {
    if (mode.value === 'manual' && result.value) manual.value = freshManual()
    fileReadSeq++; readingFile.value = false; clearPreview()
  }
  mode.value = nextMode
  await nextTick()
  heading.value?.focus()
  // 每次打开重新核对目录，避免管理员删改密探后继续使用页面内缓存。
  await loadCatalog()
}
function close() {
  if (locked.value) return
  if (mode.value === 'manual' && result.value) manual.value = freshManual()
  fileReadSeq++; readingFile.value = false
  const button = mode.value === 'manual' ? manualButton : reportButton
  mode.value = ''
  button.value?.focus()
}
function clearPreview() { rows.value = []; skipped.value = 0; previewed.value = false; result.value = null; error.value = ''; expandedRows.value.clear() }
function clearReportPreview() { fileReadSeq++; readingFile.value = false; fileName.value = ''; clearPreview() }
function changeChannel(channel) {
  if (channel === manual.value.channel || locked.value) return
  manual.value.channel = channel
  manual.value.entityType = REWARD_CHANNELS.find(item => item.id === channel).entityType || manual.value.entityType
  const allowed = new Set(entryOptions.value.map(entry => entry.id))
  manual.value.entries = manual.value.entries.filter(entry => allowed.has(entry.id))
  manual.value.stamina = ''
  search.value = ''; rarity.value = 0
  clearPreview()
}
function changeType(type) { manual.value.entityType = type; manual.value.entries = []; search.value = ''; rarity.value = 0; clearPreview() }
function addReward(entity) {
  const entry = manual.value.entries.find(entry => entry.id === entity.id)
  if (entry) adjustReward(entry, 1)
  else { manual.value.entries.push({ id: entity.id, name: entity.name, count: entity.id === 'baijinbi' ? 10 : 1 }); clearPreview() }
}
function adjustReward(entry, delta) {
  const value = Number(entry.count)
  const step = entry.id === 'baijinbi' ? 10 : 1
  const next = (Number.isInteger(value) ? value : 0) + (delta * step)
  if (next <= 0) removeReward(entry.id)
  else { entry.count = Math.min(2147483647, next); clearPreview() }
}
function setCount(entry, value) { entry.count = value; clearPreview() }
function removeReward(id) { manual.value.entries = manual.value.entries.filter(entry => entry.id !== id); clearPreview() }
function clearBasket() { manual.value.entries = []; clearPreview() }
async function previewManual() {
  if (locked.value || props.disabled) return
  clearPreview()
  try {
    const draft = manual.value
    const acquisitionChannel = manualAcquisitionChannel(draft.channel, draft.customChannel)
    const record = {
      record_id: `yuanhub:reward:${crypto.randomUUID()}`, record_type: 'reward_delta',
      entity_type: draft.entityType, acquisition_channel: acquisitionChannel,
      effective_at: manualRewardTimestamp(draft.date, draft.clock),
      entries: draft.entries.map(entry => ({ id: entry.id, name: entry.name, count: /^\d+$/.test(String(entry.count)) ? Number(entry.count) : NaN })),
      ...(requiresStamina.value ? { stamina_cost: /^\d+$/.test(draft.stamina) ? Number(draft.stamina) : undefined } : {}),
    }
    validateManualRewardChannel(record, entities.value, draft.channel)
    const doc = buildRewardDocument([record], props.accountId, entities.value)
    rows.value = [{ key: record.record_id, block: 1, record: doc.records[0], status: '手动添加', selected: true, error: '' }]
    previewed.value = true
    await nextTick()
    heading.value?.closest('.reward-panel')?.querySelector('.preview-section')?.scrollIntoView({ block: 'nearest' })
  } catch (err) { showError(err.message) }
}
function pickFile(event) { const file = event.target.files?.[0]; event.target.value = ''; readReportFile(file) }
function dropFile(event) { dragActive.value = false; if (event.dataTransfer.files.length !== 1) { showError('请每次选择一份报告'); return }; readReportFile(event.dataTransfer.files[0]) }
async function readReportFile(file) {
  if (!file || locked.value || props.disabled || !entities.value.length) return
  const seq = ++fileReadSeq
  clearPreview(); reportText.value = ''; fileName.value = ''; readingFile.value = false
  if (file.size > 5 * 1024 * 1024) { showError('报告超过 5 MB，请按日期拆分后导入'); return }
  readingFile.value = true
  try {
    const text = await file.text()
    if (seq !== fileReadSeq) return
    fileName.value = file.name; reportText.value = text
    previewReport()
  } catch (err) { if (seq === fileReadSeq) showError(err.message || '文件读取失败') }
  finally { if (seq === fileReadSeq) readingFile.value = false }
}
function previewReport() {
  if (locked.value || props.disabled) return
  clearPreview()
  try {
    if (new Blob([reportText.value]).size > 5 * 1024 * 1024) throw new Error('报告超过 5 MB，请按日期拆分后导入')
    const preview = parseRewardReport(reportText.value, props.accountId, entities.value)
    rows.value = preview.rows; skipped.value = preview.skipped; previewed.value = true
  } catch (err) { showError(err.message) }
}
function selectFailed() { rows.value.forEach(row => { row.selected = !row.error && !!row.status?.includes('上报失败') }) }
function toggleDetails(key) { if (expandedRows.value.has(key)) expandedRows.value.delete(key); else expandedRows.value.add(key) }
async function submit() {
  if (busy.value || props.disabled || result.value) return
  error.value = ''
  const targetAccount = props.accountId
  try {
    if (!pendingDocument.value) pendingDocument.value = buildRewardDocument(selectedRecords.value, targetAccount, entities.value)
    busy.value = true
    const response = await importInventory(pendingDocument.value)
    if (props.accountId !== targetAccount) return
    if (!response || !['accepted', 'duplicates', 'history_only', 'superseded'].every(key => Number.isInteger(response[key]) && response[key] >= 0)) throw new Error('未收到有效的补录结果，请原样重试确认状态')
    result.value = response; pendingDocument.value = null
    emit('imported', targetAccount)
  } catch (err) {
    if (props.accountId === targetAccount) {
      if ([400, 401, 403, 404, 409, 422].includes(err.status)) pendingDocument.value = null
      await showError(err.message || '补录失败，请重试')
    }
  } finally { busy.value = false }
}
function startNext() { clearPreview(); manual.value = freshManual(); reportText.value = ''; fileName.value = ''; search.value = ''; rarity.value = 0 }
function warningText(warning) { return typeof warning === 'string' ? warning : warning?.message || JSON.stringify(warning) }
function displayDay(value) { return new Date(value).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) }
function displayClock(value) { return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) }
function statusLabel(value) { return value?.includes('失败') ? '上报失败' : value?.includes('成功') ? '已上报' : value === '手动添加' ? '手动添加' : '待核对' }
</script>

<style scoped>
.reward-workspace { --reward-gold: #af884d; --reward-gold-soft: rgba(175,136,77,.2); margin-bottom: 24px; color: var(--ink); font-family: var(--font-b); }
.reward-workspace *, .reward-workspace *::before, .reward-workspace *::after { box-sizing: border-box; }
.workspace-actions { display: flex; justify-content: flex-end; align-items: center; flex-wrap: wrap; gap: 10px; }
button, input, textarea { font: inherit; color: inherit; }
button { appearance: none; border: 0; cursor: pointer; background: transparent; padding: 0; transition: background .16s, border-color .16s, box-shadow .16s; }
button:disabled { opacity: .45; cursor: not-allowed; }
button:focus-visible, input:focus-visible, textarea:focus-visible, .error-message:focus { outline: 2px solid var(--tea); outline-offset: 3px; }
h3:focus { outline: none; }
input, textarea { appearance: none; border-radius: 0; }
input:disabled { cursor: not-allowed; }
.entry-button, .outline-button, .primary-button { display: inline-flex; align-items: center; justify-content: center; gap: 9px; min-height: 42px; padding: 10px 17px; border: 1px solid var(--line); border-radius: 10px; font-size: 12px; font-weight: 800; }
.entry-button { background: var(--surface); box-shadow: 0 3px 8px -6px rgba(73,59,44,.3); }
.entry-button:hover:not(:disabled), .entry-button.active { background: var(--cream); border-color: var(--reward-gold); }
.entry-button.active { box-shadow: inset 0 -2px 0 var(--reward-gold); }
.muted { color: var(--ink-60); font-size: 12px; }
.reward-panel { position: relative; margin-top: 16px; border: 1px solid var(--reward-gold-soft); border-radius: 20px; background: var(--surface); box-shadow: 0 16px 40px -32px rgba(73,59,44,.45), 0 2px 6px rgba(73,59,44,.03); }
.reward-panel::before { content: ''; position: absolute; inset: 5px; border: 1px solid var(--reward-gold-soft); border-radius: 15px; pointer-events: none; }
.panel-heading { display: flex; align-items: center; gap: 15px; padding: 26px 30px 23px; position: relative; border-bottom: 1px solid var(--line); background: linear-gradient(110deg, var(--cream), var(--surface) 70%); border-radius: 20px 20px 0 0; }
.heading-emblem { flex-shrink: 0; width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; color: var(--reward-gold); border: 1px solid var(--reward-gold-soft); box-shadow: 0 0 0 4px var(--surface), 0 0 0 5px var(--reward-gold-soft); }
.eyebrow { display: block; font-size: 10px; letter-spacing: .14em; font-weight: 600; color: var(--ink-60); }
h3, h4 { font-family: var(--font-s); font-weight: 900; margin: 0; }
h3 { font-size: 23px; letter-spacing: .06em; line-height: 1.35; margin-top: 5px; }
h4 { font-size: 17px; letter-spacing: .04em; }
.account-badge { margin-left: auto; border: 1px solid var(--line); border-radius: 99px; display: flex; align-items: center; gap: 7px; padding: 7px 11px; max-width: 220px; overflow-wrap: anywhere; font-size: 12px; }
.account-dot { width: 5px; height: 5px; background: var(--reward-gold); border-radius: 50%; flex-shrink: 0; }
.icon-button { display: grid; place-items: center; width: 36px; height: 36px; flex-shrink: 0; border-radius: 50%; color: var(--ink-60); }
.icon-button:hover:not(:disabled) { background: var(--paper); }
fieldset { margin: 0; padding: 0; border: 0; min-width: 0; }
.channel-section { padding: 22px 30px; }
.section-label { display: flex; align-items: baseline; gap: 12px; margin-bottom: 12px; font-size: 12px; font-weight: 800; }
.section-label > span { font-size: 11px; font-weight: 400; color: var(--ink-60); }
.channel-options { display: grid; grid-template-columns: repeat(5, minmax(0,1fr)); gap: 8px; }
.channel-option { display: flex; align-items: center; gap: 10px; position: relative; padding: 14px 12px; min-width: 0; text-align: left; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
.channel-option > svg { flex-shrink: 0; color: var(--ink-60); }
.channel-option b { font-size: 12px; display: block; font-weight: 700; }
.channel-option small { display: block; font-size: 10px; color: var(--ink-60); margin-top: 5px; }
.channel-option:hover:not(:disabled) { border-color: var(--reward-gold); background: var(--cream); }
.channel-option.selected { border-color: var(--reward-gold); background: linear-gradient(130deg,var(--cream),var(--paper)); box-shadow: inset 0 0 0 2px var(--surface); }
.channel-option.selected > svg { color: var(--tea); }
.channel-check { position: absolute; top: -5px; right: -4px; width: 16px; height: 16px; display: grid; place-items: center; border-radius: 50%; background: var(--tea); color: var(--cream); border: 2px solid var(--surface); }
.custom-channel-field { display: block; min-width: 0; width: 100%; }
.custom-channel-field > span { display: flex; align-items: baseline; gap: 9px; margin-bottom: 7px; font-size: 11px; font-weight: 800; }
.custom-channel-field small { color: var(--ink-60); font-size: 10px; font-weight: 400; }
.custom-channel-field input { width: 100%; min-height: 40px; padding: 9px 11px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); font-size: 12px; outline: none; }
.custom-channel-field input:focus { outline: 2px solid var(--tea); outline-offset: 2px; }
.reward-metadata { display: grid; grid-template-columns: minmax(210px, 280px) minmax(260px, 360px) minmax(140px, 200px); gap: 18px; align-items: end; margin-top: 20px; }
.manual-columns { display: grid; grid-template-columns: minmax(0,1fr) 320px; border-top: 1px solid var(--line); }
.reward-picker { padding: 24px 26px 20px 30px; min-width: 0; }
.picker-heading { display: flex; justify-content: space-between; flex-wrap: wrap; align-items: baseline; gap: 8px; margin-bottom: 18px; }
.picker-heading > span { color: var(--ink-60); font-size: 10px; }
.picker-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 18px; }
.search-field { flex: 1; display: flex; align-items: center; min-width: 150px; border: 1px solid var(--line); border-radius: 8px; padding-left: 10px; background: var(--cream); color: var(--ink-60); }
.search-field input { min-width: 0; width: 100%; background: transparent; border: 0; padding: 10px; font-size: 12px; outline: none; }
.search-field:focus-within { outline: 2px solid var(--tea); outline-offset: 2px; }
.clear-search { display: grid; place-items: center; width: 32px; height: 36px; flex-shrink: 0; }
.rarity-options, .type-options { display: flex; gap: 3px; padding: 3px; border-radius: 8px; background: var(--cream); border: 1px solid var(--line); }
.rarity-options button, .type-options button { min-height: 30px; padding: 5px 10px; font-size: 11px; border-radius: 5px; }
.rarity-options .selected, .type-options .selected { background: var(--surface); color: var(--tea); box-shadow: 0 1px 4px rgba(73,59,44,.1); font-weight: 800; }
.type-options { width: fit-content; margin-bottom: 14px; }
.reward-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(78px,1fr)); gap: 14px 10px; max-height: 358px; overflow-y: auto; padding: 5px 5px 10px; scrollbar-width: thin; scrollbar-color: var(--reward-gold-soft) transparent; }
.reward-grid.luoyang-grid { grid-template-columns: repeat(5,minmax(0,1fr)); overflow: visible; max-height: none; gap: 8px; }
.reward-tile { position: relative; display: flex; flex-direction: column; align-items: center; gap: 9px; min-width: 0; padding: 8px 4px 10px; border: 1px solid transparent; border-radius: 12px; }
.reward-tile:hover:not(:disabled) { background: var(--cream); border-color: var(--line); }
.reward-tile.chosen { background: var(--cream); border-color: var(--reward-gold); }
.tile-image { position: relative; display: grid; place-items: center; width: 62px; height: 62px; max-width: 100%; aspect-ratio: 1; border-radius: 11px; background: radial-gradient(ellipse at center, var(--paper), transparent 72%); }
.tile-image img { width: 100%; height: 100%; object-fit: contain; }
.is-agent .tile-image { width: 62px; height: 62px; border-radius: 11px; border: 0; background: radial-gradient(ellipse at center, var(--paper), transparent 72%); overflow: visible; }
.is-agent img { object-fit: contain; border-radius: 0; }
.tile-plus { display: grid; place-items: center; position: absolute; bottom: -1px; right: -1px; width: 18px; height: 18px; border: 1px solid var(--line); border-radius: 50%; background: var(--surface); color: var(--ink-60); }
.chosen .tile-plus { color: var(--tea); border-color: var(--reward-gold); }
.tile-name { font-size: 11px; font-weight: 700; text-align: center; line-height: 1.4; overflow-wrap: anywhere; }
.tile-count { position: absolute; top: -5px; right: -5px; min-width: 20px; height: 20px; padding: 0 5px; display: grid; place-items: center; background: var(--tea); color: var(--cream); border: 2px solid var(--surface); border-radius: 99px; font: 10px 'Archivo',var(--font-b); max-width: 100%; overflow: hidden; }
.image-fallback { font: 900 26px var(--font-s); color: var(--reward-gold); }
.picker-caption { margin: 12px 0 0; color: var(--ink-60); font-size: 10px; }
.reward-receipt { position: relative; padding: 22px; border-left: 1px solid var(--line); background: linear-gradient(150deg, var(--cream), var(--surface)); min-width: 0; }
.receipt-heading { position: relative; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid var(--reward-gold-soft); }
.receipt-heading h4 { margin-top: 5px; font-size: 20px; }
.receipt-mark { position: absolute; right: 0; top: 0; font: 900 19px var(--font-s); color: var(--reward-gold); border: 1px solid var(--reward-gold); border-radius: 4px; padding: 3px 7px; box-shadow: inset 0 0 0 2px var(--cream); transform: rotate(5deg); opacity: .65; }
.stamina-field { display: block; }
.stamina-field > span:first-child { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 12px; font-weight: 800; }
.stamina-field small { font-size: 10px; color: var(--ink-60); font-weight: 400; }
.stamina-input { display: flex; align-items: center; gap: 9px; padding: 0 11px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface); }
.stamina-input > svg { color: var(--reward-gold); }
.stamina-input input { border: 0; background: transparent; min-width: 0; width: 100%; height: 40px; outline: none; font: 13px 'Archivo',var(--font-b); }
.stamina-input > span { color: var(--ink-60); font-size: 11px; }
.stamina-input:focus-within { outline: 2px solid var(--tea); outline-offset: 2px; }
.baseline-note { grid-column: 1 / -1; display: flex; align-items: flex-start; gap: 7px; margin: 0; color: var(--ink-60); font-size: 10px; line-height: 1.7; }
.baseline-note svg { flex-shrink: 0; margin-top: 2px; color: var(--reward-gold); }
.basket-heading { display: flex; justify-content: space-between; align-items: center; margin: 0 0 8px; font-size: 11px; }
.basket-heading b { font-family: 'Archivo',var(--font-b); }
.text-button { font-size: 11px; color: var(--ink-60); min-height: 32px; }
.text-button:hover:not(:disabled) { color: var(--tea); text-decoration: underline; text-underline-offset: 3px; }
.basket-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 9px; padding: 16px 0 23px; font-size: 12px; color: var(--ink-60); }
.basket-empty svg { color: var(--reward-gold); opacity: .55; margin-bottom: 4px; }
.basket-empty small { font-size: 10px; }
.basket-list { margin: 0 0 15px; padding: 0 2px; list-style: none; max-height: 248px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--reward-gold-soft) transparent; }
.basket-list li { display: flex; gap: 5px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--reward-gold-soft); }
.basket-list li:last-child { border: 0; }
.basket-name { font-size: 11px; flex: 1; min-width: 0; overflow-wrap: anywhere; }
.quantity-control { display: flex; align-items: center; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); flex-shrink: 0; }
.quantity-control button { display: grid; place-items: center; width: 25px; min-height: 30px; color: var(--ink-60); border-radius: 6px; }
.quantity-control button:hover:not(:disabled) { background: var(--paper); }
.quantity-control input { min-width: 0; width: 40px; height: 30px; border: 0; background: transparent; text-align: center; padding: 0 2px; font: 12px 'Archivo',var(--font-b); }
.remove-reward { display: grid; place-items: center; width: 24px; min-height: 32px; color: var(--ink-60); }
.primary-button { background: var(--tea); color: var(--cream); border-color: var(--tea); box-shadow: inset 0 0 0 2px rgba(255,248,236,.08), 0 5px 12px -8px var(--tea); }
.primary-button:hover:not(:disabled) { background: var(--ink); }
.preview-button { width: 100%; justify-content: space-between; margin-top: 5px; }
.outline-button { background: var(--surface); }
.outline-button:hover:not(:disabled) { border-color: var(--reward-gold); background: var(--cream); }
.report-workbench { padding: 26px 30px 20px; }
.report-source { display: grid; grid-template-columns: minmax(0,1fr) 250px; gap: 26px; align-items: center; }
.file-drop { display: flex; align-items: center; gap: 20px; width: 100%; min-height: 136px; padding: 23px; border: 1px dashed var(--reward-gold); border-radius: 14px; text-align: left; background: linear-gradient(120deg,var(--cream),var(--surface)); }
.file-drop:hover:not(:disabled), .file-drop.dragging { background: var(--paper); box-shadow: inset 0 0 0 4px var(--surface); }
.file-drop.loaded { border-style: solid; }
.file-emblem { display: grid; place-items: center; width: 58px; height: 66px; flex-shrink: 0; color: var(--reward-gold); border: 1px solid var(--line); border-radius: 8px 8px 15px 8px; background: var(--surface); box-shadow: 4px 4px 0 var(--reward-gold-soft); }
.file-description { min-width: 0; flex: 1; }
.file-description b { display: block; font: 900 17px var(--font-s); overflow-wrap: anywhere; }
.file-description small { display: block; margin-top: 9px; color: var(--ink-60); font-size: 11px; line-height: 1.7; }
.file-drop > svg { flex-shrink: 0; color: var(--reward-gold); }
.import-notes { display: grid; gap: 14px; font-size: 11px; color: var(--ink-60); }
.import-notes span { display: flex; align-items: center; gap: 8px; }
.import-notes svg { flex-shrink: 0; color: var(--reward-gold); }
.paste-toggle { display: inline-flex; align-items: center; gap: 8px; min-height: 38px; margin-top: 13px; color: var(--ink-60); font-size: 11px; }
.rotated { transform: rotate(180deg); }
.paste-area { padding-top: 10px; }
.paste-area textarea { width: 100%; min-height: 110px; padding: 13px; background: var(--cream); border: 1px solid var(--line); border-radius: 10px; font-size: 12px; line-height: 1.8; resize: vertical; }
.paste-area > button { display: flex; margin: 10px 0 0 auto; }
.preview-section { padding: 23px 30px 0; border-top: 1px solid var(--line); }
.preview-heading { display: flex; align-items: center; gap: 15px; flex-wrap: wrap; margin-bottom: 15px; }
.preview-count { font-size: 11px; color: var(--ink-60); }
.preview-count b { color: var(--ink); font-family: 'Archivo',var(--font-b); }
.preview-tools { margin-left: auto; display: flex; align-items: center; gap: 10px; color: var(--ink-60); }
.preview-list { list-style: none; margin: 0; padding: 0; max-height: 380px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--reward-gold-soft) transparent; }
.preview-list > li { padding: 15px 0; border-bottom: 1px solid var(--line); }
.preview-list > li:first-child { border-top: 1px solid var(--line); }
.preview-record { display: flex; align-items: center; gap: 18px; }
.record-checkbox { position: relative; display: grid; place-items: center; width: 32px; min-height: 44px; flex-shrink: 0; cursor: pointer; }
.record-checkbox input { position: absolute; opacity: 0; width: 100%; height: 100%; inset: 0; margin: 0; cursor: pointer; }
.checkbox-art { display: grid; place-items: center; width: 20px; height: 20px; border: 1px solid var(--reward-gold); border-radius: 5px; color: transparent; background: var(--surface); pointer-events: none; }
.record-checkbox input:checked + .checkbox-art { background: var(--tea); border-color: var(--tea); color: var(--cream); }
.record-checkbox input:focus-visible + .checkbox-art { outline: 2px solid var(--tea); outline-offset: 3px; }
.record-checkbox input:disabled + .checkbox-art { opacity: .4; }
.record-date { display: flex; flex-direction: column; gap: 5px; flex-shrink: 0; width: 63px; padding-right: 10px; border-right: 1px solid var(--line); font-family: 'Archivo',var(--font-b); }
.record-date b { font-size: 17px; font-weight: 500; }
.record-date small { font-size: 9px; color: var(--ink-60); }
.record-date time { font-size: 10px; color: var(--ink-60); }
.record-body { flex: 1; min-width: 0; }
.record-title { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.record-title > b { font-size: 12px; }
.record-status { border: 1px solid var(--line); border-radius: 5px; padding: 2px 6px; font-size: 9px; color: var(--ink-60); }
.record-status.failed { color: var(--rouge); border-color: rgba(166,81,74,.2); }
.record-stamina { display: flex; align-items: center; gap: 3px; color: var(--ink-60); font: 10px 'Archivo',var(--font-b); }
.record-rewards { display: flex; flex-wrap: wrap; gap: 5px 16px; margin-top: 9px; font-size: 11px; line-height: 1.6; }
.record-rewards > span { display: inline-flex; gap: 6px; }
.record-rewards b { font-family: 'Archivo',var(--font-b); font-weight: 500; }
.record-info { display: grid; place-items: center; width: 32px; min-height: 36px; flex-shrink: 0; color: var(--ink-60); border-radius: 6px; }
.record-info:hover { background: var(--cream); }
.record-details { display: grid; gap: 7px; padding: 12px; margin-top: 12px; background: var(--cream); border-radius: 7px; font-size: 11px; line-height: 1.7; overflow-wrap: anywhere; }
.confirm-bar { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 20px 0; }
.confirm-bar p { display: flex; align-items: center; gap: 8px; font-size: 11px; line-height: 1.7; color: var(--ink-60); margin: 0; }
.confirm-bar svg { flex-shrink: 0; }
.submit-button { flex-shrink: 0; }
.panel-footnote { display: flex; gap: 7px; align-items: center; justify-content: center; padding: 14px 25px; border-top: 1px solid var(--line); color: var(--ink-60); font-size: 10px; line-height: 1.7; }
.panel-footnote svg { flex-shrink: 0; }
.error-message { display: flex; align-items: flex-start; gap: 8px; padding: 13px 15px; margin: 20px 30px; color: var(--rouge); background: var(--cream); border: 1px solid rgba(166,81,74,.25); border-radius: 9px; font-size: 12px; line-height: 1.7; overflow-wrap: anywhere; }
.error-message > svg { flex-shrink: 0; margin-top: 2px; }
.row-error { color: var(--rouge); font-size: 12px; line-height: 1.7; margin: 7px 0; }
.empty-search, .loading-state { padding: 26px; text-align: center; font-size: 12px; color: var(--ink-60); }
.retry-catalog { margin: 0 30px 20px; }
.result { display: flex; align-items: center; gap: 14px; padding: 20px; margin: 22px 30px; background: var(--cream); border: 1px solid var(--reward-gold-soft); border-radius: 12px; }
.result > svg { color: var(--reward-gold); flex-shrink: 0; }
.result > div { flex: 1; min-width: 0; }
.result p, .result li { font-size: 11px; line-height: 1.8; overflow-wrap: anywhere; }
.result p { margin: 7px 0 0; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
@media (max-width: 1100px) {
  .channel-option { padding: 12px 9px; gap: 7px; }
  .channel-option > svg { display: none; }
  .manual-columns { grid-template-columns: minmax(0,1fr) 296px; }
  .reward-picker { padding: 22px 18px; }
  .reward-receipt { padding: 20px 17px; }
  .reward-grid.luoyang-grid { grid-template-columns: repeat(3,minmax(0,1fr)); }
  .report-source { grid-template-columns: minmax(0,1fr) 200px; gap: 20px; }
  .reward-metadata { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 760px) {
  .panel-heading { padding: 22px; gap: 12px; }
  .heading-emblem { width: 39px; height: 39px; }
  h3 { font-size: 20px; }
  .channel-section { padding: 20px; }
  .channel-options { grid-template-columns: repeat(3,minmax(0,1fr)); }
  .channel-option { min-height: 60px; }
  .manual-columns { grid-template-columns: minmax(0,1fr); }
  .reward-picker { padding: 20px; }
  .reward-grid.luoyang-grid { grid-template-columns: repeat(5,minmax(0,1fr)); }
  .reward-receipt { border-left: 0; border-top: 1px solid var(--line); padding: 20px; }
  .receipt-heading { display: none; }
  .basket-empty { padding: 10px; }
  .basket-empty svg { display: none; }
  .report-workbench { padding: 22px; }
  .report-source { grid-template-columns: minmax(0,1fr); gap: 18px; }
  .import-notes { gap: 9px; }
  .preview-section { padding: 20px 22px 0; }
  .result { margin: 20px; flex-wrap: wrap; }
}
@media (max-width: 480px) {
  .workspace-actions { gap: 8px; }
  .entry-button { padding: 10px 12px; font-size: 11px; }
  .panel-heading { padding: 20px 17px; gap: 10px; flex-wrap: wrap; }
  .heading-emblem { display: none; }
  .account-badge { font-size: 10px; max-width: 110px; padding: 5px 8px; }
  .close-button { width: 26px; height: 32px; }
  .eyebrow { font-size: 9px; }
  h3 { font-size: 19px; }
  .channel-section, .reward-picker, .reward-receipt { padding: 18px 16px; }
  .section-label > span { font-size: 10px; }
  .reward-metadata { grid-template-columns: minmax(0,1fr); gap: 14px; margin-top: 18px; }
  .channel-option b { font-size: 11px; }
  .channel-option small { font-size: 9px; }
  .reward-grid { grid-template-columns: repeat(4,minmax(0,1fr)); gap: 10px 5px; }
  .reward-grid.luoyang-grid { grid-template-columns: repeat(3,minmax(0,1fr)); }
  .reward-tile { padding: 6px 3px 8px; }
  .tile-name { font-size: 10px; }
  .tile-image { width: 54px; height: 54px; }
  .is-agent .tile-image { width: 54px; height: 54px; }
  .picker-heading { gap: 6px; }
  .picker-heading > span { font-size: 9px; }
  .picker-tools { gap: 8px; }
  .search-field { min-width: 125px; }
  .rarity-options button { padding: 5px 8px; }
  .report-workbench { padding: 20px 16px; }
  .file-drop { gap: 14px; padding: 20px 15px; }
  .file-emblem { width: 40px; height: 51px; }
  .file-description b { font-size: 15px; }
  .file-drop > svg { display: none; }
  .preview-section { padding: 18px 16px 0; }
  .preview-heading { gap: 7px; }
  .preview-tools { width: 100%; justify-content: flex-end; }
  .preview-record { gap: 8px; align-items: flex-start; }
  .record-date { width: 53px; padding-right: 5px; margin-top: 3px; }
  .record-date b { font-size: 15px; }
  .record-checkbox { width: 22px; }
  .record-title { gap: 6px; }
  .record-title > b { font-size: 11px; }
  .record-info { width: 23px; }
  .record-rewards { gap: 5px 10px; font-size: 10px; }
  .confirm-bar { flex-direction: column; align-items: stretch; gap: 12px; }
  .panel-footnote { padding: 12px 17px; font-size: 9px; align-items: flex-start; }
  .panel-footnote svg { margin-top: 2px; }
  .error-message { margin: 16px; }
}
@media (prefers-reduced-motion: reduce) { button { transition: none; } }
</style>
