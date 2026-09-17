import test from 'node:test'
import assert from 'node:assert/strict'
import loadHighs from '../public/solver/highs-1.15.3/highs.mjs'
import { solveExactPlanner } from '../src/data/exactPlanner.js'
import { createExactPlannerRunner } from '../src/data/exactPlannerRunner.js'
import { clonePlannerValue, createGain, createSpend, normalizePlannerPlan, simulatePlanner } from '../src/data/cultivationPlanner.js'
import { applyExactPlannerResult, createFixedSchedule, pendingScheduleEdits, plannerDateAfter, updateFixedSchedulePlan } from '../src/data/fixedPlannerSchedule.js'
import { scheduleBody, scheduleFromRemote } from '../src/data/operatorPlannerRemote.js'

const highs = await loadHighs()
const dates = length => Array.from({ length }, (_, index) => plannerDateAfter('2026-09-15', index))
const inputFor = (resources, extra = {}) => ({ initialState: { a: resources }, dates: dates(10),
  objective: 'overall', strategy: 'overall', preferences: {}, levels: {}, ...extra })
const solve = input => solveExactPlanner(input, highs, { timeLimitMs: 5000 })
const canonical = value => clonePlannerValue(normalizePlannerPlan(value))

test('真实贪心反例由两天缩短为一天，并证明最优', () => {
  const input = inputFor({ tongjing: 70, liubojing: 115, liujinjing: 100, baoshijing: 30 })
  assert.equal(simulatePlanner(input).etaDays, 2)
  const result = solve(input)
  assert.equal(result.status, 'optimal')
  assert.equal(result.solution.etaDays, 1)
  assert.equal(result.solution.timeline[0].planned.spends.filter(s => s.kind === 'training').reduce((sum, s) => sum + s.value, 0), 6)
  assert.ok(result.solution.timeline.every(day => !day.errors.length))
})

test('全类别共同受每日体力预算约束，不能只算总次数或独立类别天数', () => {
  const result = solve(inputFor({ xianmenshan: 360, bawanglei: 360, shuijing: 360, __xp__: 114000 }))
  assert.equal(result.status, 'optimal')
  assert.equal(result.solution.etaDays, 2)
  assert.ok(result.solution.timeline.every(day => day.totals.balance >= 0 && !day.errors.length))
})

test('未来固定产出进入全局模型，闲置体力补经验但不改写手工日', () => {
  const fixed = canonical({ gains: [createGain('natural')], spends: [createSpend('custom', { costPer: 10, yield: { __xp__: 500000 } })] })
  const result = solve(inputFor({ __xp__: 500000 }, { manualPlans: { '2026-09-16': fixed } }))
  assert.equal(result.status, 'optimal')
  assert.equal(result.solution.etaDays, 2)
  assert.equal(result.solution.timeline[0].totals.balance, 8)
  assert.ok(result.solution.timeline[0].planned.spends.every(s => s.kind === 'stage624'))
  assert.deepEqual(clonePlannerValue(result.solution.timeline[1].planned), fixed)
})

test('未开放的获取途径可证明期限内无解；无效手工日期要求先修正', () => {
  assert.equal(solve(inputFor({ xinghanjing: 1 }, { levels: { yy: 10 }, dates: dates(3) })).status, 'infeasible')
  const plan = { gains: [createGain('natural', { value: 10 })], spends: [createSpend('yinyang', { value: 7 })] }
  assert.throws(() => solve(inputFor({ shuijing: 1 }, { manualPlans: { '2026-09-16': plan } })), /2026-09-16/)
})

test('优先模式按字典序优化完成日，交换清单顺序改变优先结果', () => {
  const common = inputFor({}, { objective: 'priority', initialState: { a: { shuijing: 60 }, b: { __xp__: 80000 } },
    firstDay: { gains: [createGain('custom', { value: 100 })], spends: [] }, dates: dates(4) })
  const a = solve({ ...common, agentOrder: ['a', 'b'] })
  const b = solve({ ...common, agentOrder: ['b', 'a'] })
  assert.equal(a.status, 'optimal'); assert.equal(b.status, 'optimal')
  assert.deepEqual(a.solution.agentDays, { a: 1, b: 2 })
  assert.deepEqual(b.solution.agentDays, { b: 1, a: 2 })
  assert.equal(a.provenAgents, 2)
})

test('整体完成不受清单展示顺序影响，优先模式不重复使用共享资源', () => {
  const input = inputFor({}, { initialState: { a: { shuijing: 200 }, b: { shuijing: 200 } } })
  const a = solve({ ...input, agentOrder: ['a', 'b'] })
  const b = solve({ ...input, agentOrder: ['b', 'a'] })
  assert.equal(a.solution.etaDays, 2); assert.equal(b.solution.etaDays, 2)
  const priority = solve({ ...input, objective: 'priority', agentOrder: ['b', 'a'] })
  assert.deepEqual(priority.solution.agentDays, { b: 1, a: 2 })
})

test('优先模式允许后位密探利用独立资源先完成，不把清单错误地串行化', () => {
  const result = solve(inputFor({}, { objective: 'priority', agentOrder: ['a', 'b'],
    initialState: { a: { shuijing: 1000, __xp__: 3800 }, b: { __xp__: 1000 } } }))
  assert.equal(result.status, 'optimal')
  assert.deepEqual(result.solution.agentDays, { a: 3, b: 1 })
})

test('目标期限允许每天购买次数不同，累计白金币达到精确最小值', () => {
  const result = solve(inputFor({ __xp__: 500000 }, { objective: 'coins', dates: dates(2) }))
  assert.equal(result.status, 'optimal')
  assert.equal(result.solution.totalCoins, 150)
  const purchases = result.solution.timeline.map(day => day.planned.gains.find(g => g.id === 'buy')?.value || 0).sort()
  assert.deepEqual(purchases, [1, 2])
})

test('高派遣开销与首日额外体力时，不为完成后的日期购买无用体力', () => {
  const result = solve(inputFor({ __xp__: 3800 }, { objective: 'coins', dates: dates(3),
    preferences: { luoyang: 4, shouchun: 4 }, initialExtra: 250 }))
  assert.equal(result.status, 'optimal'); assert.equal(result.solution.etaDays, 1)
  assert.equal(result.solution.totalCoins, 0)
})

test('常规优化保留首日获取和固定支出，不擅自购买体力', () => {
  const firstDay = canonical({ gains: [createGain('custom', { value: 180 }), createGain('buy', { value: 1 })],
    spends: [createSpend('luoyang'), createSpend('custom', { costPer: 10, yield: { __xp__: 1000 } }), createSpend('stage624', { value: 1 })] })
  const result = solve(inputFor({ __xp__: 200000 }, { firstDay }))
  const day = result.solution.timeline[0]
  assert.deepEqual(clonePlannerValue(day.planned.gains), firstDay.gains)
  for (const fixed of firstDay.spends.slice(0, 2)) assert.ok(day.planned.spends.some(s => s.id === fixed.id && s.value === fixed.value))
  assert.ok(result.solution.timeline.slice(1).every(d => !d.planned.gains.some(g => g.id === 'buy')))
})

test('真实求解器与小规模穷举对照，校验全局最短天数', () => {
  for (const [copper, silver] of [[1, 0], [0, 1], [70, 115], [180, 120], [181, 121], [100, 200], [250, 350], [360, 480]]) {
    let optimum = null
    for (let days = 1; days <= 5 && optimum == null; days++) {
      for (let level4 = 0; level4 <= 6 * days; level4++) {
        for (let level6 = 0; level6 + level4 <= 6 * days; level6++) {
          if (30 * level4 >= copper && 20 * level4 + 40 * level6 >= silver) optimum = days
        }
      }
    }
    const result = solve(inputFor({ tongjing: copper, liubojing: silver }, { dates: dates(5) }))
    assert.equal(result.status, 'optimal')
    assert.equal(result.solution.etaDays, optimum, `${copper}/${silver}`)
  }
})

test('超时保留已验证可行解，不能将未知状态当作不可行或全局最优', () => {
  const timedOut = { solve: () => ({ Status: 'Time limit reached', Columns: {} }) }
  const counterexample = inputFor({ tongjing: 70, liubojing: 115, liujinjing: 100, baoshijing: 30 })
  const feasible = solveExactPlanner(counterexample, timedOut)
  assert.equal(feasible.status, 'feasible'); assert.equal(feasible.solution.etaDays, 2)
  assert.equal(solveExactPlanner(inputFor({ no_source: 1 }), timedOut).status, 'unknown')
  const fractional = { solve: (lp, options) => {
    const result = highs.solve(lp, options)
    const key = Object.keys(result.Columns).find(key => key.startsWith('x'))
    result.Columns[key].Primal = .5
    return result
  } }
  assert.throws(() => solveExactPlanner(counterexample, fractional), /未通过日程校验/)
})

test('采用精确方案保留此前日期与未来手工日，云端重载保留证明，编辑后清除证明', () => {
  const context = { date: '2026-09-15', initialState: { a: { __xp__: 2000000 } }, requiredState: { a: { __xp__: 2000000 } },
    stock: {}, goals: { a: [80, 13, 7] }, preferences: {}, levels: {}, strategy: 'overall', agentOrder: ['a'] }
  const future = canonical({ gains: [createGain('natural')], spends: [createSpend('stage624', { value: 1 })] })
  const manualPlans = { '2026-09-18': future }
  const schedule = createFixedSchedule(context, manualPlans)
  const first = schedule.result.timeline[1]
  const input = { ...context, objective: 'overall', initialState: first.start, firstDay: first.planned, manualPlans, dates: dates(12).slice(1) }
  const result = solve(input)
  assert.equal(result.status, 'optimal')
  const adopted = applyExactPlannerResult(schedule, first.date, result, input, manualPlans)
  assert.deepEqual(adopted.schedule.result.timeline[0], schedule.result.timeline[0])
  assert.deepEqual(adopted.manualPlans['2026-09-18'], future)
  assert.equal(adopted.schedule.result.optimization.status, 'optimal')
  const wire = scheduleBody({ ...adopted, strategy: 'overall', agentOrder: ['a'], preferences: {} })
  const restored = scheduleFromRemote({ ...wire, account_id: 'a', revision: 1 }, 'a')
  assert.deepEqual(restored.schedule.result.optimization, adopted.schedule.result.optimization)
  const changed = clonePlannerValue(adopted.schedule.result.timeline[1].planned)
  changed.gains[0].value++
  const edited = updateFixedSchedulePlan(adopted.schedule, first.date, changed)
  assert.equal(edited.result.optimization, undefined)
  assert.equal(pendingScheduleEdits(edited, first.date), true)
  assert.throws(() => applyExactPlannerResult(schedule, first.date, { ...result, inputKey: 'stale' }, input, manualPlans), /条件已变化/)
})

test('取消、输入切换与终止后的迟到 Worker 消息不会覆盖当前结果', () => {
  const workers = [], received = []
  const runner = createExactPlannerRunner(() => {
    const worker = { postMessage() {}, terminate() { this.terminated = true } }
    workers.push(worker); return worker
  }, data => received.push(data))
  runner.run({}, 'local', 1000)
  runner.cancel()
  workers[0].onmessage({ data: { type: 'result', result: 'stale' } })
  assert.equal(received.length, 0); assert.equal(workers[0].terminated, true)
  runner.run({}, 'local', 1000)
  workers[1].onmessage({ data: { type: 'result', result: 'current' } })
  workers[1].onmessage({ data: { type: 'error', message: 'late' } })
  assert.deepEqual(received, [{ type: 'result', result: 'current' }])
  assert.equal(workers[1].terminated, true)
  runner.cancel()
})


test('最优方案在推荐日将剩余体力补到 6-24，保留手工日和完成后空档', () => {
  const fixed = canonical({ gains: [createGain('natural')], spends: [] })
  const result = solve(inputFor({ shuijing: 1000 }, { manualPlans: { '2026-09-19': fixed } }))
  assert.equal(result.status, 'optimal')
  assert.equal(result.solution.etaDays, 3)
  for (const day of result.solution.timeline.slice(0, 3)) {
    assert.ok(day.totals.balance >= 0 && day.totals.balance < 10)
    assert.ok(day.planned.spends.some(s => s.kind === 'stage624' && s.value > 0))
    assert.equal(day.totals.coinsSpent, 0)
    assert.equal(day.errors.length, 0)
  }
  assert.equal(result.solution.timeline[3].planned.spends.length, 0)
  assert.deepEqual(clonePlannerValue(result.solution.timeline[4].planned), fixed)
  const empty = solve(inputFor({}))
  assert.equal(empty.solution.etaDays, 0)
  assert.equal(empty.solution.timeline[0].planned.spends.length, 0)
})
