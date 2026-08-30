import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  appendFeedbackMessage,
  createFeedback,
  deleteFeedbackAccessGrant,
  downloadFeedbackAttachment,
  getFeedback,
  getFeedbackAccess,
  listManagedFeedback,
  listMyFeedback,
  listFeedback,
  listFeedbackAccessGrants,
  updateFeedbackAccessGrant,
  updateFeedbackStatus
} from '../src/api/feedback.js'
import { uploadMedia } from '../src/api/media.js'
import { auth } from '../src/store/auth.js'
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
          last_message_sender: 'ADMIN',
          reporter_user_id: 'usr_1',
          reporter_name: '阿蝉',
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
      reporter: { id: 'usr_1', user_name: '阿蝉' },
      handler: { id: 'usr_2', user_name: '管理员' },
      viewer_is_reporter: true,
      viewer_can_manage: false,
      quota: { can_append: true, pending_count: 1, pending_limit: 3 },
      messages: [{
        id: 'rpm_1',
        sender_kind: 'ADMIN',
        author: { id: 'usr_2', user_name: '管理员' },
        content: '收到',
        images: [{ id: 'med_1', url: '/media/1.webp' }],
        files: [{ id: 'med_log', name: 'error.log', mime: 'text/plain', size: 2048, download_url: '/v1/reports/rpt_1/attachments/med_log' }],
        created_at: '2026-01-03T00:00:00Z'
      }]
    })
  }, async () => {
    const list = await listFeedback({ page: 1, pageSize: 20 })
    assert.equal(list.items[0].hasAdminReply, true)
    assert.equal(list.items[0].category, 'OPERATOR')
    assert.equal(list.items[0].createdAt, '2026-01-01T00:00:00Z')
    assert.equal(list.items[0].updatedAt, '2026-01-02T00:00:00Z')
    assert.equal(list.items[0].lastMessageSender, 'ADMIN')
    assert.equal(list.items[0].reporterName, '阿蝉')
    assert.equal(list.items[0].reporterUserId, 'usr_1')
    assert.equal(list.pageSize, 20)
    const detail = await getFeedback('rpt_1')
    assert.equal(detail.type, 'BUG')
    assert.equal(detail.category, 'OPERATOR')
    assert.equal(detail.hasAdminReply, true)
    assert.equal(detail.quota.canAppend, true)
    assert.equal(detail.quota.pendingCount, 1)
    assert.equal(detail.quota.pendingLimit, 3)
    assert.equal(detail.viewerIsReporter, true)
    assert.equal(detail.viewerCanManage, false)
    assert.equal(detail.reporter.userName, '阿蝉')
    assert.equal(detail.handler.userName, '管理员')
    assert.equal(detail.messages[0].senderKind, 'ADMIN')
    assert.equal(detail.messages[0].isAdmin, true)
    assert.equal(detail.messages[0].author.userName, '管理员')
    assert.equal(detail.messages[0].images[0].url, '/media/1.webp')
    assert.deepEqual(detail.messages[0].files[0], {
      id: 'med_log',
      name: 'error.log',
      mime: 'text/plain',
      size: 2048,
      download_url: '/v1/reports/rpt_1/attachments/med_log',
      downloadUrl: '/v1/reports/rpt_1/attachments/med_log'
    })
    assert.equal(detail.messages[0].createdAt, '2026-01-03T00:00:00Z')
  })
})

test('历史消息缺少 files 时归一化为空数组', async () => {
  await withFetch(async () => apiResponse({
    id: 'rpt_old',
    type: 'BUG',
    category: 'OTHER',
    status: 'OPEN',
    messages: [{ id: 'rpm_old', content: '旧消息', images: [] }]
  }), async () => {
    const detail = await getFeedback('rpt_old')
    assert.deepEqual(detail.messages[0].files, [])
  })
})

test('附件下载携带 JWT 并返回 Blob 与响应头', async () => {
  const previousToken = auth.accessToken
  auth.accessToken = 'access-token'
  let request
  try {
    const result = await withFetch(async (url, options) => {
      request = { url: String(url), options }
      return new Response(new Blob(['log body'], { type: 'text/plain' }), {
        status: 200,
        headers: {
          'Content-Disposition': 'attachment; filename="error.log"',
          'Content-Type': 'text/plain'
        }
      })
    }, () => downloadFeedbackAttachment('rpt/1', 'med/1'))
    assert.equal(await result.blob.text(), 'log body')
    assert.equal(result.headers.get('content-type'), 'text/plain')
    assert.equal(request.options.headers.Authorization, 'Bearer access-token')
    assert.match(request.url, /\/v1\/reports\/rpt%2F1\/attachments\/med%2F1$/)
  } finally {
    auth.accessToken = previousToken
  }
})

test('附件下载 401 刷新后只重放一次且 JSON 错误保持错误对象', async () => {
  const previous = {
    accessToken: auth.accessToken,
    refreshToken: auth.refreshToken,
    refresh: auth.refresh
  }
  auth.accessToken = 'old-token'
  auth.refreshToken = 'refresh-token'
  let refreshCount = 0
  auth.refresh = async () => {
    refreshCount += 1
    auth.accessToken = 'new-token'
    return true
  }
  const requests = []
  try {
    const result = await withFetch(async (_url, options) => {
      requests.push(options.headers.Authorization)
      if (requests.length === 1) {
        return new Response(JSON.stringify({ status_code: 401, message: 'expired' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      return new Response(new Blob(['ok']), {
        status: 200,
        headers: { 'Content-Disposition': 'attachment; filename="ok.log"' }
      })
    }, () => downloadFeedbackAttachment('rpt_1', 'med_1'))
    assert.equal(await result.blob.text(), 'ok')
    assert.equal(refreshCount, 1)
    assert.deepEqual(requests, ['Bearer old-token', 'Bearer new-token'])

    await assert.rejects(
      withFetch(async () => new Response(JSON.stringify({ status_code: 404, message: '附件不存在' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }), () => downloadFeedbackAttachment('rpt_1', 'missing')),
      error => error.status === 404 && error.message === '附件不存在'
    )
  } finally {
    auth.accessToken = previous.accessToken
    auth.refreshToken = previous.refreshToken
    auth.refresh = previous.refresh
  }
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

test('删除反馈授权接受成功响应省略 data', async () => {
  let request
  await withFetch(async (url, options = {}) => {
    request = { url: String(url), options }
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      async json() { return { status_code: 200, message: 'ok' } }
    }
  }, async () => {
    assert.equal(await deleteFeedbackAccessGrant('user/1'), undefined)
  })
  assert.match(request.url, /\/v1\/admin\/feedback-access\/user%2F1$/)
  assert.equal(request.options.method, 'DELETE')
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

test('媒体上传使用 file multipart 字段并解包返回的媒体对象', async () => {
  let request
  await withFetch(async (url, options) => {
    request = { url: String(url), options }
    return apiResponse({ id: 'med_1', url: 'https://api.example.test/media/med_1.png' })
  }, async () => {
    const file = new File(['png'], 'screen.png', { type: 'image/png' })
    const result = await uploadMedia(file)
    assert.equal(result.id, 'med_1')
    assert.equal(request.options.body instanceof FormData, true)
    assert.equal(request.options.body.get('file'), file)
  })
  assert.match(request.url, /\/v1\/media\/upload$/)
  assert.equal(request.options.method, 'POST')
})
