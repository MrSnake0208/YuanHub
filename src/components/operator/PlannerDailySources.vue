<template>
  <div class="daily-sources">
    <section class="condition-module" aria-labelledby="daily-sources-title">
      <header class="condition-module-heading"><span class="condition-letter" aria-hidden="true">B</span><h3 id="daily-sources-title">体力来源配置</h3><p>保存后用于日程体力计算</p></header>
      <div class="source-card-grid">
        <section class="source-card" :class="{ 'is-expanded': monthlyExpanded }" aria-labelledby="monthly-card-title">
          <header class="source-card-heading"><span class="source-icon" aria-hidden="true"><Tickets :size="18" /></span><h4 id="monthly-card-title">月卡权益</h4><span class="desktop-status">{{ monthlyCardTier(draft.monthlyCard.tier, game).label }}</span></header>
          <button type="button" class="source-summary" :aria-expanded="monthlyExpanded" aria-controls="monthly-card-editor" @click="monthlyExpanded = !monthlyExpanded">
            <span><b>当前：{{ monthlyCardTier(draft.monthlyCard.tier, game).label }}</b><small>今日预计 {{ monthlyTotal }} 体力 · 商店需手动领取</small></span><ChevronRight :size="18" aria-hidden="true" />
          </button>
          <fieldset id="monthly-card-editor" class="source-editor" :disabled="disabled || busy" @invalid.capture="monthlyExpanded = true">
            <legend class="sr-only">月卡权益编辑</legend>
      <label>权益档位<select v-model="draft.monthlyCard.tier" aria-label="月卡权益档位" @change="changeTier"><option v-for="tier in tiers" :key="tier.id" :value="tier.id">{{ tier.label }}</option></select></label>
      <div class="source-fields amount-fields">
        <div class="amount-field"><label><input v-model="draft.monthlyCard.dailyEnabled" type="checkbox" :disabled="draft.monthlyCard.tier === 'none'" @change="changed" /><span>每日奖励</span></label><label class="amount-input"><span class="sr-only">月卡每日奖励体力</span><input v-model.number="draft.monthlyCard.dailyAmount" type="number" min="0" max="99999" step="1" aria-label="月卡每日奖励体力" @input="changed" /><span>体力/日</span></label></div>
        <div class="amount-field"><label><input v-model="draft.monthlyCard.shopEnabled" type="checkbox" :disabled="draft.monthlyCard.tier === 'none'" @change="changed" /><span>商店领取</span></label><label class="amount-input"><span class="sr-only">月卡商店免费体力</span><input v-model.number="draft.monthlyCard.shopAmount" type="number" min="0" max="99999" step="1" aria-label="月卡商店免费体力" @input="changed" /><span>体力/日</span></label></div>
      </div>
      <div class="source-fields date-fields">
        <label>生效日期<input v-model="draft.monthlyCard.startDate" type="date" aria-label="月卡生效日期" @input="changed" /></label>
        <label>有效至（含当天）<input v-model="draft.monthlyCard.endDate" type="date" aria-label="月卡有效至" @input="changed" /></label>
      </div>
      <p class="source-note">仅预计领取体力；商店需主动领取，不会写入真实库存。</p>
      <details><summary>预测说明</summary><p class="source-note">数值为可编辑参考预设，请按实际权益调整。日期留空表示不限制该端；每周兑换300不计入每日。</p></details>
          </fieldset>
        </section>
        <section class="source-card" :class="{ 'is-expanded': fixedExpanded }" aria-labelledby="fixed-sources-title">
          <header class="source-card-heading"><span class="source-icon" aria-hidden="true"><ClipboardList :size="18" /></span><h4 id="fixed-sources-title">每日固定来源</h4></header>
          <button type="button" class="source-summary" :aria-expanded="fixedExpanded" aria-controls="fixed-sources-editor" @click="fixedExpanded = !fixedExpanded">
            <span><b>已设置 {{ draft.fixedSources.length }} 项</b><small>固定来源 {{ fixedTotal }} 体力/日 · 今日含月卡 {{ dailyTotal }} 体力</small></span><ChevronRight :size="18" aria-hidden="true" />
          </button>
          <fieldset id="fixed-sources-editor" class="source-editor" :disabled="disabled || busy" @invalid.capture="fixedExpanded = true">
            <legend class="sr-only">每日固定来源编辑</legend>
            <p class="source-note">固定来源每日自动计入；未设置的仍按推荐或单日安排计算，购买沿用偏好。</p>
            <div class="source-actions source-create"><select v-model="selectedSource" aria-label="从已有体力来源创建固定模板"><option value="">选择已有来源</option><option v-for="entry in availableSources" :key="entry.id" :value="entry.id">{{ entry.label }}</option></select><button type="button" :disabled="!selectedSource || draft.fixedSources.length >= 32" @click="addExisting">设为每日固定</button><button type="button" class="source-secondary" :disabled="draft.fixedSources.length >= 32" @click="addCustom"><Plus :size="14" aria-hidden="true" />新增来源</button></div>
            <div class="fixed-sources-list">
              <header class="fixed-list-heading"><b>已设置的来源</b><span>{{ dirty ? '未保存' : sources ? '已保存' : '未配置' }}</span></header>
              <div v-for="entry in monthlyGains" :key="entry.id" class="fixed-source-summary monthly-gain"><span>{{ entry.label }}</span><span>{{ entry.value }} 体力/日</span><small>月卡</small></div>
              <div v-for="(source, index) in draft.fixedSources" :key="source.id" class="fixed-source-item">
                <div class="fixed-source-summary"><span>{{ source.label }}<small v-if="!source.enabled">（已停用）</small></span><span>{{ source.enabled ? source.value : 0 }} 体力/日</span><button type="button" :aria-label="'编辑固定来源' + source.label" :aria-expanded="editingSource === source.id" :aria-controls="'fixed-source-' + index" @click="editingSource = editingSource === source.id ? '' : source.id"><Pencil :size="14" aria-hidden="true" /></button></div>
                <div v-show="editingSource === source.id" :id="'fixed-source-' + index" class="fixed-source-row" @invalid.capture="editingSource = source.id">
        <input v-model="source.enabled" type="checkbox" :aria-label="'启用固定来源' + source.label" @change="changed" />
        <input v-model="source.label" maxlength="32" :aria-label="'固定来源名称' + (index + 1)" @input="changed" />
        <input v-model.number="source.value" type="number" min="0" max="99999" step="1" :aria-label="'固定来源每日体力' + (index + 1)" @input="changed" />
        <button type="button" :aria-label="'删除固定来源' + source.label" @click="draft.fixedSources.splice(index, 1); changed()"><Trash2 :size="16" aria-hidden="true" /></button>
                </div>
              </div>
              <p v-if="!monthlyGains.length && !draft.fixedSources.length" class="source-note source-empty">尚未配置固定来源，可从已有来源选择或新增。</p>
              <div class="daily-total" role="status"><b>今日合计</b><strong>{{ dailyTotal }} 体力/日</strong></div>
            </div>
            <p class="source-note">合计仅含有效月卡与启用的固定来源，每个来源计入一次。</p>
          </fieldset>
        </section>
      </div>
      <p v-if="localError || stale" class="source-error" role="alert">{{ localError || '云端配置已更新，请重新载入后编辑。' }}</p>
      <footer class="source-save"><p class="source-note">{{ dirty ? '有未保存修改，请先保存再预览应用。' : '保存为子账号长期设置；已有日程请在下方预览并应用。' }}</p><div class="source-actions"><button type="button" :disabled="disabled || busy || !dirty || stale" @click="save">{{ busy ? '保存中…' : '保存子账号配置' }}</button><button v-if="dirty || stale" type="button" :disabled="busy" @click="reset">重新载入</button></div></footer>
    </section>
    <section class="condition-module" aria-labelledby="source-application-title">
      <header class="condition-module-heading"><span class="condition-letter" aria-hidden="true">C</span><h3 id="source-application-title">应用到未来日程</h3><p id="source-application-help">仅应用到当前培养清单，过去记录不变</p></header>
      <fieldset class="source-application" aria-describedby="source-application-help" :disabled="disabled || busy || dirty || stale">
        <legend class="sr-only">应用到当前清单的未来日程</legend>
        <div class="application-fields"><label class="application-date">开始日期<input v-model="fromDate" type="date" :min="today" aria-label="固定来源应用开始日期" @input="emit('clear-preview')" /></label><label class="overwrite-option"><input v-model="overwrite" type="checkbox" @change="emit('clear-preview')" />替换手工日期中的对应来源（保留支出）</label><div class="source-actions application-actions"><button type="button" class="source-preview" @click="emit('preview', { fromDate, overwrite })">预览影响范围</button><button type="button" class="source-primary" :disabled="!preview" @click="emit('apply')">应用到未来日程</button></div></div>
      <p v-if="preview" role="status">{{ preview.fromDate }} 至 {{ preview.throughDate }} 的规划范围：影响 {{ preview.affectedDates }} 个日期，保留 {{ preview.preservedManualDates }} 个手工日期；过去不变。</p>
      </fieldset>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { ChevronRight, ClipboardList, Pencil, Plus, Tickets, Trash2 } from '@lucide/vue'
import { GAIN_CHANNELS } from '../../data/cultivationPlanner.js'
import { emptyStaminaSources, MONTHLY_STAMINA_IDS, normalizeStaminaSources, resolveDailyStaminaGains, validateStaminaSources } from '../../data/dailyStaminaSources.js'
import { monthlyCardTier, monthlyCardTiers } from '../../data/monthlyCard.js'

const props = defineProps({ sources: Object, accountId: String, revision: Number, game: { type: String, default: '代号鸢' }, today: String, selectedDate: String, gains: { type: Array, default: () => [] }, disabled: Boolean, preview: Object })
const emit = defineEmits(['save', 'preview', 'apply', 'clear-preview'])
const draft = ref(emptyStaminaSources()), dirty = ref(false), busy = ref(false), localError = ref(''), loadedRevision = ref(0), loadedAccount = ref('')
const selectedSource = ref(''), fromDate = ref(''), overwrite = ref(false)
const monthlyExpanded = ref(false), fixedExpanded = ref(false), editingSource = ref('')
const tiers = computed(() => monthlyCardTiers(props.game))
const stale = computed(() => loadedRevision.value !== props.revision)
const dailyGains = computed(() => resolveDailyStaminaGains([], { sourcePeriods: [{ fromDate: props.today, sources: normalizeStaminaSources(draft.value) }] }, props.today))
const monthlyGains = computed(() => dailyGains.value.filter(entry => MONTHLY_STAMINA_IDS.includes(entry.id)))
const monthlyTotal = computed(() => monthlyGains.value.reduce((sum, entry) => sum + entry.value, 0))
const dailyTotal = computed(() => dailyGains.value.reduce((sum, entry) => sum + entry.value, 0))
const fixedTotal = computed(() => dailyTotal.value - monthlyTotal.value)
const availableSources = computed(() => [...new Map([...GAIN_CHANNELS.filter(entry => entry.id !== 'custom').map(entry => ({ ...entry, value: entry.defaultValue })), ...props.gains].map(entry => [entry.id, entry])).values()]
  .filter(entry => !['buy', 'reserve', 'required-extra', 'diagnostic-budget', ...MONTHLY_STAMINA_IDS].includes(entry.id) && !entry.id.startsWith('planner-reserve-') && !draft.value.fixedSources.some(source => source.id === entry.id)))
function reset() {
  draft.value = normalizeStaminaSources(props.sources); loadedRevision.value = props.revision; loadedAccount.value = props.accountId
  dirty.value = false; localError.value = ''; selectedSource.value = ''; editingSource.value = ''; emit('clear-preview')
  busy.value = false
}
watch(() => [props.accountId, props.sources, props.revision], () => { if (loadedAccount.value !== props.accountId || !dirty.value && !busy.value) reset() }, { immediate: true })
watch(() => [props.accountId, props.selectedDate, props.today], () => { fromDate.value = props.selectedDate >= props.today ? props.selectedDate : props.today; overwrite.value = false; emit('clear-preview') }, { immediate: true })
function changed() { dirty.value = true; localError.value = ''; emit('clear-preview') }
function changeTier() {
  const card = draft.value.monthlyCard, tier = monthlyCardTier(card.tier, props.game)
  Object.assign(card, { dailyAmount: tier.stamina, shopAmount: tier.shop, dailyEnabled: tier.id !== 'none', shopEnabled: tier.id !== 'none' })
  changed()
}
function addExisting() {
  const entry = availableSources.value.find(source => source.id === selectedSource.value)
  if (entry) { draft.value.fixedSources.push({ id: entry.id, label: entry.label, value: entry.value, enabled: true }); editingSource.value = entry.id }
  selectedSource.value = ''; changed()
}
function addCustom() {
  const id = 'custom-gain-' + crypto.randomUUID()
  draft.value.fixedSources.push({ id, label: '固定来源', value: 60, enabled: true }); editingSource.value = id; changed()
}
function save() {
  try {
    const sources = validateStaminaSources(draft.value)
    busy.value = true
    const account = props.accountId
    emit('save', sources, loadedRevision.value, async saved => {
      if (props.accountId !== account) return
      busy.value = false
      if (saved) { await nextTick(); reset() } else localError.value = '保存未成功，请处理云端错误后重试。'
    })
  } catch (err) { localError.value = err.message }
}
</script>

<style scoped>
.daily-sources { display: grid; gap: 14px; min-width: 0; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.condition-module { min-width: 0; padding: 12px; border: 1px solid var(--planner-line, var(--line)); border-radius: 10px; background: var(--cream); }
.condition-module-heading { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.condition-module-heading h3 { margin: 0; color: var(--ink); font: 800 15px/1.4 var(--font-s); }
.condition-module-heading p, .desktop-status { color: var(--ink-60); font-size: 11px; }
.condition-letter { display: grid; flex: none; width: 26px; height: 26px; place-items: center; border-radius: 50%; color: var(--surface); background: var(--accent); font: 700 17px var(--font-d); }
.source-card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 10px; align-items: start; min-width: 0; }
.source-card { min-width: 0; padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
.source-card-heading { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.source-card-heading h4 { margin: 0; color: var(--ink); font: 800 14px/1.4 var(--font-s); }
.source-icon { display: grid; flex: none; width: 30px; height: 30px; place-items: center; color: var(--accent); background: var(--cream); border-radius: 50%; }
.desktop-status { display: none; }
.source-summary { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; padding: 0; text-align: left; border: 0; background: transparent; }
.source-summary > span { min-width: 0; display: grid; gap: 4px; }
.source-summary b { font-weight: 500; }
.source-summary small { color: var(--ink-60); font-size: 12px; line-height: 1.5; }
.source-summary > svg { flex: none; }
.is-expanded > .source-summary > svg { transform: rotate(90deg); }
fieldset { margin: 0; padding: 0; border: 0; min-width: 0; display: grid; gap: 10px; }
.source-editor { display: none; margin-top: 12px; }
.is-expanded > .source-editor { display: grid; }
label { display: grid; gap: 5px; min-width: 0; font-size: 13px; }
.source-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 145px), 1fr)); gap: 12px; min-width: 0; }
.date-fields { grid-template-columns: repeat(auto-fit, minmax(min(100%, 165px), 1fr)); }
.amount-field { min-width: 0; display: grid; gap: 6px; }
.amount-field > label:first-child { display: flex; align-items: center; gap: 5px; }
.amount-input { display: flex; align-items: center; gap: 6px; }
.amount-input input { flex: 1; width: 0; }
.amount-input > span:last-child { flex: none; color: var(--ink-60); font-size: 12px; }
.fixed-source-row { display: grid; grid-template-columns: auto minmax(0, 1fr) 72px 30px; gap: 6px; align-items: center; padding: 6px 8px 10px; }
.fixed-sources-list { min-width: 0; border: 1px solid var(--line); border-radius: 7px; }
.fixed-list-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px; padding: 8px 10px; background: var(--cream); font-size: 12px; }
.fixed-list-heading > span { color: var(--ink-60); }
.fixed-source-summary { display: grid; grid-template-columns: minmax(0, 1fr) auto 30px; align-items: center; gap: 8px; padding: 6px 10px; font-size: 12px; }
.fixed-source-summary > span:first-child { overflow-wrap: anywhere; }
.fixed-source-summary > span:nth-child(2) { white-space: nowrap; font-family: var(--font-d); }
.fixed-source-summary small { color: var(--ink-60); font-size: 10px; }
.fixed-source-summary button, .fixed-source-row button { display: grid; min-height: 30px; place-items: center; padding: 3px; border-color: transparent; }
.daily-total { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px; padding: 9px 10px; background: var(--cream); color: var(--tea); font-size: 13px; }
.daily-total strong { font-family: var(--font-d); }
input, select, button { min-width: 0; max-width: 100%; box-sizing: border-box; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: var(--ink); padding: 7px 8px; font: inherit; }
input:not([type="checkbox"]), select { width: 100%; min-height: 34px; font-size: 13px; }
input[type="date"] { display: block; min-inline-size: 0; max-inline-size: 100%; }
input[type="checkbox"] { flex: none; margin: 0; accent-color: var(--tea); }
button { cursor: pointer; font-size: 13px; line-height: 1.5; }
.source-summary { border: 0; background: transparent; padding: 0; }
:is(input, select, button, summary):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
:disabled { opacity: .6; cursor: default; }
fieldset:disabled { opacity: 1; }
.source-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.source-actions > button { display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-height: 34px; white-space: nowrap; }
.source-create > select { flex-basis: 100%; }
.source-create > button { flex: 1 1 auto; }
.source-create .source-secondary { background: var(--cream); }
.source-note, p { margin: 0; line-height: 1.5; overflow-wrap: anywhere; }
.source-note { color: var(--ink-60); font-size: 12px; }
.source-empty { padding: 10px; }
.source-error { margin-top: 10px; color: var(--rouge); font-size: 13px; }
summary { cursor: pointer; color: var(--tea); font-size: 12px; }
details > p { margin-top: 6px; }
.source-save { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
.source-save > p { flex: 1 1 240px; }
.source-save .source-actions { flex: 0 1 auto; }
.application-fields { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 16px; }
.application-date { flex: 1 1 220px; display: flex; align-items: center; flex-wrap: wrap; gap: 8px 10px; white-space: nowrap; }
.application-date input { flex: 1 1 165px; min-width: 0; width: 100%; }
.overwrite-option { flex: 1 1 200px; display: flex; align-items: center; gap: 8px; color: var(--ink-60); line-height: 1.5; }
.application-actions { flex: 1 1 260px; }
.application-actions > button { flex: 1 1 120px; padding: 9px 10px; }
.source-preview { border-color: var(--accent); color: var(--tea); }
.source-primary { border-color: var(--tea); color: var(--surface); background: var(--tea); }
.source-application > p { color: var(--ink-60); font-size: 12px; }
@media (min-width: 641px) {
  .source-summary { display: none; }
  .desktop-status { display: inline; }
  .source-editor { display: grid; margin-top: 0; }
}
@media (max-width: 640px) {
  .condition-module { padding: 10px; }
  .condition-module-heading > p { display: none; }
  .condition-module-heading > #source-application-help { display: block; flex-basis: 100%; }
  .source-card { padding: 10px; }
  .source-card-grid { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .fixed-source-row { grid-template-columns: auto minmax(0, 1fr) 64px 30px; gap: 4px; }
  .application-fields { gap: 12px; }
  .application-date, .overwrite-option, .application-actions { flex-basis: 100%; }
  .application-actions > button { padding-inline: 6px; font-size: 12px; }
}
</style>
