import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { starCloudFeedback } from '../src/pages/star/starCloudStatus.js'

test('cloud status prioritizes saving over ready and settles only after pending writes clear', function () {
  assert.equal(starCloudFeedback({ ready: true, inventory: { saving: true, pending: { inventory: [] } }, workspace: {} }).message, '正在保存星石云端状态…')
  assert.equal(starCloudFeedback({ ready: true, inventory: {}, workspace: { pending: { planTargets: {} } } }).message, '正在等待保存星石云端状态…')
  assert.equal(starCloudFeedback({ ready: true, inventory: {}, workspace: {} }).message, '星石云端状态已保存')
})

test('cloud status gives a writer error priority over ready', function () {
  const feedback = starCloudFeedback({ ready: true, inventory: { saving: true, error: new Error('network down') }, workspace: {} })
  assert.equal(feedback.message, '')
  assert.equal(feedback.error, '星石云端保存失败，请重试。')
})

test('restored ordered hold is described as unfinished work without the retired sync-backpack wording', function () {
  const feedback = starCloudFeedback({ ready: true, hasOrderedHold: true, restoredHoldAwaitingRetry: true, inventory: {}, workspace: {} })
  assert.equal(feedback.message, '发现上次未完成的云端保存。')
  assert.equal(feedback.error, '')
  const source = readFileSync(new URL('../src/pages/star/starCloudStatus.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /同步背包/)
})

test('a fresh ordered hold is reported as ordinary pending work', function () {
  const feedback = starCloudFeedback({ ready: true, hasOrderedHold: true, needsRetry: true, recoveryRequired: false, inventory: {}, workspace: {} })
  assert.equal(feedback.message, '正在等待保存星石云端状态…')
  assert.equal(feedback.error, '')
})
