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

function report(id, messageId, createdAt, senderKind = 'REPORTER', messageIndex = null) {
  return {
    id,
    last_message_id: messageId,
    last_message_created_at: createdAt,
    last_message_sender: senderKind,
    last_reporter_message_id: senderKind === 'REPORTER' ? messageId : 'rpm_reporter_1',
    last_reporter_message_created_at: senderKind === 'REPORTER' ? createdAt : '2026-09-01T10:00:00Z',
    last_reporter_message_index: senderKind === 'REPORTER' ? messageIndex : 0
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

test('列表只使用 reporter boundary，管理员更新时间不会制造未读', () => {
  const read = report('rpt_boundary', 'rpm_1', '2026-09-01T10:00:00Z', 'REPORTER', 1)
  markFeedbackRead('admin-a', read.id, detailedReport(read.id, [
    { id: 'rpm_1', sender_kind: 'REPORTER', created_at: '2026-09-01T10:00:00Z' },
    { id: 'rpm_admin', sender_kind: 'ADMIN', created_at: '2026-09-02T10:00:00Z' }
  ]))

  const adminUpdated = {
    ...read,
    last_message_id: 'rpm_admin',
    last_message_created_at: '2026-09-02T10:00:00Z',
    last_message_sender: 'ADMIN'
  }
  assert.equal(hasUnreadFeedback(adminUpdated, 'admin-a'), false)
})

test('消息索引优先于时间，无法排序的不同 ID 不会制造未读', () => {
  const read = report('rpt_order', 'rpm_1', '2026-09-01T10:00:00Z', 'REPORTER', 4)
  markFeedbackRead('admin-a', read.id, {
    id: 'rpm_1',
    sender_kind: 'REPORTER',
    created_at: '2026-09-01T10:00:00Z',
    message_index: 4
  })

  assert.equal(hasUnreadFeedback({ ...read, last_reporter_message_id: 'rpm_2', last_reporter_message_created_at: '2026-09-01T09:00:00Z', last_reporter_message_index: 5 }, 'admin-a'), true)
  assert.equal(hasUnreadFeedback({ ...read, last_reporter_message_id: 'rpm_old', last_reporter_message_created_at: '2026-09-02T10:00:00Z', last_reporter_message_index: 3 }, 'admin-a'), false)
  assert.equal(hasUnreadFeedback({ id: read.id, last_reporter_message_id: 'rpm_unknown' }, 'admin-a'), false)
})

test('相同索引的不同消息不回退时间排序，非法索引安全降级', () => {
  const read = report('rpt_same_index', 'rpm_1', '2026-09-01T10:00:00Z', 'REPORTER', 4)
  markFeedbackRead('admin-a', read.id, {
    id: 'rpm_1', sender_kind: 'REPORTER', created_at: '2026-09-01T10:00:00Z', message_index: 4
  })

  assert.equal(hasUnreadFeedback({
    ...read,
    last_reporter_message_id: 'rpm_2',
    last_reporter_message_created_at: '2026-09-02T10:00:00Z',
    last_reporter_message_index: 4
  }, 'admin-a'), false)
  assert.equal(hasUnreadFeedback({
    ...read,
    last_reporter_message_id: 'rpm_negative',
    last_reporter_message_created_at: '2026-09-01T10:00:00Z',
    last_reporter_message_index: -1
  }, 'admin-a'), false)
})

test('详情末条消息边界无效时不回退 reporter 边界', () => {
  const detail = {
    id: 'rpt_invalid_detail',
    messages: [
      { id: 'rpm_reporter', sender_kind: 'REPORTER', created_at: '2026-09-01T10:00:00Z' },
      null
    ]
  }
  assert.equal(markFeedbackRead('admin-a', detail.id, detail), false)
  assert.equal(getFeedbackReadCursor('admin-a', detail.id), null)
})

test('阅读游标只单调向前推进', () => {
  const reportId = 'rpt_monotonic'
  assert.equal(markFeedbackRead('admin-a', reportId, { id: 'rpm_2', sender_kind: 'REPORTER', messageIndex: 2 }), true)
  assert.equal(markFeedbackRead('admin-a', reportId, { id: 'rpm_1', sender_kind: 'REPORTER', messageIndex: 1 }), true)
  assert.equal(getFeedbackReadCursor('admin-a', reportId).messageId, 'rpm_2')
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

test('缺少 reporter boundary 时不会使用 updated_at 猜测未读', () => {
  const item = {
    id: 'rpt_updated_at',
    last_message_sender: 'REPORTER',
    updated_at: '2026-09-01T10:00:00Z'
  }
  assert.equal(hasUnreadFeedback(item, 'admin-a'), false)
})

test('列表归一化同时支持 reporter boundary 的 snake_case 和 camelCase', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    async json() {
      return {
        status_code: 200,
        data: {
          reports: [{
            id: 'rpt_contract',
            last_reporter_message_id: 'rpm_snake',
            last_reporter_message_created_at: '2026-09-01T10:00:00Z',
            last_reporter_message_index: 3
          }, {
            id: 'rpt_camel',
            lastReporterMessageId: 'rpm_camel',
            lastReporterMessageCreatedAt: '2026-09-01T11:00:00Z',
            lastReporterMessageIndex: 4
          }]
        }
      }
    }
  })
  try {
    const result = await listManagedFeedback()
    assert.deepEqual(result.items.map(item => [item.lastReporterMessageId, item.lastReporterMessageIndex]), [
      ['rpm_snake', 3],
      ['rpm_camel', 4]
    ])
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('反馈未读状态已接入导航角标和管理详情', () => {
  const sidebar = readFileSync(new URL('../src/components/IslandSidebar.vue', import.meta.url), 'utf8')
  const feedbackNav = readFileSync(new URL('../src/components/feedback/FeedbackWorkspaceNav.vue', import.meta.url), 'utf8')
  const feedbackUnreadStore = readFileSync(new URL('../src/store/feedbackUnread.js', import.meta.url), 'utf8')
  const feedbackPage = readFileSync(new URL('../src/pages/feedback/index.vue', import.meta.url), 'utf8')
  const managePage = readFileSync(new URL('../src/pages/feedback/manage.vue', import.meta.url), 'utf8')
  const accessPage = readFileSync(new URL('../src/pages/feedback/admin.vue', import.meta.url), 'utf8')

  assert.match(feedbackUnreadStore, /listManagedFeedback/)
  assert.match(feedbackUnreadStore, /countUnreadFeedback/)
  assert.match(feedbackUnreadStore, /subscribeFeedbackUnread/)
  assert.match(feedbackUnreadStore, /feedbackUnreadContext/)
  assert.doesNotMatch(sidebar, /listManagedFeedback/)
  assert.match(sidebar, /feedbackUnreadState\.count/)
  assert.match(sidebar, /subscribeFeedbackUnread\(\)/)
  assert.doesNotMatch(managePage, /const unreadFeedbackIds = computed\(\(\) => feedbacks\.value/)
  assert.match(managePage, /feedbackUnreadState\.ids/)
  assert.match(sidebar, /setInterval\(function \(\) \{[\s\S]*fetchUnreadCount\(\)/)
  assert.match(feedbackNav, /hasUnreadFeedback: \{ type: Boolean, default: false \}/)
  assert.match(feedbackNav, /<router-link v-if="canManage"[\s\S]*<span v-if="hasUnreadFeedback" class="feedback-workspace-nav-unread" role="img" aria-label="有未读反馈"><\/span>/)
  assert.match(feedbackPage, /:has-unread-feedback="canManageFeedback && feedbackUnreadState\.count > 0"/)
  assert.match(managePage, /:has-unread-feedback="hasManagePermission && feedbackUnreadState\.count > 0"/)
  assert.match(managePage, /:can-manage="hasManagePermission"/)
  assert.match(accessPage, /<FeedbackWorkspaceNav[\s\S]*active="admin"/)
  assert.match(accessPage, /:has-unread-feedback="canManageFeedback && feedbackUnreadState\.count > 0"/)
  assert.match(managePage, /markFeedbackRead\(currentUserId\(\), detail\.id \|\| id, detail\)/)
  assert.match(managePage, /sortBy: 'updatedAt'/)
  assert.match(managePage, /sortOrder: 'desc'/)
  assert.match(managePage, /setInterval\([\s\S]*loadFeedback\(\{ background: true \}\)/)
  assert.match(managePage, /:selected-item="selectedDetail"/)
  assert.match(managePage, /:unread-feedback-ids="unreadFeedbackIds"/)
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
