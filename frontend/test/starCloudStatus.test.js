import test from 'node:test'
import assert from 'node:assert/strict'
import { starCloudFeedback } from '../src/pages/star/starCloudStatus.js'

test('single StarState writer status distinguishes read save pending failure and ready', () => {
  assert.equal(starCloudFeedback({ loading: true }).message, '正在读取云端星石状态…')
  assert.equal(starCloudFeedback({ ready: true, writer: { saving: true } }).message, '正在保存星石云端状态…')
  assert.equal(starCloudFeedback({ ready: true, writer: { pending: {} } }).message, '正在等待保存星石云端状态…')
  assert.match(starCloudFeedback({ ready: true, writer: { error: Error('network') } }).error, /尚未确认同步.*重试核对/)
  assert.equal(starCloudFeedback({ ready: true, writer: {} }).message, '星石云端状态已保存')
})

test('read failure, uncertain command and CAS conflict never claim the wrong save result', () => {
  assert.match(starCloudFeedback({ ready: false, error: Error('offline') }).error, /无法读取.*本机数据没有被覆盖/)
  assert.match(starCloudFeedback({ ready: true, error: Error('uncertain') }).error, /结果仍待确认.*不要重复/)
  assert.match(starCloudFeedback({ ready: true, writer: { error: { status: 409 } } }).error, /数据已更新.*先导出/)
})
