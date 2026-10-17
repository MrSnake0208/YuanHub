<template>
  <section class="daily-sources" aria-labelledby="daily-sources-title">
    <header><h3 id="daily-sources-title">月卡权益与每日固定来源</h3><span>当前子账号共用</span></header>
    <fieldset :disabled="disabled || busy">
      <legend>月卡权益</legend>
      <label>权益档位<select v-model="draft.monthlyCard.tier" aria-label="月卡权益档位" @change="changeTier"><option v-for="tier in tiers" :key="tier.id" :value="tier.id">{{ tier.label }}</option></select></label>
      <div class="source-fields">
        <label class="amount-row"><input v-model="draft.monthlyCard.dailyEnabled" type="checkbox" :disabled="draft.monthlyCard.tier === 'none'" @change="changed" /><span>每日奖励</span><input v-model.number="draft.monthlyCard.dailyAmount" type="number" min="0" max="99999" step="1" aria-label="月卡每日奖励体力" @input="changed" /></label>
        <label class="amount-row"><input v-model="draft.monthlyCard.shopEnabled" type="checkbox" :disabled="draft.monthlyCard.tier === 'none'" @change="changed" /><span>商店免费领取</span><input v-model.number="draft.monthlyCard.shopAmount" type="number" min="0" max="99999" step="1" aria-label="月卡商店免费体力" @input="changed" /></label>
        <label>生效日期<input v-model="draft.monthlyCard.startDate" type="date" aria-label="月卡生效日期" @input="changed" /></label>
        <label>有效至（含当天）<input v-model="draft.monthlyCard.endDate" type="date" aria-label="月卡有效至" @input="changed" /></label>
      </div>
      <p class="source-note">仅用于预计领取体力；商店需主动领取，不会写入真实库存。日期留空表示不限制该端。</p>
      <details><summary>预设说明</summary><p class="source-note">数值为可编辑参考预设，请按当前游戏实际权益调整。每周兑换300不计入每日。</p></details>
    </fieldset>
    <fieldset :disabled="disabled || busy">
      <legend>每日固定来源</legend>
      <div v-for="(source, index) in draft.fixedSources" :key="source.id" class="fixed-source-row">
        <input v-model="source.enabled" type="checkbox" :aria-label="'启用固定来源' + source.label" @change="changed" />
        <input v-model="source.label" maxlength="32" :aria-label="'固定来源名称' + (index + 1)" @input="changed" />
        <input v-model.number="source.value" type="number" min="0" max="99999" step="1" :aria-label="'固定来源每日体力' + (index + 1)" @input="changed" />
        <button type="button" :aria-label="'删除固定来源' + source.label" @click="draft.fixedSources.splice(index, 1); changed()"><X :size="16" aria-hidden="true" /></button>
      </div>
      <div class="source-actions"><select v-model="selectedSource" aria-label="从已有体力来源创建固定模板"><option value="">选择已有来源</option><option v-for="entry in availableSources" :key="entry.id" :value="entry.id">{{ entry.label }}</option></select><button type="button" :disabled="!selectedSource || draft.fixedSources.length >= 32" @click="addExisting">设为每日固定</button><button type="button" :disabled="draft.fixedSources.length >= 32" @click="addCustom">新增来源</button></div>
      <p class="source-note">未设为固定的来源仍按原推荐或单日安排计算。购买体力沿用购买次数设置。</p>
    </fieldset>
    <p v-if="localError || stale" class="source-error" role="alert">{{ localError || '云端配置已更新，请重新载入后编辑。' }}</p>
    <div class="source-actions"><button type="button" :disabled="disabled || busy || !dirty || stale" @click="save">{{ busy ? '保存中…' : '保存子账号配置' }}</button><button v-if="dirty || stale" type="button" :disabled="busy" @click="reset">重新载入</button></div>
    <fieldset :disabled="disabled || busy || dirty || stale">
      <legend>应用到当前清单的未来日程</legend>
      <div class="source-fields"><label>开始日期<input v-model="fromDate" type="date" :min="today" aria-label="固定来源应用开始日期" @input="emit('clear-preview')" /></label><label class="overwrite-option"><input v-model="overwrite" type="checkbox" @change="emit('clear-preview')" />替换手工日期中的对应来源（保留支出）</label></div>
      <div class="source-actions"><button type="button" @click="emit('preview', { fromDate, overwrite })">预览影响范围</button><button v-if="preview" type="button" @click="emit('apply')">应用到未来日程</button></div>
      <p v-if="preview" role="status">{{ preview.fromDate }} 至 {{ preview.throughDate }} 的规划范围：影响 {{ preview.affectedDates }} 个日期，保留 {{ preview.preservedManualDates }} 个手工日期；过去不变。</p>
    </fieldset>
  </section>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { X } from '@lucide/vue'
import { GAIN_CHANNELS } from '../../data/cultivationPlanner.js'
import { emptyStaminaSources, MONTHLY_STAMINA_IDS, normalizeStaminaSources, validateStaminaSources } from '../../data/dailyStaminaSources.js'
import { monthlyCardTier, monthlyCardTiers } from '../../data/monthlyCard.js'

const props = defineProps({ sources: Object, accountId: String, revision: Number, game: { type: String, default: '代号鸢' }, today: String, selectedDate: String, gains: { type: Array, default: () => [] }, disabled: Boolean, preview: Object })
const emit = defineEmits(['save', 'preview', 'apply', 'clear-preview'])
const draft = ref(emptyStaminaSources()), dirty = ref(false), busy = ref(false), localError = ref(''), loadedRevision = ref(0), loadedAccount = ref('')
const selectedSource = ref(''), fromDate = ref(''), overwrite = ref(false)
const tiers = computed(() => monthlyCardTiers(props.game))
const stale = computed(() => loadedRevision.value !== props.revision)
const availableSources = computed(() => [...new Map([...GAIN_CHANNELS.filter(entry => entry.id !== 'custom').map(entry => ({ ...entry, value: entry.defaultValue })), ...props.gains].map(entry => [entry.id, entry])).values()]
  .filter(entry => !['buy', 'reserve', 'required-extra', 'diagnostic-budget', ...MONTHLY_STAMINA_IDS].includes(entry.id) && !entry.id.startsWith('planner-reserve-') && !draft.value.fixedSources.some(source => source.id === entry.id)))
function reset() {
  draft.value = normalizeStaminaSources(props.sources); loadedRevision.value = props.revision; loadedAccount.value = props.accountId
  dirty.value = false; localError.value = ''; selectedSource.value = ''; emit('clear-preview')
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
  if (entry) draft.value.fixedSources.push({ id: entry.id, label: entry.label, value: entry.value, enabled: true })
  selectedSource.value = ''; changed()
}
function addCustom() { draft.value.fixedSources.push({ id: 'custom-gain-' + crypto.randomUUID(), label: '固定来源', value: 60, enabled: true }); changed() }
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
.daily-sources { display: grid; gap: 12px; min-width: 0; }
header, .source-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
header { justify-content: space-between; } h3 { margin: 0; } header > span, .source-note { color: var(--ink-60); font-size: 12px; }
fieldset { margin: 0; padding: 10px; border: 1px solid var(--line); border-radius: 8px; min-width: 0; display: grid; gap: 8px; }
legend { font-weight: 600; } label { display: grid; gap: 5px; min-width: 0; font-size: 13px; }
.source-fields { display: grid; gap: 8px; min-width: 0; }
.amount-row { display: grid; grid-template-columns: auto minmax(0, 1fr) minmax(60px, 90px); align-items: center; }
.fixed-source-row { display: grid; grid-template-columns: auto minmax(0, 1fr) 70px auto; gap: 6px; align-items: center; }
input, select, button { min-width: 0; max-width: 100%; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: var(--ink); padding: 6px 8px; font: inherit; }
input:not([type="checkbox"]), select { width: 100%; box-sizing: border-box; } input[type="checkbox"] { margin: 0; }
button { cursor: pointer; } :is(input, select, button):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
:disabled { opacity: .6; cursor: default; } .source-actions > select { flex: 1 1 140px; width: auto; }
.source-note, p { margin: 0; line-height: 1.5; overflow-wrap: anywhere; } .source-error { color: var(--rouge); }
.overwrite-option { display: flex; align-items: center; gap: 8px; }
@media (min-width: 641px) { .source-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
