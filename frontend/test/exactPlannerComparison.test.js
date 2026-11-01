import test from 'node:test'
import assert from 'node:assert/strict'
import loadHighs from '../public/solver/highs-1.15.3/highs.mjs'
import { exactComparisonScenarios, exactCurrentSettingsScenario } from '../src/data/exactPlannerComparison.js'
import { solveExactPlanner } from '../src/data/exactPlanner.js'
import { createExactComparisonRunner } from '../src/data/exactPlannerRunner.js'
import { applyExactComparisonResult, createFixedSchedule, plannerBasePlan, plannerBaseValue, restoreFixedScheduleDay, plannerDateAfter, updateFixedSchedulePlan } from '../src/data/fixedPlannerSchedule.js'
import { clonePlannerValue, createGain, createSpend, normalizePlannerPlan } from '../src/data/cultivationPlanner.js'
import { scheduleBody, scheduleFromRemote } from '../src/data/operatorPlannerRemote.js'
const highs = await loadHighs()
const input = () => ({ date: '2026-09-15', initialState: { a: { __xp__: 500000 } }, requiredState: { a: { __xp__: 500000 } },
  goals: { a: [80, 13, 7] }, stock: {}, preferences: { purchaseCount: 0 }, levels: {}, objective: 'overall', strategy: 'overall', agentOrder: ['a'],
  dates: Array.from({ length: 10 }, (_, i) => plannerDateAfter('2026-09-15', i)), manualPlans: {} })
const solve = config => solveExactPlanner(config, highs, { timeLimitMs: 5000 })

test('同一起点比较零投入和每日两次，真实求解输出各自证明、天数和费用', () => {
  const scenarios = exactComparisonScenarios(input())
  assert.deepEqual(scenarios.map(s => s.purchaseCount), [0, 2])
  const [zero, twice] = scenarios.map(s => solve(s.input))
  assert.equal(zero.status, 'optimal'); assert.equal(twice.status, 'optimal')
  assert.equal(zero.solution.etaDays, 3); assert.equal(twice.solution.etaDays, 2)
  assert.equal(zero.solution.totalCoins, 0); assert.equal(twice.solution.totalCoins, 200)
})

test('对比只替换首日购买，保留其他来源、未来固定日，当前档位去重', () => {
  const original = input()
  original.preferences.purchaseCount = 3
  original.firstDay = normalizePlannerPlan({ gains: [createGain('natural'), createGain('custom', { value: 125 }), createGain('buy', { value: 3 })], spends: [] })
  original.manualPlans['2026-09-16'] = normalizePlannerPlan({ gains: [createGain('natural'), createGain('buy', { value: 1 })], spends: [] })
  const before = clonePlannerValue(original)
  const variants = exactComparisonScenarios(original)
  assert.deepEqual(variants.map(s => s.purchaseCount), [0, 2, 3])
  for (const variant of variants) {
    assert.deepEqual(clonePlannerValue(variant.input.manualPlans), before.manualPlans)
    assert.deepEqual(clonePlannerValue(variant.input.firstDay.gains.filter(g => g.id !== 'buy')), before.firstDay.gains.filter(g => g.id !== 'buy'))
    assert.equal(variant.input.firstDay.gains.find(g => g.id === 'buy')?.value || 0, variant.purchaseCount)
  }
  assert.deepEqual(clonePlannerValue(original), before)
  assert.deepEqual(exactComparisonScenarios({ ...original, preferences: { purchaseCount: 2 } }).map(s => s.purchaseCount), [0, 2])
})

test('目标期限内并列比较固定购买与最低白金币，不将未达期限称作可行', () => {
  const original = { ...input(), objective: 'coins', dates: input().dates.slice(0, 2) }
  const variants = exactComparisonScenarios(original)
  assert.equal(variants.length, 3)
  const [zero, twice, minimum] = variants.map(s => solve(s.input))
  assert.equal(zero.status, 'infeasible')
  assert.equal(twice.status, 'optimal'); assert.equal(twice.solution.totalCoins, 200)
  assert.equal(minimum.status, 'optimal'); assert.equal(minimum.solution.totalCoins, 150)
})

test('采用对比项同步购买偏好与日程，云端往返保留；过期或错误对比项不能采用', () => {
  const original = input(), base = createFixedSchedule(original)
  original.firstDay = base.result.timeline[0].planned
  const scenario = exactComparisonScenarios(original)[1]
  const result = { ...solve(scenario.input), comparisonInputKey: JSON.stringify(original), comparisonId: scenario.id, inputKey: JSON.stringify(scenario.input) }
  const adopted = applyExactComparisonResult(base, original.date, result, original, {})
  assert.equal(adopted.preferences.purchaseCount, 2)
  assert.equal(adopted.schedule.context.preferences.purchaseCount, 2)
  assert.equal(adopted.manualPlans[original.date].gains.find(g => g.id === 'buy').value, 2)
  const wire = scheduleBody({ ...adopted, strategy: 'overall', agentOrder: ['a'] })
  const restored = scheduleFromRemote({ ...wire, account_id: 'a', revision: 1 }, 'a')
  assert.equal(restored.preferences.purchaseCount, 2)
  assert.equal(restored.schedule.result.etaDays, 2)
  const day = restored.schedule.result.timeline[0]
  assert.deepEqual(plannerBasePlan(restored.schedule, day), day.planned)
  const editedPlan = clonePlannerValue(day.planned)
  editedPlan.spends[0].value = 1
  const edited = updateFixedSchedulePlan(restored.schedule, day.date, editedPlan)
  const reference = plannerBasePlan(edited, edited.result.timeline[0])
  assert.deepEqual(reference, day.planned)
  assert.equal(plannerBaseValue(reference, 'spends', editedPlan.spends[0]), day.planned.spends[0].value)
  assert.equal(restoreFixedScheduleDay(restored.schedule, day.date, restored.manualPlans).schedule, restored.schedule)
  const reset = restoreFixedScheduleDay(edited, day.date, { ...restored.manualPlans, [day.date]: editedPlan })
  assert.deepEqual(reset.schedule.result.timeline.map(item => item.planned), restored.schedule.result.timeline.map(item => item.planned))
  assert.deepEqual(reset.manualPlans[day.date], day.planned)
  assert.equal(reset.manualPlans[day.date].gains.find(gain => gain.id === 'buy').value, 2)
  assert.throws(() => applyExactComparisonResult(base, original.date, result, { ...original, planId: 'changed' }, {}), /条件已变化/)
  assert.throws(() => applyExactComparisonResult(base, original.date, { ...result, comparisonId: 'bad' }, original, {}), /找不到/)
})

test('批量求解逐项输出，失败继续；取消阻止剩余任务和迟到结果', () => {
  const workers = [], received = []
  const runner = createExactComparisonRunner(() => {
    const worker = { postMessage(data) { this.data = data }, terminate() { this.terminated = true } }
    workers.push(worker); return worker
  }, data => received.push(data))
  const scenarios = exactComparisonScenarios(input())
  runner.run(scenarios, 'local', 1000)
  assert.equal(workers.length, 1)
  workers[0].onmessage({ data: { type: 'result', result: { status: 'optimal' } } })
  assert.equal(workers.length, 2)
  assert.equal(received.find(d => d.type === 'result').id, 'purchase-0')
  runner.cancel()
  workers[1].onmessage({ data: { type: 'result', result: 'late' } })
  assert.equal(received.filter(d => d.type === 'result').length, 1)
  runner.run(scenarios, 'local', 1000)
  workers[2].onerror()
  assert.equal(workers.length, 4)
  workers[3].onmessage({ data: { type: 'result', result: { status: 'feasible' } } })
  assert.equal(received.at(-1).type, 'complete')
  assert.equal(received.filter(d => d.type === 'error').length, 1)
  runner.cancel()
})

test('一次性储备不能拆分，多条独立储备可分日领取以进一步降低白金币', () => {
  const original = { ...input(), dates: input().dates.slice(0, 2), objective: 'coins',
    initialState: { a: { shuijing: 720, xianmenshan: 720, bawanglei: 720, __xp__: 228000 } } }
  const pack = amount => ({ id: 'pack-' + amount, name: '礼包', amount, mode: 'flexible', date: original.date })
  const whole = solve({ ...original, reserveSources: [pack(144)] })
  const separate = solve({ ...original, reserveSources: [{ ...pack(72), id: 'one' }, { ...pack(72), id: 'two' }] })
  assert.equal(whole.status, 'optimal'); assert.equal(whole.solution.totalCoins, 50)
  assert.equal(whole.solution.reserveUsage.filter(s => s.usedDate).length, 1)
  assert.equal(separate.status, 'optimal'); assert.equal(separate.solution.totalCoins, 0)
  assert.equal(new Set(separate.solution.reserveUsage.map(s => s.usedDate)).size, 2)
  assert.equal(separate.solution.totalReserveUsed, 144)
  assert.equal(separate.solution.totalReserveUnused, 0)
  for (const day of separate.solution.timeline) assert.equal(day.totals.balance, 0)
})

test('自动选择领取日利用后日缺口，起始日固定储备不能结转', () => {
  const original = { ...input(), dates: input().dates.slice(0, 2), objective: 'coins', initialState: { a: { shuijing: 720 } },
    preferences: { luoyang: 4, shouchun: 4 }, firstDay: { gains: [createGain('custom', { value: 728 })], spends: [] } }
  // Fix first-day dispatch exactly like later days, leaving enough for 6 training runs.
  original.firstDay.spends = [
    { id: 'luoyang', kind: 'count', value: 4, costPer: 60 },
    { id: 'shouchun', kind: 'count', value: 4, costPer: 60 }
  ]
  const pack = { id: 'pack', name: '储备', amount: 320, date: original.date }
  const flexible = solve({ ...original, reserveSources: [{ ...pack, mode: 'flexible' }] })
  const fixed = solve({ ...original, reserveSources: [{ ...pack, mode: 'fixed' }] })
  assert.equal(flexible.status, 'optimal'); assert.equal(flexible.solution.totalCoins, 0)
  assert.equal(flexible.solution.reserveUsage[0].usedDate, '2026-09-16')
  assert.equal(fixed.status, 'optimal'); assert.ok(fixed.solution.totalCoins > 0)
  assert.equal(fixed.solution.reserveUsage[0].usedDate, original.date)
})

test('达到零白金币后不领取多余储备，未领取不会算入体力或购买', () => {
  const original = { ...input(), objective: 'coins', initialState: { a: { __xp__: 3800 } }, reserveSources: [
    { id: 'keep', name: '留存礼包', amount: 1000, mode: 'flexible', date: '2026-09-15' }
  ] }
  const result = solve(original)
  assert.equal(result.status, 'optimal'); assert.equal(result.solution.totalCoins, 0)
  assert.equal(result.solution.totalReserveUsed, 0)
  assert.equal(result.solution.totalReserveUnused, 1000)
  assert.equal(result.solution.reserveUsage[0].usedDate, null)
})


test('当前设置最短天数独立于目标期限，保留实际购买档位、额外体力和待领取储备', () => {
  const original = { ...input(), objective: 'coins', dates: input().dates.slice(0, 1), initialExtra: 0,
    reserveSources: [{ id: 'pack', name: '礼包', amount: 10, date: '2026-09-15', mode: 'flexible' }] }
  const scenario = exactCurrentSettingsScenario(original)
  assert.equal(scenario.id, 'current-shortest')
  assert.equal(scenario.input.objective, 'overall')
  assert.equal(scenario.input.dates.length, 90)
  assert.equal(scenario.input.dates[0], original.dates[0])
  assert.equal(scenario.input.preferences.purchaseCount, 0)
  assert.deepEqual(scenario.input.reserveSources, original.reserveSources)
  assert.equal(solve(scenario.input).solution.etaDays, 3)
  const twice = exactCurrentSettingsScenario({ ...original, preferences: { purchaseCount: 2 } })
  assert.equal(solve(twice.input).solution.etaDays, 2)
  const extra = exactCurrentSettingsScenario({ ...original, initialExtra: 1000 })
  const result = solve(extra.input)
  assert.equal(result.status, 'optimal')
  assert.equal(result.solution.etaDays, 1)
  assert.ok(result.solution.timeline[0].totals.gains >= 1408)
  assert.equal(original.dates.length, 1)
  assert.equal(original.objective, 'coins')
})

test('期限补足优化区分体力缺口、阶梯购买费用与每日次数硬约束', async () => {
  const { exactDeadlineAlternatives } = await import('../src/data/exactPlannerComparison.js')
  const original = { ...input(), objective: 'coins', dates: input().dates.slice(0, 2) }
  const candidates = exactDeadlineAlternatives(original)
  assert.deepEqual(candidates.map(s => s.input.dates.length), [2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9])
  const extra = solve(candidates[0].input), coins = solve(candidates[1].input)
  assert.equal(extra.status, 'feasible'); assert.ok(extra.solution.requiredExtra > 0)
  assert.equal(extra.solution.totalCoins, 0)
  assert.equal(coins.status, 'feasible'); assert.ok(coins.solution.totalCoins >= 150)
  assert.ok(solve(candidates[2].input).solution.requiredExtra >= 0)
  const blocked = solve({ ...candidates[0].input, initialState: { a: { shuijing: 721 } } })
  assert.equal(blocked.status, 'infeasible')
  const capped = exactDeadlineAlternatives({ ...original, dates: Array.from({length: 90}, (_, i) => plannerDateAfter(original.date, i)) })
  assert.equal(capped.length, 2)
})


test('补足候选允许减少派遣释放体力，返回可行方案且不修改原偏好', async () => {
  const { exactDeadlineAlternatives } = await import('../src/data/exactPlannerComparison.js')
  const original = { ...input(), objective: 'coins', dates: input().dates.slice(0, 1), preferences: { luoyang: 4, shouchun: 4, purchaseCount: 0 }, initialState: { a: { shuijing: 360 } } }
  const scenario = exactDeadlineAlternatives(original).find(s => s.input.reduceDispatch)
  const result = solve(scenario.input)
  assert.equal(result.status, 'feasible')
  assert.equal(result.solution.requiredExtra, 0)
  assert.ok(result.solution.dispatchReductions.length > 0)
  assert.ok(result.solution.dispatchReductions.reduce((sum, item) => sum + item.stamina, 0) >= 320)
  assert.equal(result.solution.timeline[0].errors.length, 0)
  assert.equal(original.preferences.luoyang, 4)
})


test('补足日程采用前校验输入，采用后保留历史并固定每日派遣、体力与购买', async () => {
  const { exactDeadlineAlternatives } = await import('../src/data/exactPlannerComparison.js')
  const { applyDeadlineAlternative } = await import('../src/data/fixedPlannerSchedule.js')
  const original = { ...input(), objective: 'coins', dates: input().dates.slice(0, 2) }
  const scenario = exactDeadlineAlternatives(original)[0]
  const outcome = { ...solve(scenario.input), inputKey: JSON.stringify(scenario.input), comparisonInputKey: JSON.stringify(original), comparisonId: scenario.id }
  const applied = applyDeadlineAlternative(null, outcome, original)
  assert.equal(applied.schedule.result.status, 'complete')
  assert.equal(applied.schedule.result.planSource, 'deadline-alternative')
  assert.ok(Object.keys(applied.manualPlans).length > 0)
  assert.equal(applied.schedule.context.displayStartDate, original.date)
  const wire = scheduleBody({ ...applied, strategy: 'overall', agentOrder: ['a'] })
  const restored = scheduleFromRemote({ ...wire, account_id: 'a', revision: 1 }, 'a')
  assert.equal(restored.schedule.result.planSource, 'deadline-alternative')
  const edited = updateFixedSchedulePlan(applied.schedule, original.date, applied.schedule.result.timeline[0].planned)
  assert.equal(edited.result.planSource, undefined)
  assert.throws(() => applyDeadlineAlternative(null, { ...outcome, comparisonInputKey: 'old' }, original), /条件已变化/)
})

test('补足先利用可领取储备降低缺口，尚未到领取日的储备不能提前使用', () => {
  const original = { ...input(), objective: 'extra', feasibilityOnly: true, dates: input().dates.slice(0, 1) }
  const pack = { id: 'pack', name: '已有储备', amount: 1000, date: original.date, mode: 'flexible' }
  const without = solve(original)
  const available = solve({ ...original, reserveSources: [pack] })
  const future = solve({ ...original, reserveSources: [{ ...pack, date: '2026-09-16' }] })
  assert.equal(without.solution.requiredExtra, 732)
  assert.equal(available.solution.requiredExtra, 0)
  assert.equal(available.solution.totalReserveUsed, 1000)
  assert.equal(available.solution.reserveUsage[0].usedDate, original.date)
  assert.equal(future.solution.requiredExtra, without.solution.requiredExtra)
  assert.equal(future.solution.totalReserveUsed, 0)
})

test('每日补充最多1500：短期限无解，延长后在最小总量下均衡每日负担', () => {
  const original = { ...input(), initialState: { a: { __xp__: 1000000 } }, objective: 'extra', feasibilityOnly: true }
  assert.equal(solve({ ...original, dates: original.dates.slice(0, 1) }).status, 'infeasible')
  const longer = solve({ ...original, dates: original.dates.slice(0, 2) })
  assert.equal(longer.status, 'feasible')
  assert.equal(longer.solution.requiredExtra, 1464)
  const extras = longer.solution.timeline.map(day => day.planned.gains.find(g => g.id === 'required-extra')?.value || 0)
  assert.deepEqual(extras, [732, 732])
  assert.ok(longer.solution.timeline.every(day => day.errors.length === 0))
})

test('上限约束外部补充，已有储备整笔领取不受1500限制', () => {
  const original = { ...input(), initialState: { a: { __xp__: 1000000 } }, objective: 'extra', feasibilityOnly: true,
    dates: input().dates.slice(0, 1), reserveSources: [{ id: 'pack', name: '已有储备', amount: 2100, date: input().date, mode: 'flexible' }] }
  const result = solve(original)
  assert.equal(result.status, 'feasible')
  assert.equal(result.solution.requiredExtra, 0)
  assert.equal(result.solution.totalReserveUsed, 2100)
})

test('采用前独立校验拒绝超限或通过重复条目叠加的额外补充', async () => {
  const { exactDeadlineAlternatives } = await import('../src/data/exactPlannerComparison.js')
  const { applyDeadlineAlternative } = await import('../src/data/fixedPlannerSchedule.js')
  const original = { ...input(), objective: 'coins', dates: input().dates.slice(0, 1) }
  const scenario = exactDeadlineAlternatives(original)[0]
  const result = solve(scenario.input)
  for (const values of [[1501], [800, 800], [-1], [0.5]]) {
    const solution = clonePlannerValue(result.solution)
    const day = solution.timeline[0].planned
    day.gains = day.gains.filter(gain => gain.id !== 'required-extra')
    day.gains.push(...values.map(value => ({ id: 'required-extra', label: '需补充体力', kind: 'energy', custom: true, value })))
    assert.throws(() => applyDeadlineAlternative(null, { ...result, solution, inputKey: JSON.stringify(scenario.input), comparisonInputKey: JSON.stringify(original), comparisonId: scenario.id }, original), /未通过校验/)
  }
})

test('减少派遣候选先用储备：足够时保留全部派遣，不足时只减少必要次数', () => {
  const original = { ...input(), objective: 'extra', feasibilityOnly: true, reduceDispatch: true,
    dates: input().dates.slice(0, 1), preferences: { luoyang: 4, shouchun: 4, purchaseCount: 0 }, initialState: { a: { shuijing: 360 } } }
  const pack = amount => ({ id: 'pack', name: '已有储备', amount, date: original.date, mode: 'flexible' })
  const enough = solve({ ...original, reserveSources: [pack(320)] })
  assert.equal(enough.solution.requiredExtra, 0)
  assert.equal(enough.solution.totalReserveUsed, 320)
  assert.deepEqual(enough.solution.dispatchReductions, [])
  assert.equal(enough.solution.timeline[0].planned.spends.find(s => s.id === 'luoyang').value, 4)
  assert.equal(enough.solution.timeline[0].planned.spends.find(s => s.id === 'shouchun').value, 4)
  const partial = solve({ ...original, reserveSources: [pack(100)] })
  assert.equal(partial.solution.requiredExtra, 0)
  assert.equal(partial.solution.totalReserveUsed, 100)
  assert.equal(partial.solution.dispatchReductions.reduce((sum, change) => sum + change.count, 0), 3)
  assert.ok(partial.solution.timeline.every(day => day.errors.length === 0))
  const unavailable = solve({ ...original, reserveSources: [{ ...pack(320), date: '2026-09-16' }] })
  assert.equal(unavailable.solution.totalReserveUsed, 0)
  assert.equal(unavailable.solution.dispatchReductions.reduce((sum, change) => sum + change.count, 0), 4)
})

test('储备优先保留派遣仍遵守整笔领取和不能跨日拆分的规则', () => {
  const original = { ...input(), objective: 'extra', feasibilityOnly: true, reduceDispatch: true,
    dates: input().dates.slice(0, 2), preferences: { luoyang: 4, shouchun: 4, purchaseCount: 0 }, initialState: { a: { shuijing: 720 } } }
  const pack = (id, amount) => ({ id, name: id, amount, date: original.date, mode: 'flexible' })
  const separate = solve({ ...original, reserveSources: [pack('one', 320), pack('two', 320)] })
  assert.equal(separate.solution.requiredExtra, 0)
  assert.equal(separate.solution.totalReserveUsed, 640)
  assert.deepEqual(separate.solution.dispatchReductions, [])
  assert.equal(new Set(separate.solution.reserveUsage.map(source => source.usedDate)).size, 2)
  const whole = solve({ ...original, reserveSources: [pack('whole', 640)] })
  assert.equal(whole.solution.requiredExtra, 0)
  assert.equal(whole.solution.totalReserveUsed, 640)
  assert.equal(whole.solution.dispatchReductions.reduce((sum, change) => sum + change.count, 0), 4)
})


test('均衡每日补充时不能重新削减已由储备支持的派遣', () => {
  const original = { ...input(), objective: 'extra', feasibilityOnly: true, reduceDispatch: true,
    dates: input().dates.slice(0, 2), preferences: { luoyang: 4, shouchun: 4 }, initialState: { a: { shuijing: 720 } },
    firstDay: { gains: [createGain('natural'), createGain('meal')], spends: [createSpend('luoyang', { value: 4 }),
      createSpend('shouchun', { value: 4 }), createSpend('custom', { value: 1, costPer: 1500 })] },
    reserveSources: [{ id: 'pack', name: '次日储备', amount: 320, date: '2026-09-16', mode: 'flexible' }] }
  const result = solve(original)
  assert.equal(result.solution.requiredExtra, 1212)
  assert.equal(result.solution.totalReserveUsed, 320)
  assert.ok(result.solution.dispatchReductions.every(change => change.date === original.date))
  const secondDay = result.solution.timeline[1].planned
  assert.equal(secondDay.spends.find(spend => spend.id === 'luoyang').value, 4)
  assert.equal(secondDay.spends.find(spend => spend.id === 'shouchun').value, 4)
})
