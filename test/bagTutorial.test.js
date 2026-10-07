import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bagGuidance, bagReviewInfo, bagHelpSections, createBagTutorialGate } from '../src/pages/star/bagTutorial.js'

test('first bag guidance is one anomaly check; advanced capabilities are on-demand help', () => {
  assert.equal(bagGuidance.id, 'review')
  assert.match(bagGuidance.body, /正常结果不用逐条确认/)
  assert.equal(bagHelpSections.length, 3)
  for (const phrase of ['名称汇总', '双击', '新增当前行', '复制', '删除当前行', '养成计划', '经验', 'Ctrl+Z', '近期 3 个存档']) assert.ok(bagHelpSections.some(section => section.body.includes(phrase)), phrase)
  assert.match(bagReviewInfo.sections.at(-1).body, /立即写回当前背包/)
})
test('first successful OCR waits for persisted evidence; old accounts remain quiet and stale handoffs are ignored', () => {
  const gate = createBagTutorialGate(), ready = { reviewing: true, ready: true, seen: false, hasEvidence: true }
  assert.equal(gate.loaded('new', false), true)
  assert.equal(gate.shouldStart('new', ready), false)
  gate.ocrCompleted('new')
  assert.equal(gate.loaded('new', true), true)
  assert.equal(gate.shouldStart('new', ready), true)
  for (const override of [{ reviewing: false }, { ready: false }, { seen: true }, { hasEvidence: false }]) assert.equal(gate.shouldStart('new', { ...ready, ...override }), false)
  assert.equal(gate.loaded('old', true), false)
  gate.ocrCompleted('old'); gate.ocrCompleted('new')
  assert.equal(gate.shouldStart('old', ready), false)
  assert.equal(gate.shouldStart('new', ready), false)
  gate.reset(); gate.ocrCompleted('new')
  assert.equal(gate.shouldStart('new', ready), false)
})
