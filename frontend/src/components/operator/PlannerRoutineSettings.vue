<template>
  <section class="condition-module" aria-labelledby="routine-settings-title">
    <header class="condition-module-heading"><h3 id="routine-settings-title">我的日常安排</h3><p>沿用当前习惯，需要时再调整。</p></header>
    <div class="condition-summary-grid">
      <button type="button" class="condition-summary-card" aria-haspopup="dialog" :disabled="disabled" @click="open('preferences')">
        <span class="condition-summary-icon"><CalendarDays :size="25" aria-hidden="true" /></span>
        <span class="condition-summary-copy"><b>派遣与购买体力</b><span>洛阳 {{ effectivePreferences.luoyang }} 次 · 寿春 {{ effectivePreferences.shouchun }} 次 · 购买体力 {{ effectivePreferences.purchaseCount }} 次</span></span>
        <ChevronRight :size="18" aria-hidden="true" />
      </button>
      <button type="button" class="condition-summary-card" aria-haspopup="dialog" :disabled="disabled" @click="open('levels')">
        <span class="condition-summary-icon"><Layers :size="25" aria-hidden="true" /></span>
        <span class="condition-summary-copy"><b>目前能刷的关卡</b><span>{{ levelSummary }}</span></span>
        <ChevronRight :size="18" aria-hidden="true" />
      </button>
    </div>

    <slot />
    <PlannerSettingsPanel :open="Boolean(editor)" :title="editor === 'preferences' ? '派遣与购买体力' : '目前能刷的关卡'" :description="editor === 'preferences' ? '设置日期范围内的派遣和购买次数；仅更新当前培养清单，保留已单独编辑的日期。' : '选择已经通关、能够稳定刷取的最高关卡，保存为这个账号的设置。'" :save-label="editor === 'preferences' && today ? prepared ? '确认保存每日安排' : '预览影响' : '保存设置'" :dirty="dirty" :busy="busy" :error="localError || (stale ? '当前设置已更新，请关闭后重新打开，再进行修改。' : '')" :save-disabled="disabled || stale || !dirty" @close="close" @save="save">
      <fieldset v-if="editor === 'preferences'" class="routine-fields" :disabled="disabled || busy || stale">
        <legend class="sr-only">派遣与购买次数</legend>
        <details v-if="preferences.routinePeriods?.length"><summary>已设置的日期安排</summary><button v-for="(period, index) in preferences.routinePeriods" :key="period.fromDate" type="button" class="routine-period" :disabled="period.fromDate > lastDate || (preferences.routinePeriods[index + 1]?.fromDate || '9999-12-31') <= today" @click="selectPeriod(index)">{{ period.fromDate }} 起 · 洛阳 {{ period.luoyang }} 次 · 寿春 {{ period.shouchun }} 次 · 购买 {{ period.purchaseCount }} 次</button></details>
        <div v-if="today" class="routine-dates"><label>开始日期<input v-model="fromDate" type="date" :min="today" :max="lastDate" required /></label><label>结束日期（含当天）<input v-model="endDate" type="date" :min="fromDate" :max="lastDate" /></label></div>
        <p v-if="today" class="routine-help">结束日期留空表示持续生效；填写后，区间结束恢复原安排。重叠区间会替换，区间外安排与手工日期保留。</p>
        <div v-for="field in preferenceFields" :key="field.key" class="routine-field">
          <label :for="'pref-' + field.id">{{ field.label }}</label>
          <div class="routine-counter">
            <button type="button" :aria-label="'减少' + field.label + '次数'" :disabled="draftPreferences[field.key] <= 0" @click="adjust(field, -1)"><Minus :size="16" aria-hidden="true" /></button>
            <input :id="'pref-' + field.id" v-model.number="draftPreferences[field.key]" type="number" min="0" :max="field.max" step="1" required />
            <button type="button" :aria-label="'增加' + field.label + '次数'" :disabled="draftPreferences[field.key] >= field.max" @click="adjust(field, 1)"><Plus :size="16" aria-hidden="true" /></button>
          </div>
        </div>
        <p v-if="prepared" class="routine-help" role="status">{{ fromDate }} 起{{ endDate ? '至 ' + endDate + '（含当天）' : '持续生效' }}：洛阳 {{ draftPreferences.luoyang }} 次、寿春 {{ draftPreferences.shouchun }} 次、购买 {{ draftPreferences.purchaseCount }} 次。{{ endDate ? '区间结束恢复原安排；' : '' }}保留过去记录和已单独编辑的日期；仅更新当前清单。</p>
        <p class="routine-help">购买花费 {{ purchaseCost }} 白金币/日。派遣消耗体力，不产出养成材料。</p>
      </fieldset>
      <fieldset v-else-if="editor === 'levels'" class="routine-fields" :disabled="disabled || busy || stale">
        <legend class="sr-only">可刷关卡</legend>
        <label v-for="group in TRAINING_GROUPS" :key="group.id" class="training-level-field">{{ group.name }}最高关卡
          <PlannerSelect class="training-level-select" v-model="draftLevels[group.id]" :options="group.stages.map(stage => ({ value: stage.level, label: stage.name }))" :label="group.name + '最高层'" :disabled="disabled || busy || stale" />
        </label>
        <p class="routine-help">规划只会从这些关卡及以下选择，不会安排尚未通关的层数。</p>
      </fieldset>
    </PlannerSettingsPanel>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { CalendarDays, ChevronRight, Layers, Minus, Plus } from '@lucide/vue'
import { normalizePlannerPreferences, PLANNER_RULES, PURCHASE_CUMULATIVE } from '../../data/cultivationPlanner.js'
import { normalizeTrainingLevels, TRAINING_GROUPS } from '../../data/operatorTraining.js'
import { addCalendarDays } from '../../utils/businessDay.js'
import { routineForDate, withRoutineRange } from '../../data/plannerRoutinePeriods.js'
import PlannerSelect from './PlannerSelect.vue'
import PlannerSettingsPanel from './PlannerSettingsPanel.vue'

const props = defineProps({ preferences: { type: Object, required: true }, levels: { type: Object, required: true }, accountId: String, planId: String, revision: Number, disabled: Boolean, today: String, lastDate: String })
const fromDate = ref(''), endDate = ref(''), prepared = ref(false)
const emit = defineEmits(['save-preferences', 'save-levels'])
const editor = ref(''), draftPreferences = ref({}), draftLevels = ref({}), base = ref(''), draftBase = ref(''), loadedRevision = ref(0), busy = ref(false), localError = ref('')
let generation = 0
onBeforeUnmount(() => { generation++ })
const preferenceFields = [{ key: 'luoyang', id: 'luoyang', label: '洛阳派遣', max: PLANNER_RULES.maxDispatchCount }, { key: 'shouchun', id: 'shouchun', label: '寿春派遣', max: PLANNER_RULES.maxDispatchCount }, { key: 'purchaseCount', id: 'purchase', label: '购买体力', max: PLANNER_RULES.maxPurchaseCount }]
const savedKey = () => JSON.stringify(editor.value === 'preferences' ? props.preferences : props.levels)
const dirty = computed(() => Boolean(editor.value) && (JSON.stringify(editor.value === 'preferences' ? draftPreferences.value : draftLevels.value) !== draftBase.value || editor.value === 'preferences' && (fromDate.value !== (props.today || '') || Boolean(endDate.value))))
const stale = computed(() => Boolean(editor.value) && (base.value !== savedKey() || editor.value === 'levels' && loadedRevision.value !== props.revision))
const purchaseCost = computed(() => PURCHASE_CUMULATIVE[normalizePlannerPreferences(draftPreferences.value).purchaseCount])
const levelSummary = computed(() => TRAINING_GROUPS.map(group => group.name + ' ' + (group.id === 'experience' ? group.stages.find(stage => stage.level === props.levels[group.id])?.name || '未设置' : props.levels[group.id] + ' 层')).join(' · '))

const effectivePreferences = computed(() => routineForDate(props.preferences, props.today || ''))
watch([draftPreferences, fromDate, endDate], () => { prepared.value = false }, { deep: true })
function open(type) {
  if (props.disabled) return
  generation++; editor.value = type; localError.value = ''; busy.value = false
  fromDate.value = props.today || ''; endDate.value = ''; prepared.value = false
  draftPreferences.value = normalizePlannerPreferences(routineForDate(props.preferences, fromDate.value))
  draftLevels.value = normalizeTrainingLevels(props.levels)
  base.value = savedKey(); loadedRevision.value = props.revision
  draftBase.value = JSON.stringify(type === 'preferences' ? draftPreferences.value : draftLevels.value)
}
function selectPeriod(index) {
  const period = props.preferences.routinePeriods[index], next = props.preferences.routinePeriods[index + 1]
  fromDate.value = period.fromDate < props.today ? props.today : period.fromDate
  endDate.value = next ? addCalendarDays(next.fromDate, -1) : ''
  if (endDate.value > props.lastDate) endDate.value = props.lastDate
  draftPreferences.value = normalizePlannerPreferences({ ...props.preferences, ...period })
}
function close() { generation++; editor.value = ''; busy.value = false; localError.value = '' }
watch(() => [props.accountId, props.planId], () => { close() })
function adjust(field, delta) { draftPreferences.value[field.key] = Math.min(field.max, Math.max(0, (Number(draftPreferences.value[field.key]) || 0) + delta)) }
function save() {
  if (props.disabled || busy.value || stale.value || !dirty.value) return
  localError.value = ''
  const type = editor.value, token = generation
  let value
  try {
    if (type === 'preferences' && props.today && (fromDate.value < props.today || fromDate.value > props.lastDate || endDate.value > props.lastDate)) throw new Error('请选择当前90天内的日期')
    value = type === 'preferences' ? props.today ? withRoutineRange(props.preferences, normalizePlannerPreferences(draftPreferences.value), fromDate.value, endDate.value) : normalizePlannerPreferences(draftPreferences.value) : { ...draftLevels.value }
  } catch (err) { localError.value = err.message; return }
  const context = { accountId: props.accountId, planId: props.planId, revision: loadedRevision.value, base: base.value, fromDate: fromDate.value }
  if (type === 'preferences' && props.today && !prepared.value) { prepared.value = true; return }
  busy.value = true
  emit(type === 'preferences' ? 'save-preferences' : 'save-levels', value, context, saved => {
    if (token !== generation) return
    busy.value = false
    if (saved) close()
    else localError.value = '保存未成功，修改仍保留在这里。请处理页面的同步提示后重试。'
  })
}
defineExpose({ open })
</script>

<style scoped src="./plannerConditionCards.css"></style>
<style scoped>
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.routine-fields { display: grid; gap: 18px; min-width: 0; padding: 0; margin: 0; border: 0; }
.routine-period { display: block; width: 100%; text-align: left; margin-top: 8px; }
.routine-dates { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.routine-dates label { display: grid; gap: 6px; min-width: 0; }
.routine-dates input { width: 100%; min-width: 0; }
.routine-field { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
label { font-size: 14px; line-height: 1.5; }
.routine-counter { display: flex; align-items: center; gap: 6px; }
.routine-counter input { width: 64px; min-width: 0; text-align: center; }
.routine-counter button { display: grid; place-items: center; width: 36px; padding-inline: 0; }
input, button { box-sizing: border-box; min-height: 38px; border: 1px solid var(--line); border-radius: 7px; padding: 7px; background: var(--cream); color: var(--ink); font: inherit; }
button { cursor: pointer; }
.training-level-field { display: grid; gap: 8px; }
.training-level-select { width: 100%; }
.routine-help { color: var(--ink-60); font-size: 12px; line-height: 1.6; margin: 0; }

:is(input, button):focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px; }
:disabled { opacity: .55; cursor: default; }
fieldset:disabled { opacity: 1; }
@media (max-width: 767px) {
  input, button { min-height: 44px; }
  input { font-size: 16px; }
  .routine-counter button { width: 44px; }
}
</style>
