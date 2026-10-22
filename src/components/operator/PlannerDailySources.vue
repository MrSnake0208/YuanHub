<template>
  <section class="condition-module daily-sources" aria-labelledby="daily-sources-title">
    <header class="condition-module-heading"><h3 id="daily-sources-title">我的体力来源</h3><p>这个账号的日常设置。</p></header>
    <div class="condition-summary-grid">
      <button type="button" class="condition-summary-card" aria-haspopup="dialog" :disabled="disabled" @click="open('monthly')">
        <span class="condition-summary-icon"><Tickets :size="25" aria-hidden="true" /></span>
        <span class="condition-summary-copy"><b>月卡与商店体力</b><span>{{ monthlyStatus }}</span><small>每日奖励 {{ savedMonthlyDaily }} · 商店预计领取 {{ savedMonthlyShop }} 体力</small></span>
        <ChevronRight :size="18" aria-hidden="true" />
      </button>
      <button type="button" class="condition-summary-card" aria-haspopup="dialog" :disabled="disabled" @click="open('fixed')">
        <span class="condition-summary-icon"><Gift :size="25" aria-hidden="true" /></span>
        <span class="condition-summary-copy"><b>其他每日固定来源</b><span>已启用 {{ enabledCount }} 项 · 合计 {{ savedFixedTotal }} 体力/日</span><small v-if="!savedSources.fixedSources.length">可选择已有来源，也可添加自己的来源</small><small v-else-if="disabledCount">另有 {{ disabledCount }} 项已停用</small></span>
        <ChevronRight :size="18" aria-hidden="true" />
      </button>
    </div>
    <p class="source-note source-forecast-note">按今天的有效设置显示，预计领取的体力不代表库存。</p>
    <p v-if="notice" class="source-note" role="status">{{ notice }}</p>
    <details v-if="allowApplication" class="source-application-region">
      <summary id="source-application-title"><CalendarDays :size="16" aria-hidden="true" /><span>更新已有未来日程</span><small>先查看影响，再确认更新</small></summary>
      <p id="source-application-help" class="source-note">将已保存的体力来源用于当前清单；过去记录和支出保留。</p>
      <fieldset class="source-application" aria-describedby="source-application-help" :disabled="disabled || busy || Boolean(editor) || !sources">
        <legend class="sr-only">更新当前清单的未来日程</legend>
        <label class="application-date">开始日期<input v-model="fromDate" type="date" :min="today" required aria-label="固定来源应用开始日期" @input="emit('clear-preview')" /></label>
        <label class="overwrite-option"><input v-model="overwrite" type="checkbox" @change="emit('clear-preview')" /><span>替换手工日期中的对应来源（保留支出）</span></label>
        <div class="source-actions"><button type="button" :disabled="!validFromDate" @click="previewSchedule">查看将修改的日程</button><button type="button" class="source-primary" :disabled="!preview || confirming" @click="confirmApply">{{ confirming ? '等待确认…' : '应用到未来日程' }}</button></div>
        <p v-if="preview" class="source-preview" role="status">{{ preview.fromDate }} 至 {{ preview.throughDate }}：影响 {{ preview.affectedDates }} 个日期，保留 {{ preview.preservedManualDates }} 个手工日期；过去不变。</p>
      </fieldset>
      <p v-if="!sources" class="source-note">请先打开上方任一来源设置，保存为这个账号的日常设置。</p>
      <p v-if="applicationError" class="source-error" role="alert">{{ applicationError }}</p>
    </details>
    <PlannerSettingsPanel :open="Boolean(editor)" :title="editor === 'monthly' ? '月卡与商店体力' : '其他每日固定来源'" :description="editor === 'monthly' ? '保存后直接同步当前方案今天及未来的月卡体力，保留其他收入和手工支出。' : '保存为这个账号的日常设置，以后规划自动沿用。已有日程需要单独更新。'" :save-label="editor === 'monthly' ? '保存并同步当前方案' : '保存为这个账号的日常设置'" :dirty="dirty" :busy="busy" :error="localError || (stale && !busy ? '云端配置已更新，请关闭后重新打开，再进行修改。' : '')" :save-disabled="disabled || stale || (editor !== 'monthly' && !dirty && Boolean(sources))" @close="close" @save="save">
      <fieldset v-if="editor === 'monthly'" class="source-editor" :disabled="disabled || busy || stale">
        <legend class="sr-only">月卡与商店编辑</legend>
        <label>月卡权益档位<select v-model="draft.monthlyCard.tier" aria-label="月卡权益档位" @change="changeTier"><option v-for="tier in tiers" :key="tier.id" :value="tier.id">{{ tier.label }}</option></select></label>
        <div class="source-fields">
          <div class="amount-field"><label class="checkbox-label"><input v-model="draft.monthlyCard.dailyEnabled" type="checkbox" :disabled="draft.monthlyCard.tier === 'none'" @change="changed" /><span>每日奖励</span></label><label class="amount-input"><span class="sr-only">月卡每日奖励体力</span><input v-model.number="draft.monthlyCard.dailyAmount" type="number" min="0" max="99999" step="1" required aria-label="月卡每日奖励体力" @input="changed" /><span>体力/日</span></label></div>
          <div class="amount-field"><label class="checkbox-label"><input v-model="draft.monthlyCard.shopEnabled" type="checkbox" :disabled="draft.monthlyCard.tier === 'none'" @change="changed" /><span>商店领取</span></label><label class="amount-input"><span class="sr-only">月卡商店免费体力</span><input v-model.number="draft.monthlyCard.shopAmount" type="number" min="0" max="99999" step="1" required aria-label="月卡商店免费体力" @input="changed" /><span>体力/日</span></label></div>
        </div>
        <div class="source-fields date-fields"><label>生效日期<input v-model="draft.monthlyCard.startDate" type="date" aria-label="月卡生效日期" @input="changed" /></label><label>有效至（含当天）<input v-model="draft.monthlyCard.endDate" type="date" aria-label="月卡有效至" @input="changed" /></label></div>
        <p class="source-note">商店需要主动领取，勾选后纳入预测；不会写入真实库存。</p>
        <details><summary>预测说明</summary><p class="source-note">数值为可编辑参考预设，请按实际权益调整。日期留空表示不限制该端；每周兑换300不计入每日。未生效或已过期的月卡不计入预测。</p></details>
        <p class="daily-total" role="status">按当前修改，今天预计 <strong>{{ monthlyTotal }} 体力</strong></p>
      </fieldset>
      <fieldset v-else-if="editor === 'fixed'" class="source-editor" :disabled="disabled || busy || stale">
        <legend class="sr-only">其他每日固定来源管理</legend>
        <div class="source-actions source-create"><select v-model="selectedSource" aria-label="从已有体力来源创建固定模板" :disabled="draft.fixedSources.length >= 32" @change="addExisting"><option value="">选择已有来源，加入每日固定</option><option v-for="entry in availableSources" :key="entry.id" :value="entry.id">{{ entry.label }}</option></select><button type="button" :disabled="draft.fixedSources.length >= 32" @click="addCustom"><Plus :size="16" aria-hidden="true" />新增自定义来源</button></div>
        <p class="source-note">勾选的来源每天预计领取一次；取消每日固定后，该来源不再自动计入。</p>
        <div class="fixed-sources-list">
          <div v-for="(source, index) in draft.fixedSources" :key="source.id" class="fixed-source-item">
            <div class="fixed-source-name"><input v-model="source.label" maxlength="32" required :aria-label="'固定来源名称' + (index + 1)" @input="changed" /><button type="button" :aria-label="'删除固定来源' + source.label" @click="draft.fixedSources.splice(index, 1); changed()"><Trash2 :size="16" aria-hidden="true" /></button></div>
            <div class="fixed-source-values"><label class="checkbox-label"><input v-model="source.enabled" type="checkbox" :aria-label="'启用固定来源' + source.label" @change="changed" /><span>{{ source.enabled ? '每日固定' : '已停用' }}</span></label><label class="amount-input"><span class="sr-only">{{ source.label }}每日体力</span><input v-model.number="source.value" type="number" min="0" max="99999" step="1" required :aria-label="'固定来源每日体力' + (index + 1)" @input="changed" /><span>体力/日</span></label></div>
          </div>
          <p v-if="!draft.fixedSources.length" class="source-empty source-note">还没有其他每日固定来源。不设置也可以开始规划。</p>
        </div>
        <div class="daily-total" role="status"><b>其他固定来源合计</b><strong>{{ fixedTotal }} 体力/日</strong></div>
        <details><summary>哪些体力会计入？</summary><p class="source-note">仅统计启用的固定来源，不含月卡和一次性储备。同一来源只计一次，并替换日程中同一项来源的数量，不会重复叠加；未领取不计库存。</p></details>
      </fieldset>
    </PlannerSettingsPanel>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { CalendarDays, ChevronRight, Gift, Plus, Tickets, Trash2 } from '@lucide/vue'
import { GAIN_CHANNELS } from '../../data/cultivationPlanner.js'
import { emptyStaminaSources, MONTHLY_STAMINA_IDS, normalizeStaminaSources, resolveDailyStaminaGains, validateStaminaSources } from '../../data/dailyStaminaSources.js'
import { monthlyCardTier, monthlyCardTiers } from '../../data/monthlyCard.js'
import { dialog } from '../../utils/dialog.js'
import PlannerSettingsPanel from './PlannerSettingsPanel.vue'

const props = defineProps({ sources: Object, accountId: String, planId: String, revision: Number, game: { type: String, default: '代号鸢' }, today: String, selectedDate: String, gains: { type: Array, default: () => [] }, disabled: Boolean, preview: Object, allowApplication: { type: Boolean, default: true } })
const emit = defineEmits(['save', 'preview', 'apply', 'clear-preview'])
const draft = ref(emptyStaminaSources()), base = ref(''), busy = ref(false), localError = ref(''), loadedRevision = ref(0)
const editor = ref(''), selectedSource = ref(''), fromDate = ref(''), overwrite = ref(false), notice = ref(''), confirming = ref(false), applicationError = ref('')
let generation = 0, applicationGeneration = 0
onBeforeUnmount(() => { generation++; applicationGeneration++ })
const tiers = computed(() => monthlyCardTiers(props.game))
const savedSources = computed(() => normalizeStaminaSources(props.sources))
const gainsFor = sources => resolveDailyStaminaGains([], { sourcePeriods: [{ fromDate: props.today, sources }] }, props.today)
const savedGains = computed(() => gainsFor(savedSources.value))
const savedMonthlyDaily = computed(() => savedGains.value.find(entry => entry.id === MONTHLY_STAMINA_IDS[0])?.value || 0)
const savedMonthlyShop = computed(() => savedGains.value.find(entry => entry.id === MONTHLY_STAMINA_IDS[1])?.value || 0)
const savedFixedTotal = computed(() => savedGains.value.filter(entry => !MONTHLY_STAMINA_IDS.includes(entry.id)).reduce((sum, entry) => sum + entry.value, 0))
const enabledCount = computed(() => savedSources.value.fixedSources.filter(source => source.enabled).length)
const disabledCount = computed(() => savedSources.value.fixedSources.length - enabledCount.value)
const monthlyStatus = computed(() => {
  const card = savedSources.value.monthlyCard, tier = monthlyCardTier(card.tier, props.game).label
  if (card.tier === 'none') return '未启用月卡'
  if (card.startDate && card.startDate > props.today) return tier + ' · ' + card.startDate + ' 起生效'
  if (card.endDate && card.endDate < props.today) return tier + ' · 已过期'
  return tier + '月卡生效中'
})
const dirty = computed(() => Boolean(editor.value) && JSON.stringify(draft.value) !== base.value)
const stale = computed(() => Boolean(editor.value) && (loadedRevision.value !== props.revision || base.value !== JSON.stringify(savedSources.value)))
const dailyGains = computed(() => gainsFor(normalizeStaminaSources(draft.value)))
const monthlyTotal = computed(() => dailyGains.value.filter(entry => MONTHLY_STAMINA_IDS.includes(entry.id)).reduce((sum, entry) => sum + entry.value, 0))
const fixedTotal = computed(() => dailyGains.value.filter(entry => !MONTHLY_STAMINA_IDS.includes(entry.id)).reduce((sum, entry) => sum + entry.value, 0))
const availableSources = computed(() => [...new Map([...GAIN_CHANNELS.filter(entry => entry.id !== 'custom').map(entry => ({ ...entry, value: entry.defaultValue })), ...props.gains].map(entry => [entry.id, entry])).values()]
  .filter(entry => !['buy', 'reserve', 'required-extra', 'diagnostic-budget', ...MONTHLY_STAMINA_IDS].includes(entry.id) && !entry.id.startsWith('planner-reserve-') && !draft.value.fixedSources.some(source => source.id === entry.id)))
const validFromDate = computed(() => /^\d{4}-\d{2}-\d{2}$/.test(fromDate.value) && fromDate.value >= props.today)
function open(type) {
  if (props.disabled) return
  generation++; editor.value = type; draft.value = normalizeStaminaSources(props.sources)
  base.value = JSON.stringify(draft.value); loadedRevision.value = props.revision
  busy.value = false; localError.value = ''; selectedSource.value = ''; notice.value = ''
}
function close() { generation++; editor.value = ''; busy.value = false; localError.value = '' }
watch(() => [props.accountId, props.planId], () => { close(); notice.value = ''; applicationGeneration++; confirming.value = false; applicationError.value = ''; emit('clear-preview') })
watch(() => [props.accountId, props.selectedDate, props.today], () => { fromDate.value = props.selectedDate >= props.today ? props.selectedDate : props.today; overwrite.value = false; emit('clear-preview') }, { immediate: true })
function changed() { localError.value = ''; emit('clear-preview') }
function changeTier() {
  const card = draft.value.monthlyCard, tier = monthlyCardTier(card.tier, props.game)
  Object.assign(card, { dailyAmount: tier.stamina, shopAmount: tier.shop, dailyEnabled: tier.id !== 'none', shopEnabled: tier.id !== 'none' })
  changed()
}
function addExisting() {
  const entry = availableSources.value.find(source => source.id === selectedSource.value)
  if (entry && draft.value.fixedSources.length < 32) { draft.value.fixedSources.push({ id: entry.id, label: entry.label, value: entry.value, enabled: true }); changed() }
  selectedSource.value = ''
}
function addCustom() {
  if (draft.value.fixedSources.length >= 32) return
  draft.value.fixedSources.push({ id: 'custom-gain-' + crypto.randomUUID(), label: '固定来源', value: 60, enabled: true }); changed()
}
function save() {
  if (props.disabled || busy.value || stale.value) return
  try {
    const sources = validateStaminaSources(draft.value), token = generation, scope = editor.value
    busy.value = true
    emit('save', sources, loadedRevision.value, async (saved, message) => {
      if (token !== generation) return
      busy.value = false
      if (saved) { await nextTick(); if (token === generation) { close(); notice.value = scope === 'monthly' ? '月卡设置已保存，已同步当前方案今天及未来的体力。' : props.allowApplication ? '日常设置已保存。已有日程可在下方查看影响后更新。' : '日常设置已保存。已有日程请回到常规模式查看影响后更新。' } }
      else {
        if (JSON.stringify(normalizeStaminaSources(props.sources)) === JSON.stringify(sources)) {
          loadedRevision.value = props.revision; base.value = JSON.stringify(sources)
        }
        localError.value = message || '保存未成功，修改仍保留在这里。请处理页面的同步提示后重试。'
      }
    }, scope)
  } catch (err) { localError.value = err.message }
}
function previewSchedule() {
  if (!validFromDate.value || props.disabled || busy.value || editor.value || !props.sources) return
  applicationError.value = ''; emit('preview', { fromDate: fromDate.value, overwrite: overwrite.value })
}
async function confirmApply() {
  const preview = props.preview, token = applicationGeneration
  if (!preview || props.disabled || confirming.value || editor.value) return
  const context = applicationContext()
  confirming.value = true; applicationError.value = ''
  const confirmed = await dialog.confirm({ title: '更新这些未来日程？', message: `将更新 ${preview.fromDate} 至 ${preview.throughDate} 中的 ${preview.affectedDates} 个日期，保留 ${preview.preservedManualDates} 个手工日期。${overwrite.value ? '手工日期中的对应来源会替换，' : ''}支出和过去记录不变。`, confirmText: '确认更新日程', cancelText: '返回检查' })
  if (token !== applicationGeneration) return
  confirming.value = false
  if (!confirmed) return
  if (props.disabled || preview !== props.preview || context !== applicationContext() || !props.allowApplication) { applicationError.value = '日程或设置已变化，请重新查看影响范围后再确认。'; return }
  emit('apply')
}
function applicationContext() { return JSON.stringify([props.accountId, props.planId, props.revision, props.sources, props.today, fromDate.value, overwrite.value]) }
</script>

<style scoped src="./plannerConditionCards.css"></style>
<style scoped>
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.source-editor, .source-application { display: grid; min-width: 0; gap: 16px; padding: 0; margin: 0; border: 0; }
.source-fields { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; min-width: 0; }
label { display: grid; gap: 6px; min-width: 0; font-size: 14px; }
.checkbox-label { display: flex; align-items: center; gap: 8px; }
.amount-field { display: grid; gap: 8px; min-width: 0; }
.amount-input { display: flex; align-items: center; gap: 8px; min-width: 0; }
.amount-input input { flex: 1; width: 0; }
.amount-input > span:last-child { flex: none; color: var(--ink-60); font-size: 12px; }
input, select, button { min-width: 0; max-width: 100%; box-sizing: border-box; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); color: var(--ink); padding: 8px; font: inherit; }
input:not([type="checkbox"]), select { width: 100%; min-height: 38px; font-size: 14px; }
input[type="date"] { display: block; min-inline-size: 0; max-inline-size: 100%; }
input[type="checkbox"] { flex: none; margin: 0; accent-color: var(--tea); }
button { cursor: pointer; font-size: 13px; line-height: 1.5; }
.source-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.source-actions > button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 38px; }
.source-create > select { flex-basis: 100%; }
.source-note, .source-preview { margin: 0; color: var(--ink-60); font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.source-forecast-note { margin-top: 10px; }
.source-error { color: var(--theme-danger-text, var(--rouge)); font-size: 13px; line-height: 1.6; }
.fixed-sources-list { display: grid; gap: 12px; min-width: 0; }
.fixed-source-item { display: grid; gap: 10px; padding: 12px; border: 1px solid var(--line); border-radius: 9px; background: var(--cream); }
.fixed-source-name { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
.fixed-source-name button { display: grid; place-items: center; border-color: transparent; }
.fixed-source-values { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.fixed-source-values .amount-input { flex: 1 1 140px; }
.daily-total { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; padding: 12px; border-radius: 8px; background: var(--cream); color: var(--theme-strong-text, var(--tea)); font-size: 14px; }
.daily-total strong { font-family: var(--font-d); }
summary { cursor: pointer; color: var(--theme-strong-text, var(--tea)); font-size: 13px; line-height: 1.6; }
summary + p { margin-top: 8px; }
.source-application-region { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); }
.source-application-region > summary { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; list-style: none; }
.source-application-region > summary::before { content: '+'; font-size: 16px; }
.source-application-region[open] > summary::before { content: '−'; }
.source-application-region > summary small { color: var(--ink-60); font-size: 12px; }
.source-application { margin-top: 12px; }
.overwrite-option { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; line-height: 1.6; }
.overwrite-option input { margin-top: 4px; }
.source-primary { border-color: var(--tea); color: var(--on-strong); background: var(--tea); }
:is(input, select, button, summary):focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px; }
:disabled { opacity: .55; cursor: default; }
fieldset:disabled { opacity: 1; }
@media (min-width: 400px) { .source-fields:not(.date-fields) { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 767px) {
  input:not([type="checkbox"]), select, button, .checkbox-label { min-height: 44px; }
  input:not([type="checkbox"]), select { font-size: 16px; }
  .fixed-source-name button { min-width: 44px; }
  .source-editor summary { box-sizing: border-box; min-height: 44px; padding-block: 10px; }
}
@media (min-width: 768px) { .date-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
