import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  getUnreadFeedbackNotificationRefs,
  listUnreadNotifications,
  markFeedbackNotificationsRead,
  normalizeNotification,
  normalizeNotificationList,
  normalizeUnreadNotificationCount
} from '../src/api/notifications.js'

function apiResponse(data) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    async json() { return { status_code: 200, message: 'ok', data } }
  }
}

async function withFetch(handler, fn) {
  const previous = globalThis.fetch
  globalThis.fetch = handler
  try { return await fn() } finally { globalThis.fetch = previous }
}

test('通知列表和通知对象统一归一化 snake_case/camelCase', () => {
  const notification = normalizeNotification({
    id: 'n-1', kind: 'FEEDBACK_REPLY', title: '回复', body: '内容',
    ref_type: 'FEEDBACK', ref_id: 'rpt-1', read_at: null, created_at: '2026-09-01T00:00:00Z'
  })
  assert.equal(notification.refType, 'FEEDBACK')
  assert.equal(notification.refId, 'rpt-1')
  assert.equal(notification.readAt, null)
  assert.equal(notification.createdAt, '2026-09-01T00:00:00Z')

  const page = normalizeNotificationList({
    notifications: [{ id: 'n-2', refType: 'FEEDBACK', refId: 'rpt-2', readAt: 'now', createdAt: 'then' }],
    total: '1', unread_count: '4', page_size: '20'
  })
  assert.equal(page.notifications[0].refId, 'rpt-2')
  assert.equal(page.total, 1)
  assert.equal(page.unreadCount, 4)
  assert.equal(page.pageSize, 20)
})

test('非法或负的未读数量归一化为零', () => {
  assert.deepEqual(normalizeUnreadNotificationCount({ unread_count: 'not-a-number' }), { count: 0 })
  assert.deepEqual(normalizeUnreadNotificationCount({ count: -2 }), { count: 0 })
  assert.deepEqual(normalizeUnreadNotificationCount({ unreadCount: 3.8 }), { count: 3 })
})

test('读取全部未读通知并跨页去重反馈引用', async () => {
  const urls = []
  await withFetch(async url => {
    urls.push(String(url))
    const page = new URL(String(url), 'http://localhost').searchParams.get('page')
    return page === '1'
      ? apiResponse({ notifications: [
          { id: 'n-a', ref_type: 'FEEDBACK', ref_id: 'rpt-a' },
          { id: 'n-b', ref_type: 'FEEDBACK', ref_id: 'rpt-b' }
        ], total: 3, unread_count: 3, page: 1, page_size: 2 })
      : apiResponse({ notifications: [
          { id: 'n-a-2', refType: 'FEEDBACK', refId: 'rpt-a' }
        ], total: 3, unreadCount: 3, page: 2, pageSize: 2 })
  }, async () => {
    const notifications = await listUnreadNotifications({ pageSize: 2 })
    assert.deepEqual(getUnreadFeedbackNotificationRefs(notifications), ['rpt-a', 'rpt-b'])
  })
  assert.equal(urls.length, 2)
  assert.match(urls[0], /unreadOnly=true/)
  assert.match(urls[1], /page=2/)
})

test('按反馈引用只标记对应的未读通知', async () => {
  const urls = []
  await withFetch(async (url) => {
    urls.push(String(url))
    return apiResponse({ id: 'marked', ref_type: 'FEEDBACK', ref_id: 'rpt-a', read_at: '2026-09-02T00:00:00Z' })
  }, async () => {
    await markFeedbackNotificationsRead('rpt-a', [
      { id: 'n-a-1', refType: 'FEEDBACK', refId: 'rpt-a' },
      { id: 'n-b', refType: 'FEEDBACK', refId: 'rpt-b' },
      { id: 'n-a-2', refType: 'FEEDBACK', refId: 'rpt-a' },
      { id: 'n-other', refType: 'SYSTEM', refId: 'rpt-a' }
    ])
  })
  assert.deepEqual(urls.map(url => url.split('/').at(-2)), ['n-a-1', 'n-a-2'])
})

test('反馈引用辅助函数忽略已读通知并去重重复通知 ID', async () => {
  assert.deepEqual(getUnreadFeedbackNotificationRefs([
    { id: 'n-read', ref_type: 'FEEDBACK', ref_id: 'rpt-a', read_at: 'now' },
    { id: 'n-unread', ref_type: 'FEEDBACK', ref_id: 'rpt-a' }
  ]), ['rpt-a'])

  const urls = []
  await withFetch(async url => {
    urls.push(String(url))
    return apiResponse({ id: 'n-marked', ref_type: 'FEEDBACK', ref_id: 'rpt-a', read_at: 'now' })
  }, async () => {
    await markFeedbackNotificationsRead('rpt-a', [
      { id: 'n-unread', ref_type: 'FEEDBACK', ref_id: 'rpt-a' },
      { id: 'n-unread', ref_type: 'FEEDBACK', ref_id: 'rpt-a' },
      { id: 'n-read', ref_type: 'FEEDBACK', ref_id: 'rpt-a', read_at: 'now' }
    ])
  })
  assert.equal(urls.length, 1)
})

test('通知页只消费规范字段，并保护接收权限用户不进入管理页', () => {
  const source = readFileSync(new URL('../src/pages/notifications/index.vue', import.meta.url), 'utf8')
  assert.match(source, /item\.readAt/)
  assert.match(source, /item\.refType/)
  assert.match(source, /item\.refId/)
  assert.match(source, /function isManagementNotification\(kind\)/)
  assert.match(source, /kind === 'FEEDBACK_ASSIGNED' \|\| kind === 'FEEDBACK_MESSAGE_FROM_REPORTER'/)
  assert.match(source, /function isMessageNotification\(kind\)/)
  assert.match(source, /kind === 'FEEDBACK_REPLY' \|\| kind === 'FEEDBACK_MESSAGE_FROM_REPORTER'/)
  assert.match(source, /target === '\/feedback\/manage' && !canManageFeedback\.value/)
  assert.doesNotMatch(source, /item\.(read_at|ref_type|ref_id|created_at)/)
})
