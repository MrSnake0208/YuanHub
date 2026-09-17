<template>
  <section class="exact-planner" :class="{ embedded }" aria-labelledby="exact-planner-title">
    <div class="exact-heading">
      <div><h3 id="exact-planner-title">{{ input?.objective === 'coins' ? '目标期限内的方案' : '方案对比' }}</h3><p>{{ description }}</p></div>
      <div class="exact-controls">
        <label>每个方案计算时限<select v-model.number="seconds" :disabled="busy"><option :value="30">30 秒</option><option :value="60">60 秒</option><option :value="120">120 秒</option></select></label>

        <button v-if="busy" type="button" @click="cancel"><X :size="15" aria-hidden="true" />取消剩余计算</button>
        <button v-else type="button" :class="{ primary: !canExploreAlternatives }" :disabled="disabled || !input" @click="calculate('comparison')"><Calculator :size="15" aria-hidden="true" />{{ Object.keys(results).length ? '重新计算全局最优解' : '计算全局最优解' }}</button>
        <button v-if="canExploreAlternatives" type="button" class="primary" :disabled="disabled || busy" @click="calculate('alternatives')"><Calculator :size="15" aria-hidden="true" />计算期限与补足方案</button>
      </div>
    </div>
    <p class="exact-help">{{ input?.objective === 'coins' ? `对比起点：${dateLabel}；按当前库存独立试算，不改写日程。` : `对比起点：${dateLabel}；可在下方日期栏切换起点。` }}</p>
    <p v-if="busy || message" class="exact-status" role="status" aria-atomic="true">{{ busy ? progress : message }}</p>
    <PlannerDeadlineTrack v-if="visitedDays.length" :groups="dayGroups" :results="results" :selected="selectedAlternative"
      :target-days="input.dates.length" :extra-limit="PLANNER_RULES.maxDailyExtraStamina" @select="selectedAlternative = $event" />
    <dialog ref="applyDialog" class="alternative-dialog" aria-labelledby="alternative-apply-title"><h3 id="alternative-apply-title">采用补足日程</h3><p>将从规划起始日替换今天及后续日程，包括原手工安排。请确认能在每日安排中取得所需额外体力，并接受购买和派遣调整。</p><p v-if="applyingScenario">需额外体力 {{ results[applyingScenario.id]?.solution?.requiredExtra || 0 }} · 累计白金币 {{ results[applyingScenario.id]?.solution?.totalCoins || 0 }}</p><div class="exact-controls"><button autofocus @click="applyDialog.close()">取消</button><button class="primary" :disabled="disabled || busy" @click="confirmAlternative">确认采用</button></div></dialog>
    <div class="exact-comparisons">
      <article v-for="scenario in scenarios" :key="scenario.id" class="exact-result" :class="{ featured: scenario.id === 'minimum-coins' || scenario.id.startsWith('deadline-') }" :aria-label="scenario.title">
        <p v-if="scenario.id === 'minimum-coins'" class="exact-help">目标方案 · 每日购买次数可不同</p>
        <h4>{{ scenario.title }}</h4>
        <p v-if="scenario.input.objective === 'extra'" class="exact-help">{{ scenario.input.reduceDispatch ? '可减少派遣，' : '' }}保留当前每日购买 {{ scenario.input.preferences?.purchaseCount || 0 }} 次，优先利用可用储备。额外补充每日最多 {{ PLANNER_RULES.maxDailyExtraStamina }} 体力（估算），需在建议日期到账。</p>
        <template v-if="results[scenario.id]">
          <p role="status"><strong>{{ scenario.input.feasibilityOnly && results[scenario.id].solution ? '已验证可行，不保证最优' : resultLabel(results[scenario.id]) }}</strong></p>
          <p v-if="results[scenario.id].status === 'infeasible'">{{ results[scenario.id].horizon }} 天内{{ scenario.input.objective === 'extra' ? '在每日补充上限内仍无法完成，可延长期限或调整培养与派遣。' : '无法满足全部约束（每日最多购买 8 次）。' }}</p>
          <template v-if="results[scenario.id].solution">
            <div v-if="scenario.input.objective === 'extra'" class="exact-metrics"><span>还需额外体力 <b>{{ results[scenario.id].solution.requiredExtra }}</b></span></div>
            <div class="exact-metrics"><span>预计 <b>{{ results[scenario.id].solution.etaDays }}</b> 天备齐</span><span>累计白金币 <b>{{ results[scenario.id].solution.totalCoins.toLocaleString() }}</b></span></div>
            <p v-if="results[scenario.id].objective === 'overall' && results[scenario.id].status !== 'optimal'" class="exact-help">最短至少 {{ results[scenario.id].lowerBound }} 天。</p>
            <p v-if="results[scenario.id].objective === 'priority'" class="exact-help">{{ agentCompletionLabel(results[scenario.id]) }}</p>

            <details v-if="results[scenario.id].solution.reserveUsage?.length" class="reserve-summary"><summary>储备：已领取 {{ results[scenario.id].solution.totalReserveUsed }} · 未领取 {{ results[scenario.id].solution.totalReserveUnused }}</summary><ul><li v-for="source in results[scenario.id].solution.reserveUsage" :key="source.id">{{ source.name }} · {{ source.amount }} 体力 · {{ source.usedDate ? source.usedDate + ' 整笔领取' : '未领取' }}</li></ul><p class="exact-help">每条仅领取一次。未领取项未计入日程；已证明最低费用时，剩余储备无法再降低白金币。</p></details>
            <p v-if="scenario.id.startsWith('deadline-') && scenario.input.objective === 'coins'" class="exact-help">{{ purchaseDifference(results[scenario.id]) }}</p>
            <details><summary>查看每日安排（{{ results[scenario.id].solution.timeline.length }} 条记录）</summary>
              <ol class="exact-days"><li v-for="day in results[scenario.id].solution.timeline" :key="day.date"><strong>{{ day.date }}<small v-if="day.manual"> · 固定来源或手工日</small></strong><p>{{ day.planned.spends.filter(spend => spend.value > 0).map(spend => `${spend.label} ×${spend.value}`).join('；') || '无需刷取' }}</p><p v-if="scenario.id.startsWith('deadline-')" class="exact-help">购买 {{ day.planned.gains.find(g => g.id === 'buy')?.value || 0 }} 次 · 需补充体力 {{ day.planned.gains.find(g => g.id === 'required-extra')?.value || 0 }}</p><p v-if="day.planned.gains.some(g => g.id.startsWith('planner-reserve-'))" class="exact-help">领取储备：{{ day.planned.gains.filter(g => g.id.startsWith('planner-reserve-')).map(g => `${g.label} ${g.value} 体力`).join(' · ') }}</p><p v-if="results[scenario.id].solution.dispatchReductions?.some(change => change.date === day.date)" class="exact-help">{{ results[scenario.id].solution.dispatchReductions.filter(change => change.date === day.date).map(change => `${change.label}减少 ${change.count} 次`).join(' · ') }}</p><small>体力 {{ day.totals.spends }} / {{ day.totals.gains }} · 当日结余 {{ day.totals.balance }} · 白金币 {{ day.totals.coinsSpent }}</small></li></ol>
            </details>
            <button v-if="scenario.id.startsWith('deadline-')" type="button" class="primary exact-apply" :disabled="disabled || busy" @click="requestAlternative(scenario)">采用此补足日程</button>
            <button v-if="input?.objective !== 'coins'" type="button" class="primary exact-apply" :disabled="disabled || busy" @click="applyResult(scenario)">采用{{ scenario.title }}</button>
          </template>
        </template>
        <template v-else>
          <p v-if="errors[scenario.id]" role="alert">{{ errors[scenario.id] }}</p>
          <p v-else>{{ activeId === scenario.id ? '正在求解…' : busy ? '等待计算' : '尚未计算全局最优解' }}</p>
          <p v-if="estimates[scenario.id]" class="exact-help">快速估算：{{ estimates[scenario.id].etaDays }} 天 · 累计 {{ estimates[scenario.id].totalCoins.toLocaleString() }} 白金币，未证明最优。</p>
          <p v-else-if="!scenario.id.startsWith('deadline-') && scenario.input.objective !== 'coins'" class="exact-help">快速估算未找到可行方案，可运行全局计算进一步验证。</p>
        </template>
      </article>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Calculator, X } from '@lucide/vue'
import { createExactComparisonRunner } from '../../data/exactPlannerRunner.js'
import { exactComparisonScenarios, exactDeadlineAlternatives } from '../../data/exactPlannerComparison.js'
import PlannerDeadlineTrack from './PlannerDeadlineTrack.vue'
import { PLANNER_RULES, PURCHASE_CUMULATIVE } from '../../data/cultivationPlanner.js'
import { estimateExactPlanner } from '../../data/exactPlanner.js'
const props = defineProps({ input: Object, embedded: Boolean, disabled: Boolean, dateLabel: String, agentNames: { type: Object, default: () => ({}) } })
const emit = defineEmits(['apply', 'apply-alternative'])
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
.exact-result.featured { grid-column: 1 / -1; border: 1px solid var(--accent); border-left: 3px solid var(--accent); }
.reserve-summary ul { padding-left: 18px; line-height: 1.8; }
h4 { margin: 0; color: var(--tea); font-size: 15px; }
.exact-heading { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; }
h3 { margin: 0; color: var(--tea); font: 900 18px 'Noto Serif SC', serif; letter-spacing: .04em; }
p { margin: 6px 0 0; font-size: 13px; line-height: 1.7; }
.exact-controls { display: flex; flex-wrap: wrap; align-items: end; gap: 8px; }
label { display: grid; gap: 4px; font-size: 12px; }
select, button { min-height: 44px; padding: 9px 12px; border: 1px solid var(--planner-line); border-radius: 8px; background: var(--cream); color: var(--tea); font: inherit; font-size: 13px; }
button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; }
button.primary { border-color: var(--tea); background: var(--tea); color: var(--cream); }
@media (hover: hover) and (pointer: fine) { button:hover:not(:disabled) { filter: brightness(1.1); } }
button:disabled { opacity: .55; cursor: default; }
button:focus-visible, select:focus-visible, summary:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 3px; }
.exact-help { font-size: 12px; }
.exact-status, .exact-result { margin-top: 12px; padding: 12px; background: var(--cream); border-left: 3px solid var(--accent); }
.exact-metrics { display: flex; flex-wrap: wrap; gap: 8px 20px; margin: 10px 0; font-size: 13px; }
.exact-metrics b { font-family: Archivo, sans-serif; font-size: 18px; }
details { margin-top: 12px; font-size: 13px; }
summary { min-height: 44px; padding: 12px 0; cursor: pointer; }
.exact-days { max-height: 360px; overflow-y: auto; margin: 0; padding-left: 24px; }
.exact-days li { padding: 10px 4px; border-bottom: 1px solid var(--planner-line); }
small { font-size: 12px; font-weight: 400; }
.exact-apply { margin-top: 12px; }
@media (max-width: 640px) { .exact-comparisons { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr)); gap: 12px; }
.exact-result { min-width: 0; }
.exact-result.featured { grid-column: 1 / -1; border: 1px solid var(--accent); border-left: 3px solid var(--accent); }
.reserve-summary ul { padding-left: 18px; line-height: 1.8; }
h4 { margin: 0; color: var(--tea); font-size: 15px; }
.exact-heading { flex-direction: column; } .exact-controls > button { flex: 1; } .exact-apply { width: 100%; } }
</style>
