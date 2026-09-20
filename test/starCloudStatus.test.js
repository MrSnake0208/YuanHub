import test from 'node:test'
import assert from 'node:assert/strict'
import { starCloudFeedback } from '../src/pages/star/starCloudStatus.js'

test('single StarState writer status distinguishes read save pending failure and ready', () => {
  assert.equal(starCloudFeedback({ loading: true }).message, '正在读取云端星石状态…')
  assert.equal(starCloudFeedback({ ready: true, writer: { saving: true } }).message, '正在保存星石云端状态…')
  assert.equal(starCloudFeedback({ ready: true, writer: { pending: {} } }).message, '正在等待保存星石云端状态…')
  assert.equal(starCloudFeedback({ ready: true, writer: { error: Error('network') } }).error, '星石云端保存失败，请重试。')
  assert.equal(starCloudFeedback({ ready: true, writer: {} }).message, '星石云端状态已保存')
})
