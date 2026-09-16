import test from 'node:test'
import assert from 'node:assert/strict'
import { starCloudFeedback } from '../src/pages/star/starCloudStatus.js'

test('cloud status prioritizes saving over ready and settles only after pending writes clear', function () {
  assert.equal(starCloudFeedback({ ready: true, inventory: { saving: true, pending: { inventory: [] } }, workspace: {} }).message, '正在保存星石云端状态…')
  assert.equal(starCloudFeedback({ ready: true, inventory: {}, workspace: { pending: { planTargets: {} } } }).message, '正在等待保存星石云端状态…')
  assert.equal(starCloudFeedback({ ready: true, inventory: {}, workspace: {} }).message, '星石云端状态已保存')
})

test('cloud status gives a writer error priority over ready', function () {
  const feedback = starCloudFeedback({ ready: true, inventory: { saving: true, error: new Error('network down') }, workspace: {} })
  assert.equal(feedback.message, '')
  assert.equal(feedback.error, 'network down')
})
