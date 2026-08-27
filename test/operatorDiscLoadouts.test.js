import test from 'node:test'
import assert from 'node:assert/strict'
import {
  automaticDiscLoadoutName,
  createDiscLoadout,
  createDiscLoadoutState,
  discSelectionSignature,
  normalizeDiscNames
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
