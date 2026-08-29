import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  appendFeedbackMessage,
  createFeedback,
  getFeedback,
  getFeedbackAccess,
  listManagedFeedback,
  listMyFeedback,
  listFeedback,
  listFeedbackAccessGrants,
  updateFeedbackAccessGrant,
  updateFeedbackStatus
} from '../src/api/feedback.js'
import { searchFeedbackAccessUsers } from '../src/api/user.js'

function apiResponse(data) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    async json() {
      return { status_code: 200, message: 'ok', data }
    }
  }
}

async function withFetch(handler, fn) {
  const previous = globalThis.fetch
  globalThis.fetch = handler
  try {
    return await fn()
  } finally {
    globalThis.fetch = previous
  }
}

test('创建反馈发送 type/category 字段', async () => {
  let request
  await withFetch(async (url, options) => {
    request = { url: String(url), options }
    return apiResponse({ id: 'rpt_1', type: 'BUG', category: 'INVENTORY', status: 'OPEN', content: '坏了' })
  }, async () => {
    const result = await createFeedback({
      type: 'BUG',
      category: 'INVENTORY',
      content: '坏了',
      mediaIds: ['med_1'],
      clientInfoConsent: true
    })
    assert.match(request.url, /\/v1\/reports$/)
    assert.deepEqual(JSON.parse(request.options.body), {
      type: 'BUG',
      category: 'INVENTORY',
      content: '坏了',
      media_ids: ['med_1'],
      client_info_consent: true
    })
    assert.equal(result.status, 'OPEN')
  })
})

test('创建反馈兼容旧的 type/category/area 请求', async () => {
  let request
  await withFetch(async (url, options) => {
    request = { url: String(url), options }
    return apiResponse({ id: 'rpt_legacy', type: 'BUG', category: 'INVENTORY', status: 'OPEN' })
  }, async () => {
    await createFeedback({ type: 'bug', category: 'BUG', area: 'INVENTORY', content: '坏了' })
  })
  assert.deepEqual(JSON.parse(request.options.body), {
    type: 'BUG',
    category: 'INVENTORY',
    content: '坏了',
    media_ids: [],
    client_info_consent: false
  })
})

test('列表和详情归一化后端 snake_case 与 ADMIN 消息', async () => {
  let call = 0
  await withFetch(async () => {
    call += 1
    if (call === 1) {
      return apiResponse({
        reports: [{
          id: 'rpt_1',
          type: 'BUG',
          category: 'OPERATOR',
          status: 'OPEN',
          content: '建议',
          has_admin_reply: true,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-02T00:00:00Z'
        }],
        total: 1,
        page: 1,
        page_size: 20
      })
    }
    return apiResponse({
      id: 'rpt_1',
      type: 'BUG',
      category: 'OPERATOR',
      has_admin_reply: true,
      status: 'OPEN',
      content: '建议',
      quota: { can_append: true, pending_count: 1, pending_limit: 3 },
      messages: [{
        id: 'rpm_1',
        sender_kind: 'ADMIN',
        content: '收到',
        created_at: '2026-01-03T00:00:00Z'
      }]
    })
  }, async () => {
    const list = await listFeedback({ page: 1, pageSize: 20 })
    assert.equal(list.items[0].hasAdminReply, true)
    assert.equal(list.items[0].category, 'OPERATOR')
    assert.equal(list.items[0].createdAt, '2026-01-01T00:00:00Z')
    assert.equal(list.pageSize, 20)
    const detail = await getFeedback('rpt_1')
    assert.equal(detail.type, 'BUG')
    assert.equal(detail.category, 'OPERATOR')
    assert.equal(detail.hasAdminReply, true)
    assert.equal(detail.quota.canAppend, true)
    assert.equal(detail.messages[0].senderKind, 'ADMIN')
    assert.equal(detail.messages[0].isAdmin, true)
    assert.equal(detail.messages[0].createdAt, '2026-01-03T00:00:00Z')
  })
})

test('列表类型、板块筛选和管理视图使用 type/category/mine 查询参数', async () => {
  let requestUrl = ''
  await withFetch(async (url) => {
    requestUrl = String(url)
    return apiResponse({ reports: [], total: 0, page: 1, page_size: 20 })
  }, async () => {
    await listFeedback({ page: 1, pageSize: 20, type: 'BUG', category: 'OPERATOR', mine: false })
  })
  assert.match(requestUrl, /type=BUG/)
  assert.match(requestUrl, /category=OPERATOR/)
  assert.match(requestUrl, /mine=false/)
})

test('个人和管理列表使用固定的 mine 语义', async () => {
  const requestUrls = []
  await withFetch(async (url) => {
    requestUrls.push(String(url))
    return apiResponse({ reports: [], total: 0, page: 1, page_size: 20 })
  }, async () => {
    await listMyFeedback({ mine: false })
    await listManagedFeedback({ mine: true })
  })
  assert.match(requestUrls[0], /mine=true/)
  assert.match(requestUrls[1], /mine=false/)
})

test('反馈授权候选搜索使用管理员接口并保留邮箱身份信息', async () => {
  let request
  await withFetch(async (url, options) => {
    request = { url: String(url), options }
    return apiResponse([{ id: 'user-1', user_name: 'alice', email: 'alice@example.com', activated: true }])
  }, async () => {
    const users = await searchFeedbackAccessUsers({ q: 'alice@example.com', page: 1, size: 10 })
    assert.deepEqual(users[0], {
      id: 'user-1',
      userName: 'alice',
      email: 'alice@example.com',
      activated: true
    })
  })
  assert.match(request.url, /\/v1\/admin\/feedback-access\/users\?/)
  assert.match(request.url, /q=alice%40example.com/)
  assert.doesNotMatch(request.url, /\/user\/search/)
  assert.equal(request.options.method, 'GET')
})

test('反馈授权候选搜索不会为全是空白的输入发送请求', async () => {
  let called = false
  await withFetch(async () => {
    called = true
    return apiResponse([])
  }, async () => {
    assert.deepEqual(await searchFeedbackAccessUsers({ q: '   ', page: 1, size: 10 }), [])
  })
  assert.equal(called, false)
})

test('反馈授权接口区分接收模块和管理模块', async () => {
  const requests = []
  await withFetch(async (url, options = {}) => {
    requests.push({ url: String(url), options })
    return apiResponse([])
  }, async () => {
    await getFeedbackAccess()
    await listFeedbackAccessGrants()
    await updateFeedbackAccessGrant('user/1', { receiveAreas: ['INVENTORY'], manageAreas: ['OPERATOR'] })
  })
  assert.match(requests[0].url, /\/v1\/reports\/access$/)
  assert.match(requests[1].url, /\/v1\/admin\/feedback-access$/)
  assert.match(requests[2].url, /\/v1\/admin\/feedback-access\/user%2F1$/)
  assert.deepEqual(JSON.parse(requests[2].options.body), {
    receive_categories: ['INVENTORY'],
    manage_categories: ['OPERATOR']
  })
})

test('追加消息和更新状态使用正确路径、字段和大写状态', async () => {
  const requests = []
  await withFetch(async (url, options) => {
    requests.push({ url: String(url), options })
    return apiResponse({ id: 'rpt_1', type: 'FEEDBACK', status: 'RESOLVED', content: 'ok' })
  }, async () => {
    await appendFeedbackMessage('rpt/1', { content: '补充', mediaIds: [] })
    await updateFeedbackStatus('rpt/1', 'resolved')
  })
  assert.match(requests[0].url, /\/v1\/reports\/rpt%2F1\/messages$/)
  assert.deepEqual(JSON.parse(requests[0].options.body), { content: '补充', media_ids: [] })
  assert.match(requests[1].url, /\/v1\/reports\/rpt%2F1\/status$/)
  assert.deepEqual(JSON.parse(requests[1].options.body), { status: 'RESOLVED' })
})
