<template>
  <section class="exact-planner" :class="{ embedded }" aria-labelledby="exact-planner-title">
    <div class="exact-heading">
      <div class="exact-heading-copy"><h3 id="exact-planner-title">{{ input?.objective === 'coins' ? '目标期限内的方案' : '方案对比' }}</h3><p class="exact-description">{{ description }}</p></div>
      <div class="exact-controls exact-toolbar" :class="{ 'has-alternatives': canExploreAlternatives }">
        <label class="exact-time-limit"><span class="desktop-copy">每个方案计算时限</span><span class="mobile-copy">时限</span><PlannerSelect v-model="seconds" class="exact-seconds-select" label="每个方案计算时限" numeric :menu-width="104" :options="timeLimitOptions" :disabled="busy || disabled" /></label>
        <button v-if="busy" type="button" class="exact-calculate" @click="cancel"><X :size="15" aria-hidden="true" /><span class="desktop-copy">取消剩余计算</span><span class="mobile-copy">取消计算</span></button>
        <button v-else type="button" class="exact-calculate" :class="{ primary: !canExploreAlternatives }" :disabled="disabled || !input" @click="calculate('comparison')"><Calculator :size="15" aria-hidden="true" /><span class="desktop-copy">{{ Object.keys(results).length ? '重新计算方案' : '计算更优方案' }}</span><span class="mobile-copy">{{ Object.keys(results).length ? '重新计算' : '计算方案' }}</span></button>
        <button v-if="canExploreAlternatives" type="button" class="primary exact-explore" :disabled="disabled || busy" @click="calculate('alternatives')"><Calculator :size="15" aria-hidden="true" /><span class="desktop-copy">计算期限与补足方案</span><span class="mobile-copy">计算补足方案</span></button>
      </div>
    </div>
    <p class="exact-help exact-date-help">{{ input?.objective === 'coins' ? `对比起点：${dateLabel}；按当前库存独立试算，不改写日程。` : `对比起点：${dateLabel}；${dateSelectionHint}` }}</p>
    <details class="exact-info">
      <summary><span><CalendarDays :size="14" aria-hidden="true" />{{ dateLabel }} 起</span><span>计算说明<ChevronDown :size="14" aria-hidden="true" /></span></summary>
      <div><p>{{ description }}</p><p>{{ input?.objective === 'coins' ? '按当前库存独立试算，不改写日程。' : dateSelectionHint }}</p></div>
    </details>
    <p v-if="busy || message" class="exact-status" :class="{ 'is-computing': busy }" role="status" aria-atomic="true">{{ busy ? progress : message }}</p>
    <p v-if="showEstimateNote" class="exact-estimate-note">快速估算 · 尚未确认最优</p>
    <PlannerDeadlineTrack v-if="visitedDays.length" :groups="dayGroups" :results="results" :selected="selectedAlternative"
      :target-days="input.dates.length" :extra-limit="PLANNER_RULES.maxDailyExtraStamina" @select="selectedAlternative = $event" />
    <dialog ref="applyDialog" class="alternative-dialog" aria-labelledby="alternative-apply-title"><h3 id="alternative-apply-title">采用补足日程</h3><p>将从规划起始日替换今天及后续日程，包括原手工安排。请确认能在每日安排中取得所需额外体力，并接受购买和派遣调整。</p><p v-if="applyingScenario">需额外体力 {{ results[applyingScenario.id]?.solution?.requiredExtra || 0 }} · 累计白金币 {{ results[applyingScenario.id]?.solution?.totalCoins || 0 }}</p><div class="exact-controls"><button autofocus @click="applyDialog.close()">取消</button><button class="primary" :disabled="disabled || busy" @click="confirmAlternative">确认采用</button></div></dialog>
    <div class="exact-comparisons">
      <article v-for="scenario in scenarioCards" :key="scenario.id" class="exact-result" :class="{ featured: scenario.id === 'minimum-coins' || scenario.id.startsWith('deadline-'), computing: activeId === scenario.id }" :aria-label="scenario.title">
        <header class="exact-result-heading">
          <h4><span class="desktop-copy">{{ scenario.title }}</span><span class="mobile-copy">{{ compactTitle(scenario) }}</span></h4>
          <span v-if="scenario.id === 'minimum-coins'" class="exact-result-tag">目标方案</span>
          <span v-else-if="scenario.purchaseCount === input?.preferences?.purchaseCount" class="exact-result-tag">当前设置</span>
        </header>
        <p v-if="scenario.id === 'minimum-coins'" class="exact-help exact-policy">每日购买次数可不同</p>
        <p v-if="scenario.input.objective === 'extra'" class="exact-help exact-policy">{{ scenario.input.reduceDispatch ? '可减少派遣，' : '' }}保留当前每日购买 {{ scenario.input.preferences?.purchaseCount || 0 }} 次，优先利用可用储备。额外补充每日最多 {{ PLANNER_RULES.maxDailyExtraStamina }} 体力（估算），需在建议日期到账。</p>
        <p v-if="scenario.result" class="exact-proof" :class="scenario.result.status" role="status">{{ scenario.input.feasibilityOnly && scenario.result.solution ? '可完成，尚未确认最优' : resultLabel(scenario.result) }}</p>
        <p v-else-if="errors[scenario.id]" class="exact-error" role="alert">{{ errors[scenario.id] }}</p>
        <p v-else class="exact-proof" :class="{ pending: activeId === scenario.id, 'shared-estimate': showEstimateNote && scenario.summary }">{{ activeId === scenario.id ? '正在计算…' : busy ? '等待计算' : scenario.summary ? '快速估算 · 未确认最优' : '尚未计算' }}</p>
        <p v-if="scenario.result?.status === 'infeasible'" class="exact-help">{{ scenario.result.horizon }} 天内{{ scenario.input.objective === 'extra' ? '在每日补充上限内仍无法完成，可延长期限或调整培养与派遣。' : '无法满足全部约束（每日最多购买 8 次）。' }}</p>
        <dl v-if="scenario.summary" class="exact-metrics" :aria-label="scenario.result?.solution ? '计算结果' : '快速估算，未确认最优'">
          <div><dt>预计备齐</dt><dd>{{ scenario.summary.etaDays }}<small>天</small></dd></div>
          <div><dt>累计白金币</dt><dd>{{ scenario.summary.totalCoins.toLocaleString() }}</dd></div>
          <div v-if="scenario.input.objective === 'extra'" class="exact-extra"><dt>还需额外体力</dt><dd>{{ scenario.summary.requiredExtra.toLocaleString() }}</dd></div>
        </dl>
        <p v-if="!scenario.result && scenario.summary && busy" class="exact-help">以上为快速估算，未确认最优。</p>
        <p v-if="!scenario.result && !scenario.summary && !errors[scenario.id] && !scenario.id.startsWith('deadline-') && scenario.input.objective !== 'coins'" class="exact-help">快速估算未找到可行方案，可进一步计算确认。</p>
        <template v-if="scenario.result?.solution">
          <p v-if="scenario.result.objective === 'overall' && scenario.result.status !== 'optimal'" class="exact-help">最短至少 {{ scenario.result.lowerBound }} 天。</p>
          <p v-if="scenario.result.objective === 'priority'" class="exact-help">{{ agentCompletionLabel(scenario.result) }}</p>
          <details v-if="scenario.result.solution.reserveUsage?.length" class="reserve-summary"><summary>储备：已领取 {{ scenario.result.solution.totalReserveUsed }} · 未领取 {{ scenario.result.solution.totalReserveUnused }}</summary><ul><li v-for="source in scenario.result.solution.reserveUsage" :key="source.id">{{ source.name }} · {{ source.amount }} 体力 · {{ source.usedDate ? source.usedDate + ' 整笔领取' : '未领取' }}</li></ul><p class="exact-help">每条仅领取一次。未领取项未计入日程；已确认费用最低时，剩余储备无法再降低白金币。</p></details>
          <p v-if="scenario.id.startsWith('deadline-') && scenario.input.objective === 'coins'" class="exact-help">{{ purchaseDifference(scenario.result) }}</p>
          <div class="exact-result-actions" :class="{ 'has-apply': scenario.id.startsWith('deadline-') || input?.objective !== 'coins' }">
            <details class="exact-schedule">
              <summary><span class="desktop-copy">查看每日安排（{{ scenario.result.solution.timeline.length }} 条记录）</span><span class="mobile-copy">每日安排 <small>{{ scenario.result.solution.timeline.length }}</small><ChevronDown :size="14" aria-hidden="true" /></span></summary>
              <ol class="exact-days"><li v-for="day in scenario.result.solution.timeline" :key="day.date">
                <strong>{{ day.date }}<small v-if="day.manual"> · 固定来源或手工日</small></strong>
                <p>{{ day.planned.spends.filter(spend => spend.value > 0).map(spend => `${spend.label} ×${spend.value}`).join('；') || '无需刷取' }}</p>
                <p v-if="scenario.id.startsWith('deadline-')" class="exact-help">购买 {{ day.planned.gains.find(g => g.id === 'buy')?.value || 0 }} 次 · 需补充体力 {{ day.planned.gains.find(g => g.id === 'required-extra')?.value || 0 }}</p>
                <p v-if="day.planned.gains.some(g => g.id.startsWith('planner-reserve-'))" class="exact-help">领取储备：{{ day.planned.gains.filter(g => g.id.startsWith('planner-reserve-')).map(g => `${g.label} ${g.value} 体力`).join(' · ') }}</p>
                <p v-if="scenario.result.solution.dispatchReductions?.some(change => change.date === day.date)" class="exact-help">{{ scenario.result.solution.dispatchReductions.filter(change => change.date === day.date).map(change => `${change.label}减少 ${change.count} 次`).join(' · ') }}</p>
                <small>体力 {{ day.totals.spends }} / {{ day.totals.gains }} · 当日结余 {{ day.totals.balance }} · 白金币 {{ day.totals.coinsSpent }}</small>
              </li></ol>
            </details>
            <button v-if="scenario.id.startsWith('deadline-')" type="button" class="primary exact-apply" :disabled="disabled || busy" @click="requestAlternative(scenario)"><span class="desktop-copy">采用此补足日程</span><span class="mobile-copy">采用日程</span><ArrowRight :size="14" aria-hidden="true" /></button>
            <button v-else-if="input?.objective !== 'coins'" type="button" class="primary exact-apply" :disabled="disabled || busy" @click="applyResult(scenario)"><span class="desktop-copy">采用{{ scenario.title }}</span><span class="mobile-copy">采用方案</span><ArrowRight :size="14" aria-hidden="true" /></button>
          </div>
        </template>
      </article>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ArrowRight, Calculator, CalendarDays, ChevronDown, X } from '@lucide/vue'
import { createExactComparisonRunner } from '../../data/exactPlannerRunner.js'
import { exactComparisonScenarios, exactDeadlineAlternatives } from '../../data/exactPlannerComparison.js'
import PlannerDeadlineTrack from './PlannerDeadlineTrack.vue'
import PlannerSelect from './PlannerSelect.vue'
import { PLANNER_RULES, PURCHASE_CUMULATIVE } from '../../data/cultivationPlanner.js'
import { estimateExactPlanner } from '../../data/exactPlanner.js'
const props = defineProps({ input: Object, embedded: Boolean, disabled: Boolean, dateLabel: String, dateSelectionHint: { type: String, default: '可在下方日期栏切换起点。' }, agentNames: { type: Object, default: () => ({}) } })
const emit = defineEmits(['apply', 'apply-alternative'])
const timeLimitOptions = [30, 60, 120].map(value => ({ value, label: value + ' 秒' }))
const seconds = ref(30), busy = ref(false), results = ref({}), errors = ref({}), activeId = ref(''), message = ref(''), progress = ref('')
let resultInput = '', runningScenarios = []
const comparisonScenarios = computed(() => { const items = exactComparisonScenarios(props.input); return props.input?.objective === 'coins' ? [...items.filter(item => item.id === 'minimum-coins'), ...items.filter(item => item.id !== 'minimum-coins')] : items })
const canExploreAlternatives = computed(() => props.input?.objective === 'coins' && Object.values(results.value).some(result => result.status === 'infeasible'))
const alternativeScenarios = computed(() => exactDeadlineAlternatives(props.input))
const selectedAlternative = ref(''), visitedDays = ref([]), applyingScenario = ref(null), applyDialog = ref(null)
const dayGroups = computed(() => visitedDays.value.map(days => {
  const items = alternativeScenarios.value.filter(item => item.input.dates.length === days)
  const solutions = items.filter(item => results.value[item.id]?.solution)
  const computing = items.some(item => item.id === activeId.value)
  const done = items.every(item => results.value[item.id] || errors.value[item.id])
  return { days, solutions, state: computing ? 'computing' : solutions.length ? 'ready' : done && items.every(item => results.value[item.id]?.status === 'infeasible') ? 'infeasible' : 'unknown' }
}))
const scenarios = computed(() => [...comparisonScenarios.value.filter(item => !(visitedDays.value.length && results.value[item.id]?.status === 'infeasible')), ...alternativeScenarios.value.filter(item => item.id === selectedAlternative.value && results.value[item.id]?.solution)])
function requestAlternative(scenario) { applyingScenario.value = scenario; applyDialog.value?.showModal() }
function confirmAlternative() {
  if (!props.disabled && !busy.value && resultInput === JSON.stringify(props.input)) emit('apply-alternative', results.value[applyingScenario.value.id])
  applyDialog.value?.close()
}

const estimates = computed(() => Object.fromEntries(comparisonScenarios.value.filter(scenario => scenario.input.objective !== 'coins').map(scenario => [scenario.id, estimateExactPlanner(scenario.input)])))
const scenarioCards = computed(() => scenarios.value.map(scenario => {
  const result = results.value[scenario.id]
  return { ...scenario, result, summary: result?.solution || (!result && !errors.value[scenario.id] ? estimates.value[scenario.id] : null) }
}))
const showEstimateNote = computed(() => !busy.value && !Object.keys(results.value).length && scenarioCards.value.some(scenario => scenario.summary))
function compactTitle(scenario) { return scenario.title.startsWith('当前设置 · ') ? scenario.title.slice('当前设置 · '.length) : scenario.title }
const description = computed(() => props.input?.objective === 'coins' ? '先寻找最低白金币方案，再与固定购买档位对照；储备按各自的领取规则参与计算。'
  : props.input?.objective === 'priority' ? '按培养清单顺序优先完成，比较不同购买档位。' : '以整张清单最早备齐为目标，比较不同购买档位。')
function resultLabel(result) { return result.status === 'optimal'
  ? result.objective === 'extra' ? '当前条件下补充体力最少' : result.objective === 'coins' ? '当前条件下白金币支出最低' : result.objective === 'priority' ? '按清单顺序优先完成的最优方案' : '当前条件下完成时间最短'
  : ({ feasible: '可完成，尚未确认最优', infeasible: '按当前条件，期限内无法完成', unknown: '暂未找到可行方案，无法判断是否可完成' }[result.status] || '计算结束') }
function agentCompletionLabel(result) { return Object.entries(result.solution?.agentDays || {}).map(([id, days]) => `${props.agentNames[id] || id}：${days} 天`).join('；') }
const runner = createExactComparisonRunner(() => new Worker(new URL('../../workers/exactPlanner.worker.js', import.meta.url), { type: 'module' }), data => {
  if (resultInput !== JSON.stringify(props.input)) return
  const scenario = runningScenarios.find(item => item.id === data.id)
  if (data.type === 'complete') { busy.value = false; activeId.value = ''; message.value = '本次计算结束，请查看各方案结果。'; return }
  if (data.type === 'start') { if (data.id.startsWith('deadline-') && !visitedDays.value.includes(scenario.input.dates.length)) visitedDays.value.push(scenario.input.dates.length); activeId.value = data.id; progress.value = `正在计算${scenario.title}…`; return }
  if (data.type === 'progress') { progress.value = `${scenario.title}：${data.message}`; return }
  if (data.type === 'result') results.value[data.id] = { ...data.result, inputKey: JSON.stringify(scenario.input), comparisonInputKey: resultInput, comparisonId: data.id }
  else if (data.type === 'error') errors.value[data.id] = data.message
})
function purchaseDifference(result) {
  const days = result.solution.etaDays
  const daily = PURCHASE_CUMULATIVE[props.input?.preferences?.purchaseCount || 0]
  const delta = result.solution.totalCoins - daily * days
  return `相对相同 ${days} 天每天购买 ${props.input?.preferences?.purchaseCount || 0} 次的预算，${delta >= 0 ? '增加' : '减少'} ${Math.abs(delta)} 白金币；原预算不代表可完成。`
}
function calculate(kind = 'comparison') {
  if (props.disabled || busy.value || !props.input) return
  const selected = kind === 'alternatives' ? alternativeScenarios.value : comparisonScenarios.value
  if (!selected.length) return
  for (const scenario of selected) { delete results.value[scenario.id]; delete errors.value[scenario.id] }
  if (kind === 'alternatives') { visitedDays.value = []; selectedAlternative.value = '' }
  message.value = ''; busy.value = true
  resultInput = JSON.stringify(props.input); runningScenarios = JSON.parse(JSON.stringify(selected))
  const solverUrl = new URL((import.meta.env.BASE_URL || '/') + 'solver/highs-1.15.3/highs.mjs', window.location.origin).href
  runner.run(runningScenarios, solverUrl, seconds.value * 1000)
}
function cancel() { runner.cancel(); busy.value = false; activeId.value = ''; message.value = '已取消剩余计算，已完成的结果仍可查看；原日程保留。' }
function applyResult(scenario) { if (!busy.value && !props.disabled && resultInput === JSON.stringify(props.input)) emit('apply', results.value[scenario.id]) }
watch(() => JSON.stringify(props.input), () => { runner.cancel(); busy.value = false; results.value = {}; errors.value = {}; activeId.value = ''; message.value = ''; visitedDays.value = []; selectedAlternative.value = ''; applyDialog.value?.close() })
onBeforeUnmount(() => runner.cancel())
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.alternative-dialog { border: 1px solid var(--planner-line); border-radius: 18px; background: var(--surface); color: var(--ink); }.alternative-dialog::backdrop { background: rgba(73,59,44,.5); }

.exact-planner { border: 1px solid var(--planner-line); border-radius: 12px; background: var(--surface); color: var(--ink); }
.exact-planner.embedded { border: 0; border-top: 1px solid var(--planner-line); border-radius: 0; background: transparent; }
.exact-result-tag { border: 1px solid var(--planner-line); border-radius: 5px; color: var(--accent-strong); background: var(--surface); }
.exact-proof { color: var(--ink-60); }
.exact-proof.optimal { color: var(--tea); }
.exact-proof.infeasible, .exact-error { color: var(--rouge); }
.exact-proof.feasible, .exact-proof.pending { color: var(--accent-strong); }
.exact-proof::before { content: ''; border-radius: 50%; background: currentColor; }
.exact-result.featured { border: 1px solid var(--accent); border-left: 3px solid var(--accent); }
h4 { color: var(--tea); }
h3 { color: var(--tea); }
button { border: 1px solid var(--planner-line); border-radius: 8px; background: var(--cream); color: var(--tea); }
button { cursor: pointer; }
button.primary { border-color: var(--tea); background: var(--tea); color: var(--cream); }
@media (hover: hover) and (pointer: fine) { button:hover:not(:disabled) { filter: brightness(1.1); } }
button:disabled { opacity: .55; cursor: default; }
button:focus-visible, summary:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 3px; }
.exact-status, .exact-result { background: var(--cream); border-left: 3px solid var(--accent); }
.exact-metrics dt { color: var(--ink-60); }
.exact-metrics dd { color: var(--tea); }
.exact-metrics .exact-extra { border-top: 1px dashed var(--planner-line); }
.exact-extra dd { color: var(--accent-strong); }
summary { cursor: pointer; }
.exact-days li { border-bottom: 1px solid var(--planner-line); }
@media (max-width: 640px) {
  .exact-time-limit { color: var(--ink-60); }
  button:active:not(:disabled) { filter: brightness(.95); }
  .exact-info { color: var(--ink-60); }
  .exact-status { border-left-width: 2px; border-radius: 0 6px 6px 0; color: var(--ink-60); }
  .exact-status.is-computing { color: var(--accent-strong); }
  .exact-estimate-note { color: var(--ink-60); }
  .exact-result { border: 1px solid var(--planner-line); border-radius: 10px; background: var(--surface); }
  .exact-result.featured { border: 1px solid var(--accent); box-shadow: inset 3px 0 0 var(--accent); }
  .exact-result.computing { border-color: var(--accent); }
  .exact-result-tag { background: var(--cream); }
  .exact-policy { color: var(--ink-60); }
  .exact-metrics { border-radius: 6px; background: color-mix(in srgb, var(--paper) 48%, var(--surface)); }
  .exact-metrics > div + div:not(.exact-extra) { border-left: 1px solid var(--planner-line); }
  .exact-result-actions { border-top: 1px solid var(--planner-line); }
  .exact-schedule > summary { color: var(--tea); }
  .exact-schedule summary small { color: var(--ink-60); }
  .reserve-summary { border-top: 1px dashed var(--planner-line); }
  .exact-days li > small { color: var(--ink-60); }
  .alternative-dialog { border-radius: 12px; }
}
</style>
<style scoped src="./plannerExactOptimizerDesktop.css"></style>
<style scoped src="./plannerExactOptimizerMobile.css"></style>
