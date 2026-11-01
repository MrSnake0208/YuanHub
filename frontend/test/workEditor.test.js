import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildWorkDocument,
  createEmptyWorkDocument,
  createWorkAction,
  hydrateWorkDocument,
  validateWorkDocument
} from '../src/utils/workEditor.js'

function validDocument() {
  const document = createEmptyWorkDocument()
  document.stage_name = '兰台 30'
  document.doc.title = '低练作业'
  document.operators[0] = '王粲'
  document.rounds = [
    { round: 2, remark: '', actions: [createWorkAction('wait'), createWorkAction('attack')] },
    { round: 9, remark: '稀疏回合', actions: [createWorkAction('restart')] }
  ]
  document.rounds[0].actions[1].slot = 5
  document.exec.extensions.maayuan.rec_target_offset = [0, -2, 3, 0]
  document.exec.extensions.yuanassist.enemy_turn_wait_ms = 8000
  return document
}

test('WorkDocument 请求体保留五槽、稀疏回合、动作顺序与目标扩展', function () {
  const initial = buildWorkDocument(createEmptyWorkDocument())
  assert.equal(initial.exec.extensions, undefined)

  const payload = buildWorkDocument(validDocument())
  assert.deepEqual(payload.operators, ['王粲', null, null, null, null])
  assert.deepEqual(payload.rounds.map(function (round) { return round.round }), [2, 9])
  assert.deepEqual(payload.rounds[0].actions.map(function (action) { return action.type }), ['wait', 'attack'])
  assert.equal(payload.rounds[0].actions[1].slot, 5)
  assert.deepEqual(payload.exec.extensions.maayuan.rec_target_offset, [0, -2, 3, 0])
  assert.equal(payload.exec.extensions.yuanassist.enemy_turn_wait_ms, 8000)
  assert.deepEqual(validateWorkDocument(payload), [])
})

test('WorkDocument 请求体支持 Vue reactive Proxy', function () {
  const source = createEmptyWorkDocument()
  source.stage_name = '测试关卡'
  source.doc.title = '代理对象'

  assert.equal(buildWorkDocument(new Proxy(source, {})).doc.title, '代理对象')
})

test('WorkDocument 前端校验报告精确 path 且不接受重复回合和非法动作', function () {
  const payload = buildWorkDocument(validDocument())
  payload.rounds[1].round = 2
  payload.rounds[0].actions[0].duration_ms = 0
  payload.rounds[1].actions[0] = { type: 'unknown' }
  const issues = validateWorkDocument(payload)
  assert.deepEqual(issues.map(function (issue) { return issue.path }), [
    '$.rounds[0].actions[0].duration_ms',
    '$.rounds[1].round',
    '$.rounds[1].actions[0].type'
  ])
})

test('API 回填兼容 snake_case 与 camelCase 并恢复可编辑结构', function () {
  const hydrated = hydrateWorkDocument({
    format: 'yuanhub-work', version: 1, game: '如鸢', levelId: 'lvl_1', stageName: '关卡',
    doc: { title: '标题', details: '' }, operators: [null, null, null, null, null],
    exec: { delaysMs: { attack: 7 }, extensions: { yuanassist: { enemyTurnWaitMs: 9 } } },
    rounds: [{ round: 1, actions: [{ type: 'wait', durationMs: 3 }] }]
  })
  assert.equal(hydrated.level_id, 'lvl_1')
  assert.equal(hydrated.stage_name, '关卡')
  assert.equal(hydrated.exec.delays_ms.attack, 7)
  assert.equal(hydrated.exec.extensions.yuanassist.enemy_turn_wait_ms, 9)
  assert.deepEqual(hydrated.rounds[0].actions[0], { type: 'wait', duration_ms: 3 })
})
