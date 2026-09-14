import test from 'node:test'
import assert from 'node:assert/strict'
import { TRAINING_GROUPS, bookExperience, levelBookGapBundle, trainingRate, trainingSchedule, trainingMaterialEtas, growthTargetReached } from '../src/data/operatorTraining.js'
import { emptyTrainingWorkspace, readTrainingWorkspace, writeTrainingWorkspace, trainingPlanMemberIds, trainingWorkspaceKey } from '../src/data/operatorTrainingPlans.js'

test('历练表覆盖三类十二层奖励以及八档经验奖励', () => {
  assert.deepEqual(TRAINING_GROUPS.map(group => group.stages.length), [12, 12, 12, 8])
  assert.deepEqual(TRAINING_GROUPS[0].stages[3].rewards, { juanshan: 30, cuishan: 20 })
  assert.deepEqual(TRAINING_GROUPS[1].stages[11].rewards, { bawanglei: 60, mulanzhuilu: 45 })
  assert.deepEqual(TRAINING_GROUPS[2].stages[10].rewards, { shuijing: 55, xinghanjing: 40 })
  assert.equal(bookExperience(TRAINING_GROUPS[3].stages[7].rewards), 19000)
})

test('经验缺口与快捷提升使用相同整轮比例，已有三类兵书折算经验抵扣', () => {
  const stock = bookExperience({ liutaobingshu: 2, bingshuquanjuan: 3, bingshucanjuan: 4 })
  assert.equal(stock, 23400)
  assert.deepEqual(levelBookGapBundle(42401 - stock).map(book => [book.id, book.lack]), [['bingshuquanjuan', 18], ['bingshucanjuan', 200]])
  assert.deepEqual(levelBookGapBundle(0), [])
  assert.deepEqual(levelBookGapBundle(2501, 1).map(book => [book.id, book.lack]), [['bingshucanjuan', 50]])
})

test('同层双材料共用刷取次数，不能把每项分别按六次相加', () => {
  const together = trainingSchedule([{ id: 'xianmenshan', gap: 360 }, { id: 'beihuifengshan', gap: 270 }])
  assert.equal(together[0].runs, 6)
  assert.equal(together[0].days, 1)
  const separate = trainingSchedule([{ id: 'juanshan', gap: 180 }, { id: 'beihuifengshan', gap: 270 }])
  assert.equal(separate[0].runs, 12)
  assert.equal(separate[0].days, 2)
})

test('各属性历练分别享有每日六次额度，经验双掉落不重复计算', () => {
  const gaps = [{ id: 'beihuifengshan', gap: 270 }, { id: 'mulanzhuilu', gap: 270 }, { id: 'xinghanjing', gap: 270 }, ...levelBookGapBundle(114000).map(book => ({ id: book.id, gap: book.lack }))]
  const schedule = trainingSchedule(gaps)
  assert.equal(schedule.length, 4)
  assert.ok(schedule.every(group => group.runs === 6 && group.days === 1))
  assert.equal(trainingRate('juanshan'), 180)
  assert.equal(trainingRate('beihuifengshan'), 270)
  assert.equal(trainingRate('jianjia'), null)
})

test('单项 ETA 计入同类刷取排队，同层双掉落同日备齐', () => {
  const queued = trainingMaterialEtas([{ id: 'juanshan', gap: 180 }, { id: 'beihuifengshan', gap: 270 }])
  assert.deepEqual(queued, { juanshan: 1, beihuifengshan: 2 })
  const together = trainingMaterialEtas([{ id: 'xianmenshan', gap: 360 }, { id: 'beihuifengshan', gap: 270 }])
  assert.deepEqual(together, { xianmenshan: 1, beihuifengshan: 1 })
  assert.equal(trainingMaterialEtas([{ id: 'beihuifengshan', gap: 1 }], { fh: 10 }).beihuifengshan, null)
  assert.deepEqual(trainingMaterialEtas([{ id: 'jianjia', gap: 10 }]), {})
})

test('层数限制不虚构高阶掉落，刷取方案确实覆盖每项材料', () => {
  assert.equal(trainingRate('beihuifengshan', { fh: 10 }), 0)
  assert.equal(trainingSchedule([{ id: 'beihuifengshan', gap: 1 }], { fh: 10 })[0].days, null)
  for (let seed = 1; seed <= 20; seed += 1) {
    const group = TRAINING_GROUPS[0]
    const gaps = group.items.map((id, index) => ({ id, gap: seed * (index + 3) * 37 }))
    const plan = trainingSchedule(gaps)[0]
    for (const gap of gaps) {
      const acquired = plan.stages.reduce((sum, stage) => sum + (stage.rewards[gap.id] || 0) * stage.runs, 0)
      assert.ok(acquired >= gap.gap, gap.id)
    }
    assert.equal(plan.days, Math.ceil(plan.runs / 6))
  }
})

test('完成态依据实际养成目标，未拥有或仅备齐材料不算完成', () => {
  const target = { level: 80, elite: 13, starLevel: 30 }
  assert.equal(growthTargetReached({ level: 79, elite: 13, starLevel: 30 }, target), false)
  assert.equal(growthTargetReached({ level: 80, elite: 13, starLevel: 25 }, target), true)
  assert.equal(growthTargetReached({ level: 80, elite: 13, starLevel: 30 }, { ...target, starLevel: 31 }), false)
  assert.equal(growthTargetReached({}, { level: 0, elite: 0, starLevel: 0 }), false)
})

function memoryStorage() {
  const data = new Map()
  return { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value) }
}

test('默认清单跟随星标，移出只排除清单成员，自建清单独立', () => {
  const favorites = new Set(['a', 'b'])
  const workspace = emptyTrainingWorkspace('acc')
  const plan = workspace.plans[0]
  plan.excludedOperatorIds = ['a']
  plan.operatorIds = ['c']
  assert.deepEqual([...trainingPlanMemberIds(plan, favorites)], ['b', 'c'])
  assert.deepEqual([...favorites], ['a', 'b'])
  assert.deepEqual([...trainingPlanMemberIds({ source: 'custom', operatorIds: ['a'], excludedOperatorIds: [] }, favorites)], ['a'])
})

test('本地计划按子账号隔离并保留独立目标、修订和迁移版本', () => {
  const storage = memoryStorage()
  const workspace = emptyTrainingWorkspace('acc-a')
  workspace.plans.push({ id: 'plan-a', name: '主队', source: 'custom', operatorIds: ['a'], targets: { a: { level: 80, elite: 13, starLevel: 7 } } })
  workspace.activePlanId = 'plan-a'
  const saved = writeTrainingWorkspace(storage, workspace)
  assert.equal(saved.revision, 1)
  assert.equal(saved.version, 1)
  assert.deepEqual(readTrainingWorkspace(storage, 'acc-a').plans[1].targets.a, { level: 80, elite: 13, starLevel: 7 })
  assert.equal(readTrainingWorkspace(storage, 'acc-b').plans.length, 1)
  assert.throws(() => writeTrainingWorkspace(storage, workspace), /其他页面更新/)
  storage.setItem(trainingWorkspaceKey('acc-a'), JSON.stringify({ ...saved, version: 99 }))
  assert.throws(() => readTrainingWorkspace(storage, 'acc-a'), /版本/)
})
