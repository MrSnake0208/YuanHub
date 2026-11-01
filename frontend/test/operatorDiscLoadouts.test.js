import test from 'node:test'
import assert from 'node:assert/strict'
import {
  automaticDiscLoadoutName,
  createDiscLoadout,
  createDiscLoadoutState,
  discSelectionSignature,
  normalizeDiscNames,
  discLoadoutPayload,
  discTargetDifference,
  discTargetSummary,
  discTargetSummaryItems,
  matchesDiscStatus
} from '../src/utils/operatorDiscLoadouts.js'

test('命盘组合名称根据当前选择自动生成', function () {
  assert.equal(automaticDiscLoadoutName([]), '未配置命盘')
  assert.equal(automaticDiscLoadoutName(['山神丰恰', '洪胀', '寄生']), '山神丰恰 · 洪胀 · 寄生')
})

test('命盘组合去重并限制为三个选项', function () {
  assert.deepEqual(
    normalizeDiscNames(['山神丰恰', '洪胀', '山神丰恰', '寄生', '第四项']),
    ['山神丰恰', '洪胀', '寄生']
  )
})

test('手动名称不会被归一化为自动名称', function () {
  const loadout = createDiscLoadout(0, {
    name: '日常输出',
    nameMode: 'manual',
    discNames: ['山神丰恰', '洪胀']
  })
  assert.equal(loadout.name, '日常输出')
  assert.equal(loadout.nameMode, 'manual')
})

test('旧单命盘数据迁移到第一套并补齐第二套', function () {
  const state = createDiscLoadoutState([], [{ ot_name: '山神丰恰' }], 0)
  assert.equal(state.loadouts.length, 2)
  assert.deepEqual(state.loadouts[0].discNames, ['山神丰恰'])
  assert.deepEqual(state.loadouts[1].discNames, [])
  assert.equal(state.loadouts[0].name, '山神丰恰')
})

test('命盘签名忽略选择顺序，便于核对云端当前组合', function () {
  assert.equal(discSelectionSignature(['洪胀', '山神丰恰']), discSelectionSignature(['山神丰恰', '洪胀']))
})

test('双盘状态与目标往返独立，旧数据默认未标记，目标不参与自动命名', () => {
  const state = createDiscLoadoutState([
    { discs: [{ ot_name: 'A' }], status: 'reroll', target_discs: [{ ot_name: 'B' }] },
    { discNames: ['B'], status: 'perfect', targetDiscs: [{ otName: 'C' }] }
  ])
  assert.equal(state.loadouts[0].name, 'A')
  const payload = state.loadouts.map(discLoadoutPayload)
  assert.deepEqual(payload[0].discs, [{ ot_name: 'A' }])
  assert.deepEqual(payload[0].target_discs, [{ ot_name: 'B' }])
  const reread = createDiscLoadoutState(JSON.parse(JSON.stringify(payload)))
  assert.deepEqual(reread, state)
  assert.deepEqual(reread.loadouts[1].targetDiscNames, ['C'])
  reread.loadouts[0].status = 'unmarked'
  assert.deepEqual(reread.loadouts[0].targetDiscNames, ['B'])
  assert.equal(createDiscLoadout(0, { discNames: ['A'] }).status, 'unmarked')
})

test('差异按无序合法词条比较，去重且部分目标不报告替换数量', () => {
  assert.equal(discTargetDifference(['A', 'B', 'C'], ['C', 'A', 'B']).count, 0)
  assert.deepEqual(discTargetDifference(['A', 'B', 'C'], ['B', 'A', 'D']), {
    removed: ['C'], added: ['D'], complete: true, count: 1, targetCount: 3
  })
  assert.equal(discTargetDifference(['A', 'B', 'C'], ['A', 'A', 'D']).count, null)
  assert.equal(discTargetDifference(['A', 'B', 'C'], []).targetCount, 0)
})

test('紧凑摘要覆盖双待洗、混合状态、双完美与未完整目标', () => {
  const one = { discNames: ['A', 'B', 'C'], status: 'reroll', targetDiscNames: ['A', 'B', 'D'] }
  const two = { discNames: ['A', 'B', 'C'], status: 'reroll', targetDiscNames: ['A', 'D', 'E'] }
  assert.equal(discTargetSummary([one, two]), '一盘待洗·1处 │ 二盘待洗·2处')
  assert.equal(discTargetSummary([{ ...one, status: 'perfect' }, two]), '一盘完美 │ 二盘待洗·2处')
  assert.equal(discTargetSummary([{ status: 'perfect' }, { status: 'perfect' }]), '两盘完美')
  assert.equal(discTargetSummary([{ ...one, status: 'unmarked' }, { status: 'unmarked' }]), '')
  assert.equal(discTargetSummary([{}, { status: 'reroll' }]), '二盘待洗')
  assert.equal(discTargetSummary([{ ...one, targetDiscNames: ['A', 'B'] }]), '一盘待洗')
  assert.equal(discTargetSummary([{ status: 'perfect' }]), '一盘完美')
  assert.equal(discTargetSummary([{ ...one, targetDiscNames: ['A', 'B', 'C'] }]), '一盘待洗·目标已达成')
  assert.equal(discTargetSummary([{ ...one, discNames: ['A'] }]), '一盘待洗·差2项')
  assert.deepEqual(discTargetSummaryItems([{ status: 'perfect' }, two]), [
    { status: 'perfect', label: '一盘完美' },
    { status: 'reroll', label: '二盘待洗·2处' }
  ])
  assert.deepEqual(discTargetSummaryItems([{ status: 'perfect' }, { status: 'perfect' }]), [
    { status: 'perfect', label: '两盘完美' }
  ])
  assert.equal(matchesDiscStatus([{}, two], 'reroll'), true)
  assert.equal(matchesDiscStatus([{ status: 'perfect' }], 'reroll'), false)
})

test('命盘筛选按任意一套手动标记命中，旧数据和未标记不推断完美', () => {
  const mixed = [{ status: 'reroll' }, { status: 'perfect' }]
  assert.equal(matchesDiscStatus(mixed, 'perfect'), true)
  assert.equal(matchesDiscStatus(mixed, 'reroll'), true)
  assert.equal(matchesDiscStatus([{ status: 'perfect' }, { status: 'perfect' }], 'perfect'), true)
  for (const value of [undefined, [], [null], [{}], [{ status: 'unmarked' }], [{ discs: ['A', 'B', 'C'], target_discs: ['A', 'B', 'C'] }]]) {
    assert.equal(matchesDiscStatus(value, 'all'), true)
    assert.equal(matchesDiscStatus(value, 'perfect'), false)
    assert.equal(matchesDiscStatus(value, 'reroll'), false)
  }
})
