import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  clearFeedbackReadState,
  countUnreadFeedback,
  getFeedbackReadCursor,
  hasUnreadFeedback,
  markFeedbackRead
} from '../src/utils/feedbackReadState.js'
import { listManagedFeedback } from '../src/api/feedback.js'

let previousStorage
let storageData

function installStorage({ getItem, setItem, removeItem } = {}) {
  storageData = new Map()
  globalThis.localStorage = {
    getItem: getItem || (key => storageData.get(key) || null),
    setItem: setItem || ((key, value) => storageData.set(key, value)),
    removeItem: removeItem || (key => storageData.delete(key))
  }
}

function report(id, messageId, createdAt, senderKind = 'REPORTER') {
  return {
    id,
    last_message_id: messageId,
    last_message_created_at: createdAt,
    last_message_sender: senderKind
  }
}

function detailedReport(id, messages) {
  return { id, messages }
}

beforeEach(() => {
  previousStorage = globalThis.localStorage
  installStorage()
})

afterEach(() => {
  if (previousStorage === undefined) delete globalThis.localStorage
  else globalThis.localStorage = previousStorage
})

test('首次发现用户消息计为未读，打开详情记录游标后清零', () => {
  const first = report('rpt_first', 'rpm_1', '2026-09-01T10:00:00Z')
  assert.equal(hasUnreadFeedback(first, 'admin-a'), true)

  assert.equal(markFeedbackRead('admin-a', first.id, first), true)
  assert.equal(hasUnreadFeedback(first, 'admin-a'), false)
  assert.deepEqual(getFeedbackReadCursor('admin-a', first.id), {
    messageId: 'rpm_1',
    messageCreatedAt: '2026-09-01T10:00:00Z',
    messageIndex: null
  })
})

test('用户追加消息重新计为未读，管理员回复不会单独制造未读', () => {
  const first = report('rpt_append', 'rpm_1', '2026-09-01T10:00:00Z')
  markFeedbackRead('admin-a', first.id, first)

  const appended = report('rpt_append', 'rpm_2', '2026-09-01T11:00:00Z')
  assert.equal(hasUnreadFeedback(appended, 'admin-a'), true)

  const adminReply = report('rpt_append', 'rpm_3', '2026-09-01T12:00:00Z', 'ADMIN')
  assert.equal(hasUnreadFeedback(adminReply, 'admin-a'), false)
})

test('同一工单多条用户消息只计一个工单', () => {
  const item = detailedReport('rpt_many', [
    { id: 'rpm_1', sender_kind: 'REPORTER', created_at: '2026-09-01T10:00:00Z' },
    { id: 'rpm_2', sender_kind: 'REPORTER', created_at: '2026-09-01T11:00:00Z' },
    { id: 'rpm_3', sender_kind: 'REPORTER', created_at: '2026-09-01T12:00:00Z' }
  ])
  assert.equal(countUnreadFeedback([item], 'admin-a'), 1)
  assert.equal(countUnreadFeedback([item, item], 'admin-a'), 1)
})

test('详情中管理员回复之后仍能识别游标之后的用户追加', () => {
  const first = detailedReport('rpt_after_reply', [
    { id: 'rpm_1', sender_kind: 'REPORTER', created_at: '2026-09-01T10:00:00Z' }
  ])
  markFeedbackRead('admin-a', first.id, first)
  const next = detailedReport('rpt_after_reply', [
    ...first.messages,
    { id: 'rpm_2', sender_kind: 'REPORTER', created_at: '2026-09-01T11:00:00Z' },
    { id: 'rpm_3', sender_kind: 'ADMIN', created_at: '2026-09-01T12:00:00Z' }
  ])
  assert.equal(hasUnreadFeedback(next, 'admin-a'), true)
})

test('管理员和普通用户的已读游标彼此隔离', () => {
  const item = report('rpt_isolated', 'rpm_1', '2026-09-01T10:00:00Z')
  markFeedbackRead('admin-a', item.id, item)
  assert.equal(hasUnreadFeedback(item, 'admin-a'), false)
  assert.equal(hasUnreadFeedback(item, 'admin-b'), true)
  assert.equal(hasUnreadFeedback(item, 'user-a'), true)

  clearFeedbackReadState('admin-a')
  assert.equal(hasUnreadFeedback(item, 'admin-a'), true)
  assert.equal(hasUnreadFeedback(item, 'admin-b'), true)
})

test('管理员账号可统计其他用户提交的未读工单', () => {
  const item = {
    ...report('rpt_cross_account', 'rpm_1', '2026-09-01T10:00:00Z'),
    reporter_user_id: 'user-a'
  }

  assert.equal(countUnreadFeedback([item], 'admin-b'), 1)
})

test('localStorage 读写异常时回退到内存状态', () => {
  installStorage({
    getItem() { throw new Error('storage unavailable') },
    setItem() { throw new Error('storage unavailable') },
    removeItem() { throw new Error('storage unavailable') }
  })
  const item = report('rpt_memory', 'rpm_1', '2026-09-01T10:00:00Z')

  assert.equal(markFeedbackRead('admin-a', item.id, item), false)
  assert.equal(hasUnreadFeedback(item, 'admin-a'), false)
  const next = report('rpt_memory', 'rpm_2', '2026-09-01T11:00:00Z')
  assert.equal(hasUnreadFeedback(next, 'admin-a'), true)
  assert.equal(clearFeedbackReadState('admin-a'), false)
  assert.equal(hasUnreadFeedback(item, 'admin-a'), true)
})

test('管理摘要归一化消息边界字段且不强制 OPEN 筛选', async () => {
  const previousFetch = globalThis.fetch
  let requestUrl = ''
  globalThis.fetch = async url => {
    requestUrl = String(url)
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      async json() {
        return {
          status_code: 200,
          message: 'ok',
          data: {
            reports: [report('rpt_api', 'rpm_9', '2026-09-01T10:00:00Z')],
            total: 1,
            page: 1,
            page_size: 100
          }
        }
      }
    }
  }
  try {
    const result = await listManagedFeedback({ page: 1, pageSize: 100 })
    assert.equal(result.items[0].lastMessageId, 'rpm_9')
    assert.equal(result.items[0].lastMessageCreatedAt, '2026-09-01T10:00:00Z')
    assert.equal(result.items[0].lastMessageSender, 'REPORTER')
    assert.doesNotMatch(requestUrl, /status=OPEN/)
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('原始 snake_case 摘要可使用 updated_at 作为消息时间边界', () => {
  const item = {
    id: 'rpt_updated_at',
    last_message_sender: 'REPORTER',
    updated_at: '2026-09-01T10:00:00Z'
  }
  assert.equal(hasUnreadFeedback(item, 'admin-a'), true)
})

test('反馈未读状态已接入导航角标和管理详情', () => {
  const sidebar = readFileSync(new URL('../src/components/IslandSidebar.vue', import.meta.url), 'utf8')
  const managePage = readFileSync(new URL('../src/pages/feedback/manage.vue', import.meta.url), 'utf8')

  assert.match(sidebar, /listManagedFeedback/)
  assert.match(sidebar, /countUnreadFeedback/)
  assert.equal((sidebar.match(/feedbackUnreadCount > 0/g) || []).length, 2)
  assert.match(sidebar, /setInterval\(function \(\) \{[\s\S]*fetchFeedbackUnreadCount\(\)/)
  assert.match(managePage, /markFeedbackRead\(currentUserId\(\), detail\.id \|\| id, detail\)/)
  assert.match(managePage, /:unread-feedback-ids="unreadFeedbackIds"/)
  assert.match(managePage, /hasUnreadFeedback\(item, currentUserId\(\)\)/)
})

test('用户反馈按通知 refId 显示逐工单未读标识并只清理当前工单', () => {
  const feedbackPage = readFileSync(new URL('../src/pages/feedback/index.vue', import.meta.url), 'utf8')
  const workspace = readFileSync(new URL('../src/components/feedback/FeedbackTicketWorkspace.vue', import.meta.url), 'utf8')

  assert.match(feedbackPage, /listUnreadNotifications/)
  assert.match(feedbackPage, /getUnreadFeedbackNotificationRefs/)
  assert.match(feedbackPage, /markFeedbackNotificationsRead\(reportId\)/)
  assert.match(feedbackPage, /unreadFeedbackIds\.value = unreadFeedbackIds\.value\.filter\(value => value !== reportId\)/)
  assert.match(feedbackPage, /:unread-feedback-ids="unreadFeedbackIds"/)
  assert.match(workspace, /unreadFeedbackIds: \{ type: Array/)
  assert.match(workspace, /isUnread\(item\)/)
  assert.match(workspace, /有新更新/)
})
