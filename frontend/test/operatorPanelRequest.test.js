import test from 'node:test'
import assert from 'node:assert/strict'
import { createOperatorPanelRequest, operatorPanelHint, operatorPanelPreviewBody } from '../src/utils/operatorPanelRequest.js'
import { starBreakthroughOptions, starBreakthroughPatch } from '../src/domain/starBreakthrough.js'

const tick = () => new Promise(resolve => setTimeout(resolve, 5))
test('账号或草稿变化立即清结果，迟到成功与失败均不能覆盖新输入', async () => {
  const pending = [], states = []
  const controller = createOperatorPanelRequest({ delay: 0,
    request: input => new Promise((resolve, reject) => pending.push({ input, resolve, reject })), publish: state => states.push(state) })
  controller.update({ key: 'account-a:old', input: 1 }); await tick()
  controller.update({ key: 'account-b:new', input: 2 }); await tick()
  assert.equal(states.at(-1).result, null)
  pending[1].resolve({ attack: 20 }); await tick()
  pending[0].resolve({ attack: 10 }); await tick()
  assert.deepEqual(states.at(-1).result, { attack: 20 })
  controller.update({ key: 'account-b:next', input: 3 }); await tick()
  controller.update(null)
  pending[2].reject(new Error('old failure')); await tick()
  assert.equal(states.at(-1).status, 'idle')
  controller.dispose()
})

test('连续编辑合并为一次请求，失败可重试，卸载后不发布', async () => {
  let calls = 0
  const states = []
  const controller = createOperatorPanelRequest({ delay: 0, request: async () => { if (++calls === 1) throw new Error('offline'); return { status: 'calculated' } }, publish: value => states.push(value) })
  controller.update({ key: '1', input: 1 }); controller.update({ key: '2', input: 2 }); await tick()
  assert.equal(calls, 1); assert.equal(states.at(-1).status, 'failed')
  controller.retry(); await tick(); assert.equal(states.at(-1).status, 'ready')
  controller.update({ key: '3', input: 3 }); controller.dispose(); const count = states.length
  await tick(); assert.equal(states.length, count); assert.equal(calls, 2)
})

test('预览只发送养成字段与实例引用，不发送客户端数值、规则或第三奇闻', () => {
  const body = operatorPanelPreviewBody('a', 'op', { level: 10, levelBreakthroughStage: null, elite: 1,
    huaji: { owned: true, stage: 19, awakened: false }, attack: 9999,
    oddities: { attack: { current: 1 }, hp: { current: 2 }, special: { current: 3 } } }, { main1: 'mine' })
  assert.deepEqual(body.oddities, { attack: 1, hp: 2 })
  assert.equal(body.attack, undefined); assert.equal(body.level_breakthrough_stage, null)
  assert.equal(body.loadout.main1, 'mine')
  assert.match(operatorPanelHint({ status: 'incomplete', missing_fields: ['loadout.main1.breakthrough_stage'] }), /星石配装或突破/)
  assert.deepEqual(operatorPanelPreviewBody('a', 'op', { huaji: { owned: false, stage: null, awakened: null } }).huaji,
    { owned: false, stage: 0, awakened: null })
})

test('星石突破补录保留 CAS 与其他库存事实，只改被选择的实例', () => {
  assert.deepEqual(starBreakthroughOptions({ quality: 'white', level: 30 }), [2])
  assert.deepEqual(starBreakthroughOptions({ quality: 'orange', level: 20 }), [1, 2])
  assert.deepEqual(starBreakthroughOptions({ quality: 'white', level: 31 }), [])
  const state = { generation: 4, revision: 9, inventory: [
    { instance_id: 'a', kind: 'main', name: 'test', quality: 'orange', level: 20, breakthrough_stage: 2 },
    { instance_id: 'b', kind: 'support', name: 'legacy', quality: 'white', level: 40, breakthrough_stage: null }
  ], plan_targets: { a: 30 }, experience: { orange: 12 }, bag: { capacity: 100 } }
  const original = structuredClone(state), result = starBreakthroughPatch(state, { a: null })
  assert.equal(result.expected_revision, 9); assert.equal(result.expected_generation, 4)
  assert.equal(result.inventory[0].breakthrough_stage, null)
  assert.equal(Object.hasOwn(result.inventory[1], 'breakthrough_stage'), false)
  assert.deepEqual(result.plan_targets, state.plan_targets); assert.deepEqual(result.bag, state.bag)
  assert.deepEqual(state, original)
})
