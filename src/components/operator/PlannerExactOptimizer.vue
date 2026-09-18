<template>
  <section class="exact-planner" :class="{ embedded }" aria-labelledby="exact-planner-title">
    <div class="exact-heading">
      <div class="exact-heading-copy"><h3 id="exact-planner-title">{{ input?.objective === 'coins' ? '目标期限内的方案' : '方案对比' }}</h3><p class="exact-description">{{ description }}</p></div>
      <div class="exact-controls exact-toolbar" :class="{ 'has-alternatives': canExploreAlternatives }">
        <label class="exact-time-limit"><span class="desktop-copy">每个方案计算时限</span><span class="mobile-copy">时限</span><PlannerSelect v-model="seconds" class="exact-seconds-select" label="每个方案计算时限" numeric :menu-width="104" :options="timeLimitOptions" :disabled="busy || disabled" /></label>
        <button v-if="busy" type="button" class="exact-calculate" @click="cancel"><X :size="15" aria-hidden="true" /><span class="desktop-copy">取消剩余计算</span><span class="mobile-copy">取消计算</span></button>
        <button v-else type="button" class="exact-calculate" :class="{ primary: !canExploreAlternatives }" :disabled="disabled || !input" @click="calculate('comparison')"><Calculator :size="15" aria-hidden="true" /><span class="desktop-copy">{{ Object.keys(results).length ? '重新计算全局最优解' : '计算全局最优解' }}</span><span class="mobile-copy">{{ Object.keys(results).length ? '重新计算' : '计算方案' }}</span></button>
        <button v-if="canExploreAlternatives" type="button" class="primary exact-explore" :disabled="disabled || busy" @click="calculate('alternatives')"><Calculator :size="15" aria-hidden="true" /><span class="desktop-copy">计算期限与补足方案</span><span class="mobile-copy">计算补足方案</span></button>
      </div>
    </div>
    <p class="exact-help exact-date-help">{{ input?.objective === 'coins' ? `对比起点：${dateLabel}；按当前库存独立试算，不改写日程。` : `对比起点：${dateLabel}；${dateSelectionHint}` }}</p>
    <details class="exact-info">
      <summary><span><CalendarDays :size="14" aria-hidden="true" />{{ dateLabel }} 起</span><span>计算说明<ChevronDown :size="14" aria-hidden="true" /></span></summary>
      <div><p>{{ description }}</p><p>{{ input?.objective === 'coins' ? '按当前库存独立试算，不改写日程。' : dateSelectionHint }}</p></div>
    </details>
    <p v-if="busy || message" class="exact-status" :class="{ 'is-computing': busy }" role="status" aria-atomic="true">{{ busy ? progress : message }}</p>
    <p v-if="showEstimateNote" class="exact-estimate-note">快速估算 · 尚未证明最优</p>
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
        <p v-if="scenario.result" class="exact-proof" :class="scenario.result.status" role="status">{{ scenario.input.feasibilityOnly && scenario.result.solution ? '已验证可行，不保证最优' : resultLabel(scenario.result) }}</p>
        <p v-else-if="errors[scenario.id]" class="exact-error" role="alert">{{ errors[scenario.id] }}</p>
        <p v-else class="exact-proof" :class="{ pending: activeId === scenario.id, 'shared-estimate': showEstimateNote && scenario.summary }">{{ activeId === scenario.id ? '正在计算…' : busy ? '等待计算' : scenario.summary ? '快速估算 · 未证明最优' : '尚未计算' }}</p>
        <p v-if="scenario.result?.status === 'infeasible'" class="exact-help">{{ scenario.result.horizon }} 天内{{ scenario.input.objective === 'extra' ? '在每日补充上限内仍无法完成，可延长期限或调整培养与派遣。' : '无法满足全部约束（每日最多购买 8 次）。' }}</p>
        <dl v-if="scenario.summary" class="exact-metrics" :aria-label="scenario.result?.solution ? '计算结果' : '快速估算，未证明最优'">
          <div><dt>预计备齐</dt><dd>{{ scenario.summary.etaDays }}<small>天</small></dd></div>
          <div><dt>累计白金币</dt><dd>{{ scenario.summary.totalCoins.toLocaleString() }}</dd></div>
          <div v-if="scenario.input.objective === 'extra'" class="exact-extra"><dt>还需额外体力</dt><dd>{{ scenario.summary.requiredExtra.toLocaleString() }}</dd></div>
        </dl>
        <p v-if="!scenario.result && scenario.summary && busy" class="exact-help">以上为快速估算，未证明最优。</p>
        <p v-if="!scenario.result && !scenario.summary && !errors[scenario.id] && !scenario.id.startsWith('deadline-') && scenario.input.objective !== 'coins'" class="exact-help">快速估算未找到可行方案，可运行全局计算进一步验证。</p>
        <template v-if="scenario.result?.solution">
          <p v-if="scenario.result.objective === 'overall' && scenario.result.status !== 'optimal'" class="exact-help">最短至少 {{ scenario.result.lowerBound }} 天。</p>
          <p v-if="scenario.result.objective === 'priority'" class="exact-help">{{ agentCompletionLabel(scenario.result) }}</p>
          <details v-if="scenario.result.solution.reserveUsage?.length" class="reserve-summary"><summary>储备：已领取 {{ scenario.result.solution.totalReserveUsed }} · 未领取 {{ scenario.result.solution.totalReserveUnused }}</summary><ul><li v-for="source in scenario.result.solution.reserveUsage" :key="source.id">{{ source.name }} · {{ source.amount }} 体力 · {{ source.usedDate ? source.usedDate + ' 整笔领取' : '未领取' }}</li></ul><p class="exact-help">每条仅领取一次。未领取项未计入日程；已证明最低费用时，剩余储备无法再降低白金币。</p></details>
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
  ? result.objective === 'extra' ? '已证明最少补充体力' : result.objective === 'coins' ? '已证明最低白金币' : result.objective === 'priority' ? '已证明按清单顺序全局最优' : '已证明全局最短'
  : ({ feasible: '已有可行方案，尚未证明最优', infeasible: '已证明当前期限不可行', unknown: '暂未找到可行方案，无法判断是否可完成' }[result.status] || '计算结束') }
function agentCompletionLabel(result) { return Object.entries(result.solution?.agentDays || {}).map(([id, days]) => `${props.agentNames[id] || id}：${days} 天`).join('；') }
const runner = createExactComparisonRunner(() => new Worker(new URL('../../workers/exactPlanner.worker.js', import.meta.url), { type: 'module' }), data => {
  if (resultInput !== JSON.stringify(props.input)) return
  const scenario = runningScenarios.find(item => item.id === data.id)
  if (data.type === 'complete') { busy.value = false; activeId.value = ''; message.value = '本次计算结束，请查看结果与证明状态。'; return }
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
.alternative-dialog { width: min(520px, calc(100% - 32px)); margin: auto; padding: 20px; border: 1px solid var(--planner-line); border-radius: 18px; background: var(--surface); color: var(--ink); }.alternative-dialog::backdrop { background: rgba(73,59,44,.5); }.alternative-dialog .exact-controls { margin-top: 16px; }

.exact-planner { padding: 16px; border: 1px solid var(--planner-line); border-radius: 12px; background: var(--surface); color: var(--ink); }
.exact-planner.embedded { padding: 18px; border: 0; border-top: 1px solid var(--planner-line); border-radius: 0; background: transparent; }
.exact-comparisons { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr)); gap: 12px; }
.exact-result { min-width: 0; }
.mobile-copy, .exact-info, .exact-estimate-note { display: none; }
.exact-result-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px 10px; }
.exact-result-tag { flex: none; padding: 3px 7px; border: 1px solid var(--planner-line); border-radius: 5px; color: var(--accent-strong); background: var(--surface); font-size: 12px; line-height: 1.4; }
.exact-heading-copy { min-width: 0; }
.exact-proof { color: var(--ink-60); font-size: 12px; }
.exact-proof.optimal { color: var(--tea); font-weight: 700; }
.exact-proof.infeasible, .exact-error { color: var(--rouge); }
.exact-proof.feasible, .exact-proof.pending { color: var(--accent-strong); }
.exact-proof::before { content: ''; display: inline-block; width: 5px; height: 5px; margin-right: 6px; border-radius: 50%; background: currentColor; vertical-align: middle; }
.exact-result.featured { grid-column: 1 / -1; border: 1px solid var(--accent); border-left: 3px solid var(--accent); }
.reserve-summary ul { padding-left: 18px; line-height: 1.8; }
h4 { margin: 0; color: var(--tea); font-size: 15px; }
.exact-heading { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; }
h3 { margin: 0; color: var(--tea); font: 900 18px 'Noto Serif SC', serif; letter-spacing: .04em; }
p { margin: 6px 0 0; font-size: 13px; line-height: 1.7; }
.exact-controls { display: flex; flex-wrap: wrap; align-items: end; gap: 8px; }
label { display: grid; gap: 4px; font-size: 12px; }
.exact-seconds-select { width: 104px; }
button { min-height: 44px; padding: 9px 12px; border: 1px solid var(--planner-line); border-radius: 8px; background: var(--cream); color: var(--tea); font: inherit; font-size: 13px; }
button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; }
button.primary { border-color: var(--tea); background: var(--tea); color: var(--cream); }
@media (hover: hover) and (pointer: fine) { button:hover:not(:disabled) { filter: brightness(1.1); } }
button:disabled { opacity: .55; cursor: default; }
button:focus-visible, summary:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 3px; }
.exact-help { font-size: 12px; }
.exact-status, .exact-result { margin-top: 12px; padding: 12px; background: var(--cream); border-left: 3px solid var(--accent); }
.exact-metrics { display: flex; flex-wrap: wrap; gap: 8px 20px; margin: 10px 0; font-size: 13px; }
.exact-metrics > div { display: flex; align-items: baseline; min-width: 0; gap: 6px; }
.exact-metrics dt { color: var(--ink-60); font-size: 12px; line-height: 1.5; }
.exact-metrics dd { margin: 0; color: var(--tea); font: 700 18px/1.2 var(--font-d); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.exact-metrics dd small { margin-left: 4px; font: 400 12px var(--font-b); }
.exact-metrics .exact-extra { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; flex-basis: 100%; grid-column: 1 / -1; gap: 4px 10px; padding-top: 8px; border-top: 1px dashed var(--planner-line); }
.exact-extra dd { margin: 0; color: var(--accent-strong); font-size: 18px; }
details { margin-top: 12px; font-size: 13px; }
summary { min-height: 44px; padding: 12px 0; cursor: pointer; }
.exact-days { max-height: 360px; overflow-y: auto; margin: 0; padding-left: 24px; }
.exact-days li { padding: 10px 4px; border-bottom: 1px solid var(--planner-line); }
small { font-size: 12px; font-weight: 400; }
.exact-apply { margin-top: 12px; }
@media (max-width: 640px) {
  .exact-planner, .exact-planner.embedded { padding: 12px; }
  .desktop-copy, .exact-description, .exact-date-help { display: none; }
  .mobile-copy { display: inline; }
  .exact-heading { flex-direction: column; gap: 10px; }
  h3 { font-size: 17px; line-height: 1.4; }
  h4 { font: 800 15px/1.5 var(--font-s); }
  p { font-size: 12px; line-height: 1.6; }
  .exact-toolbar { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: 8px; }
  .exact-time-limit { display: flex; align-items: center; gap: 4px; color: var(--ink-60); }
  .exact-time-limit > span { flex: none; }
  .exact-seconds-select { width: 84px; }
  .exact-toolbar button { min-width: 0; padding: 8px; }
  .exact-toolbar.has-alternatives .exact-explore { grid-column: 1 / -1; }
  button { gap: 6px; touch-action: manipulation; }
  button svg { flex: none; }
  button:active:not(:disabled) { filter: brightness(.95); }
  .exact-info { display: block; margin: 4px 0 0; color: var(--ink-60); }
  .exact-info > summary { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 8px; min-height: 44px; padding: 6px 0; list-style: none; font-size: 12px; }
  .exact-info > summary::-webkit-details-marker, .exact-schedule > summary::-webkit-details-marker { display: none; }
  .exact-info > summary > span { display: inline-flex; align-items: center; gap: 5px; }
  .exact-info[open] > summary > span:last-child svg, .exact-schedule[open] > summary svg { transform: rotate(180deg); }
  .exact-info > div { padding: 0 0 10px; }
  .exact-info p { margin-top: 4px; }
  .exact-status { margin: 0 0 8px; padding: 8px 10px; border-left-width: 2px; border-radius: 0 6px 6px 0; color: var(--ink-60); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
  .exact-status.is-computing { color: var(--accent-strong); }
  .exact-estimate-note { display: block; margin: 0 0 8px; color: var(--ink-60); font-size: 12px; }
  .exact-proof.shared-estimate { display: none; }
  .exact-comparisons { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .exact-result { margin: 0; padding: 10px; border: 1px solid var(--planner-line); border-radius: 10px; background: var(--surface); }
  .exact-result.featured { border: 1px solid var(--accent); box-shadow: inset 3px 0 0 var(--accent); }
  .exact-result.computing { border-color: var(--accent); }
  .exact-result-heading { align-items: baseline; gap: 4px 8px; }
  .exact-result-tag { padding: 2px 5px; background: var(--cream); }
  .exact-proof, .exact-policy { margin-top: 4px; }
  .exact-policy { color: var(--ink-60); }
  .exact-metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 8px 0 0; padding: 6px 10px; border-radius: 6px; background: color-mix(in srgb, var(--paper) 48%, var(--surface)); }
  .exact-metrics > div { display: block; }
  .exact-metrics > div + div:not(.exact-extra) { padding-left: 10px; border-left: 1px solid var(--planner-line); }
  .exact-metrics dd { margin-top: 3px; font-size: 20px; }
  .exact-metrics .exact-extra dd { font-size: 18px; }
  .exact-result-actions { display: grid; grid-template-columns: minmax(0, 1fr) 100px; align-items: start; gap: 8px; margin-top: 8px; border-top: 1px solid var(--planner-line); padding-top: 6px; }
  .exact-schedule { grid-column: 1 / -1; grid-row: 1; margin: 0; min-width: 0; }
  .exact-schedule > summary { display: flex; align-items: center; min-height: 44px; padding: 6px 0; list-style: none; color: var(--tea); font-size: 12px; }
  .has-apply .exact-schedule > summary { width: calc(100% - 108px); }
  .exact-schedule .mobile-copy { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 4px; }
  .exact-schedule summary small { color: var(--ink-60); font-family: var(--font-d); }
  .exact-apply { position: relative; grid-column: 2; grid-row: 1; width: 100%; min-height: 44px; margin: 0; padding: 8px; font-size: 12px; }
  .reserve-summary { margin-top: 6px; border-top: 1px dashed var(--planner-line); }
  .reserve-summary summary { padding: 10px 0; font-size: 12px; line-height: 1.6; }
  .reserve-summary ul { padding-left: 16px; font-size: 12px; overflow-wrap: anywhere; }
  .exact-days { max-height: 320px; padding: 0; list-style: none; overscroll-behavior-y: contain; }
  .exact-days li { padding: 8px 0; font-size: 12px; line-height: 1.6; }
  .exact-days li > strong { font-family: var(--font-d); font-weight: 700; }
  .exact-days p { margin-top: 4px; }
  .exact-days li > small { display: block; margin-top: 4px; color: var(--ink-60); }
  .alternative-dialog { padding: 16px; border-radius: 12px; }
  .alternative-dialog .exact-controls { display: grid; grid-template-columns: 1fr 1fr; }
}
</style>
