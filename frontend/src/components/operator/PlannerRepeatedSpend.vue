<template>
  <span class="repeat-spend" :class="{ 'repeat-spend-custom': isCustom }">
    <button type="button" class="repeat-link" aria-haspopup="dialog" :disabled="disabled" @click="open">{{ isCustom ? '应用到日期范围' : entry.fixed ? '修改每日安排' : '设为每日安排' }}</button>
    <span v-if="entry.fixed && !isCustom">当天固定 {{ entry.value }} 次 <button type="button" class="repeat-link" :disabled="disabled" @click="emit('release')">解除当天固定</button></span>
    <span v-else-if="entry.fixed">当天安排 {{ entry.value }} 次</span>
    <span v-if="disabled && blockedReason">{{ blockedReason }}</span>
  </span>
  <PlannerSettingsPanel :open="opened" :title="isCustom ? '每日安排 · ' + entry.label : '每日固定 6-24'" :description="isCustom ? '在指定日期范围内，每天安排此项目，不会自动延续到范围之外。' : '在指定日期范围内，每天恰好刷指定次数。固定次数先占用体力，自动计算不会额外追加 6-24。'" save-label="应用到这些日期" :dirty="dirty" :busy="busy" :error="error || (stale && !busy ? '日程已变化，请关闭后重新打开。' : '')" :save-disabled="disabled || stale" @close="opened = false" @save="save">
    <fieldset class="repeat-fields" :disabled="disabled || busy || stale">
      <label>开始日期<input v-model="draft.fromDate" type="date" :min="today" :max="lastDate" required aria-label="每日安排开始日期" /></label>
      <label>结束日期<input v-model="draft.toDate" type="date" :min="draft.fromDate || today" :max="lastDate" required aria-label="每日安排结束日期" /></label>
      <label>每天次数<input v-model.number="draft.count" type="number" min="0" max="9999" step="1" required :aria-label="isCustom ? '每日项目次数' : '每日6-24次数'" /></label>
      <p>每天消耗 {{ Number(draft.count) * (isCustom ? Number(entry.costPer) : 10) || 0 }} 体力。0 次表示当天不安排。</p>
      <p v-if="isCustom">每次产出：{{ yieldLabel }}；每天产出：{{ dailyYieldLabel }}。经验按经验值填写。</p>
      <p v-if="isCustom">替换范围内同一项目的名称、体力、次数和产出；同名的其他项目不受影响。手工日期保留其他获取与支出，体力不足时整批不应用；自动日期会重新分配剩余体力。</p>
      <p v-else>替换范围内已有的 6-24 次数。手工日期保留其他获取与支出，体力不足时整批不应用；自动日期会重新分配剩余体力。范围外的后续自动日程随材料变化重新计算。</p>
      <p v-if="isCustom">保存到当前培养清单。之后可单独修改或删除某天，或重新应用一个日期范围。云端保存失败时请处理页面的同步提示。</p>
      <p v-else>保存到当前培养清单。之后可单独修改某天、解除当天固定，或重新应用一个日期范围。云端保存失败时请处理页面的同步提示。</p>
    </fieldset>
  </PlannerSettingsPanel>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { plannerDateAfter } from '../../data/fixedPlannerSchedule.js'
import PlannerSettingsPanel from './PlannerSettingsPanel.vue'
const props = defineProps({ entry: { type: Object, required: true }, date: String, today: String, lastDate: String, accountId: String, planId: String, schedule: Object, disabled: Boolean, blockedReason: String, resourceName: { type: Function, default: id => id } })
const emit = defineEmits(['apply', 'release'])
const opened = ref(false), busy = ref(false), error = ref(''), draft = ref({ fromDate: '', toDate: '', count: 6 }), initial = ref('')
let generation = 0
const baseSchedule = shallowRef(null)
const dirty = computed(() => JSON.stringify(draft.value) !== initial.value)
const stale = computed(() => props.schedule !== baseSchedule.value)
const isCustom = computed(() => Boolean(props.entry.custom))
const yieldLabel = computed(() => Object.entries(props.entry.yield || {}).map(([id, amount]) => `${props.resourceName(id)} ${amount}`).join('、') || '无')
const dailyYieldLabel = computed(() => Object.entries(props.entry.yield || {}).map(([id, amount]) => `${props.resourceName(id)} ${Number(amount) * (Number(draft.value.count) || 0)}`).join('、') || '无')
function open() {
  if (props.disabled || !props.accountId || !props.planId) return
  generation++; baseSchedule.value = props.schedule
  const fromDate = props.date < props.today ? props.today : props.date
  draft.value = { fromDate, toDate: isCustom.value ? props.lastDate : [plannerDateAfter(fromDate, 6), props.lastDate].sort()[0], count: Number(props.entry.value) }
  initial.value = JSON.stringify(draft.value); error.value = ''; busy.value = false; opened.value = true
}
function save() {
  if (props.disabled || busy.value || stale.value || !opened.value) return
  if (!draft.value.fromDate || !draft.value.toDate || draft.value.fromDate < props.today || draft.value.fromDate > draft.value.toDate || draft.value.toDate > props.lastDate || !Number.isInteger(draft.value.count) || draft.value.count < 0 || draft.value.count > 9999) { error.value = '请核对日期范围和每天次数。'; return }
  const token = generation
  busy.value = true; error.value = ''
  emit('apply', { ...draft.value }, { accountId: props.accountId, planId: props.planId, schedule: baseSchedule.value, entryId: props.entry.id }, (saved, message) => {
    if (token !== generation) return
    busy.value = false
    if (saved) opened.value = false
    else error.value = message || '保存未成功，请处理页面同步提示后重试。'
  })
}
watch(() => [props.accountId, props.planId, props.date], () => { generation++; opened.value = false; busy.value = false; error.value = '' })
onBeforeUnmount(() => generation++)
</script>

<style scoped>
.repeat-spend { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; font-size: 12px; }
.repeat-link { border: 0; background: transparent; color: var(--theme-strong-text, var(--tea)); cursor: pointer; text-decoration: underline; padding: 6px 0; font: inherit; }
.repeat-link:focus-visible { outline: 2px solid var(--theme-focus, var(--tea)); outline-offset: 2px; }
.repeat-link:disabled { opacity: .55; cursor: default; }
.repeat-fields { display: grid; gap: 16px; margin: 0; padding: 0; border: 0; min-width: 0; }
.repeat-fields label { display: grid; gap: 6px; min-width: 0; }
.repeat-fields input { box-sizing: border-box; min-width: 0; width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 8px; color: var(--ink); background: var(--surface); font: inherit; }
.repeat-fields p { margin: 0; color: var(--ink-60); font-size: 13px; line-height: 1.7; }
@media (max-width: 640px) { .repeat-spend-custom .repeat-link { min-height: 44px; } }
</style>
