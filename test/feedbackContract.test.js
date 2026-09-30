import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  appendManagedFeedbackMessage,
  appendMyFeedbackMessage,
  createFeedback,
  createFeedbackCategory,
  deleteFeedbackAccessGrant,
  downloadFeedbackAttachment,
  getFeedback,
  getManagedFeedback,
  getFeedbackAccess,
  getFeedbackQueueCounts,
  listFeedbackVersionOptions,
  listManagedFeedback,
  listWorkflowFeedback,
  listFeedbackAssignees,
  listFeedbackWorkflowEvents,
  claimFeedback,
  markManagedFeedbackRead,
  listMyFeedback,
  listFeedback,
  listFeedbackAccessGrants,
  normalizeFeedback,
  renameFeedbackCategory,
  updateFeedbackAccessGrant,
  updateFeedbackType,
  updateManagedFeedbackStatus,
  updateMyFeedbackStatus
} from '../src/api/feedback.js'
import { uploadMedia } from '../src/api/media.js'
import { auth } from '../src/store/auth.js'
import { searchFeedbackAccessUsers } from '../src/api/user.js'
import { normalizeAdminAuditLog } from '../src/api/admin.js'

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

test('超级管理员板块写接口发送名称并保留稳定标识', async () => {
  const calls = []
  await withFetch(async (url, options) => {
    calls.push({ url: String(url), method: options.method, body: JSON.parse(options.body) })
    return apiResponse({ key: 'CUSTOM_TEST', label: options.body.includes('新名称') ? '新名称' : '新板块' })
  }, async () => {
    await createFeedbackCategory('新板块')
    await renameFeedbackCategory('CUSTOM_TEST', '新名称')
  })
  assert.match(calls[0].url, /\/v1\/admin\/feedback-categories$/)
  assert.equal(calls[0].method, 'POST')
  assert.deepEqual(calls[0].body, { label: '新板块' })
  assert.match(calls[1].url, /\/v1\/admin\/feedback-categories\/CUSTOM_TEST$/)
  assert.equal(calls[1].method, 'PUT')
  assert.deepEqual(calls[1].body, { label: '新名称' })
})

test('反馈板块审计保留改名前后名称', () => {
  const log = normalizeAdminAuditLog({
    action: 'FEEDBACK_CATEGORY_RENAMED',
    before: { feedback_category_label: '旧名称' },
    after: { feedback_category_label: '新名称' }
  })
  assert.equal(log.before.feedbackCategoryLabel, '旧名称')
  assert.equal(log.after.feedbackCategoryLabel, '新名称')
})

async function withFetch(handler, fn) {
  const previous = globalThis.fetch
  globalThis.fetch = handler
  try {
    return await fn()
  } finally {
    globalThis.fetch = previous
  }
}

test('管理员修改反馈类型使用 PATCH 与规范化后的类型', async () => {
  let captured = null
  const result = await withFetch(async (url, opts) => {
    captured = { url, opts }
    return apiResponse({ id: 'rpt_1', type: 'FEATURE' })
  }, () => updateFeedbackType('rpt_1', 'feature'))

  assert.equal(captured.opts.method, 'PATCH')
  assert.match(captured.url, /\/v1\/admin\/feedback\/rpt_1\/type$/)
  assert.deepEqual(JSON.parse(captured.opts.body), { type: 'FEATURE' })
  assert.equal(result.type, 'FEATURE')
})

test('反馈版本选项保留草稿/已发布状态供目标与完成版本分别筛选', async () => {
  let capturedUrl = ''
  const result = await withFetch(async (url) => {
    capturedUrl = String(url)
    return apiResponse([
      { id: 'chg_draft', version_label: 'v0.0.1-beta.8', published: false },
      { id: 'chg_pub', version_label: 'v0.0.1-beta.7', published: true }
    ])
  }, () => listFeedbackVersionOptions())

  assert.match(capturedUrl, /\/v1\/admin\/feedback\/version-options$/)
  assert.deepEqual(result, [
    { id: 'chg_draft', versionLabel: 'v0.0.1-beta.8', published: false },
    { id: 'chg_pub', versionLabel: 'v0.0.1-beta.7', published: true }
  ])
})

// 应用诊断契约：三个 snake_case 键齐全且都是非空字符串（缺一后端就收不到该维度）。
function assertDiagnosticsPayload(diagnostics) {
  assert.ok(diagnostics && typeof diagnostics === 'object', 'diagnostics 必须存在')
  assert.deepEqual(Object.keys(diagnostics).sort(), ['build_time', 'frontend_commit', 'product_version'])
  for (const [key, value] of Object.entries(diagnostics)) {
    assert.equal(typeof value, 'string', `${key} 必须是字符串`)
    assert.notEqual(value, '', `${key} 不能为空`)
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
    const body = JSON.parse(request.options.body)
    assertDiagnosticsPayload(body.diagnostics)
    delete body.diagnostics
    assert.deepEqual(body, {
      type: 'BUG',
      category: 'INVENTORY',
      content: '坏了',
      media_ids: ['med_1'],
      public_consent: false,
      client_info_consent: true
    })
    assert.equal(result.status, 'OPEN')
  })
})

test('后端新增的反馈板块按原值提交和展示', async () => {
  let sent
  const created = await withFetch(async (_url, options) => {
    sent = JSON.parse(options.body)
    return apiResponse({ id: 'rpt_star', type: 'BUG', category: 'STAR', area: 'STAR', status: 'OPEN' })
  }, () => createFeedback({ type: 'BUG', category: 'STAR', content: '星石问题' }))

  assert.equal(sent.category, 'STAR')
  assert.equal(created.category, 'STAR')
  assert.equal(normalizeFeedback({ type: 'FEATURE', category: 'MAAYUAN', status: 'OPEN' }).category, 'MAAYUAN')
})

test('创建反馈兼容旧的 type/category/area 请求', async () => {
  let request
  await withFetch(async (url, options) => {
    request = { url: String(url), options }
    return apiResponse({ id: 'rpt_legacy', type: 'BUG', category: 'INVENTORY', status: 'OPEN' })
  }, async () => {
    await createFeedback({ type: 'bug', category: 'BUG', area: 'INVENTORY', content: '坏了' })
  })
  const body = JSON.parse(request.options.body)
  assertDiagnosticsPayload(body.diagnostics)
  delete body.diagnostics
  assert.deepEqual(body, {
    type: 'BUG',
    category: 'INVENTORY',
    content: '坏了',
    media_ids: [],
    public_consent: false,
    client_info_consent: false
  })
})

test('公开授权发送 snake_case 且只接受明确 true，不隐式授予旧记录', async () => {
  const bodies = []
  await withFetch(async (_url, options) => {
    bodies.push(JSON.parse(options.body))
    return apiResponse({ id: 'rpt_consent', public_consent: true })
  }, async () => {
    const result = await createFeedback({ type: 'BUG', category: 'OTHER', content: '正文', title: ' 标题 ', publicConsent: true })
    assert.equal(result.publicConsent, true)
    await createFeedback({ content: '私下正文', publicConsent: 'true', clientInfoConsent: true })
  })
  assert.equal(bodies[0].public_consent, true)
  assert.equal(bodies[0].title, '标题')
  assert.equal(bodies[0].client_info_consent, false)
  assert.equal(bodies[1].public_consent, false)
  assert.equal(bodies[1].client_info_consent, true)
  assert.equal('title' in bodies[1], false)
  assert.equal(normalizeFeedback({}).publicConsent, false)
  assert.equal(normalizeFeedback({ public_consent: false, visibility: 'PUBLIC' }).publicConsent, false)
  assert.equal(normalizeFeedback({ public_consent: 'true' }).publicConsent, false)
  assert.equal(normalizeFeedback({ publicConsent: true }).publicConsent, true)
})

test('未勾选 clientInfoConsent 时仍然上报版本与构建诊断', async () => {
  const bodies = []
  await withFetch(async (_url, options) => {
    bodies.push(JSON.parse(options.body))
    return apiResponse({ id: 'rpt_diag', type: 'BUG', category: 'OTHER', status: 'OPEN' })
  }, async () => {
    await createFeedback({ type: 'BUG', category: 'OTHER', content: '没勾选同意', clientInfoConsent: false })
  })
  assert.equal(bodies[0].client_info_consent, false)
  assertDiagnosticsPayload(bodies[0].diagnostics)
})

test('详情归一化 snake_case diagnostics，缺失时兼容为 null', async () => {
  await withFetch(async () => apiResponse({
    id: 'rpt_diag',
    type: 'BUG',
    category: 'OTHER',
    status: 'OPEN',
    messages: [],
    diagnostics: {
      product_version: '0.9.0-beta.1',
      frontend_commit: 'abc1234',
      build_time: '2026-01-02T03:04:05Z'
    }
  }), async () => {
    const detail = await getFeedback('rpt_diag')
    assert.deepEqual(detail.diagnostics, {
      productVersion: '0.9.0-beta.1',
      frontendCommit: 'abc1234',
      buildTime: '2026-01-02T03:04:05Z'
    })
  })

  // 旧工单没有 diagnostics 字段时不得抛错，也不得伪造版本
  await withFetch(async () => apiResponse({
    id: 'rpt_old',
    type: 'BUG',
    category: 'OTHER',
    status: 'OPEN',
    messages: []
  }), async () => {
    const detail = await getFeedback('rpt_old')
    assert.equal(detail.diagnostics, null)
  })

  // 全空对象同样归一化为 null
  await withFetch(async () => apiResponse({
    id: 'rpt_blank',
    type: 'BUG',
    category: 'OTHER',
    status: 'OPEN',
    messages: [],
    diagnostics: { product_version: '', frontend_commit: '', build_time: '' }
  }), async () => {
    const detail = await getFeedback('rpt_blank')
    assert.equal(detail.diagnostics, null)
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

test('canonical sender_kind 优先于冲突的旧 is_admin', async () => {
  await withFetch(async () => apiResponse({
    id: 'rpt_identity',
    type: 'BUG',
    category: 'OTHER',
    status: 'OPEN',
    messages: [
      { id: 'rpm_reporter', sender_kind: 'REPORTER', is_admin: true, content: '个人补充' },
      { id: 'rpm_admin', sender_kind: 'ADMIN', is_admin: false, content: '管理员回复' },
      { id: 'rpm_legacy', is_admin: true, content: '旧消息' }
    ]
  }), async () => {
    const detail = await getFeedback('rpt_identity')
    assert.equal(detail.messages[0].isAdmin, false)
    assert.equal(detail.messages[1].isAdmin, true)
    assert.equal(detail.messages[2].isAdmin, true)
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
    await updateFeedbackAccessGrant('user/1', { receiveAreas: ['INVENTORY'], manageAreas: ['OPERATOR'], feedbackRoles: ['DEVELOPER'], developerAreas: ['STAR'] })
  })
  assert.match(requests[0].url, /\/v1\/reports\/access$/)
  assert.match(requests[1].url, /\/v1\/admin\/feedback-access$/)
  assert.match(requests[2].url, /\/v1\/admin\/feedback-access\/user%2F1$/)
  assert.deepEqual(JSON.parse(requests[2].options.body), {
    receive_categories: ['INVENTORY'],
    manage_categories: ['OPERATOR'],
    feedback_roles: ['DEVELOPER'],
    operator_areas: [],
    developer_areas: ['STAR']
  })
})

test('后台队列、接单和团队已读使用独立管理接口', async () => {
  const requests = []
  await withFetch(async (url, options = {}) => {
    requests.push({ url: String(url), options })
    return apiResponse(requests.length === 1 ? { reports: [{ id: 'rpt_1', status: 'OPEN', workflow_stage: 'UNASSIGNED', work_area: 'STAR', team_unread: true }], total: 1 } : {})
  }, async () => {
    const list = await listWorkflowFeedback({ queue: 'UNASSIGNED', workArea: 'STAR' })
    assert.equal(list.items[0].workArea, 'STAR')
    assert.equal(list.items[0].teamUnread, true)
    await claimFeedback('rpt_1')
    await markManagedFeedbackRead('rpt_1', 'rpm_1')
  })
  assert.match(requests[0].url, /\/v1\/admin\/feedback\/queue\?/)
  assert.match(requests[0].url, /workArea=STAR/)
  assert.match(requests[1].url, /\/rpt_1\/claim$/)
  assert.deepEqual(JSON.parse(requests[2].options.body), { message_id: 'rpm_1' })
})

test('管理员详情使用明确的后台身份路由', async () => {
  let path = ''
  await withFetch(async url => { path = String(url); return apiResponse({ id: 'rpt_1', status: 'OPEN' }) }, () => getManagedFeedback('rpt_1'))
  assert.match(path, /\/v1\/admin\/feedback\/rpt_1$/)
})

test('队列排序参数和计数使用完整服务端筛选，不从当前页估算', async () => {
  const requests = []
  await withFetch(async url => {
    const parsed = new URL(String(url), 'https://example.test')
    requests.push(parsed)
    return apiResponse({ reports: [], total: parsed.searchParams.get('queue') === 'NEEDS_REPLY' ? 27 : 9 })
  }, async () => {
    await listWorkflowFeedback({ queue: 'NEEDS_REPLY', sortBy: 'createdAt', sortOrder: 'asc' })
    const counts = await getFeedbackQueueCounts(['NEEDS_REPLY', 'RETURNED'], { type: 'EXPERIENCE', workArea: 'STAR', q: '保存' })
    assert.deepEqual(counts, { NEEDS_REPLY: 27, RETURNED: 9 })
  })
  assert.equal(requests[0].searchParams.get('sortBy'), 'createdAt')
  assert.equal(requests[0].searchParams.get('sortOrder'), 'asc')
  for (const url of requests.slice(1)) {
    assert.equal(url.searchParams.get('pageSize'), '1')
    assert.equal(url.searchParams.get('type'), 'EXPERIENCE')
    assert.equal(url.searchParams.get('workArea'), 'STAR')
    assert.equal(url.searchParams.get('q'), '保存')
  }
})

test('转交候选人使用当前工单的鉴权接口', async () => {
  let path = ''
  const users = await withFetch(async url => {
    path = String(url)
    return apiResponse([{ id: 'operator_2', user_name: '运营二号' }])
  }, () => listFeedbackAssignees('rpt/1'))
  assert.match(path, /\/v1\/admin\/feedback\/rpt%2F1\/assignees$/)
  assert.equal(users[0].id, 'operator_2')
  assert.equal(users[0].userName, '运营二号')
})

test('内部流转事件归一化操作者和时间字段', async () => {
  const events = await withFetch(async () => apiResponse([
    { id: 'evt_1', action: 'CLAIM', actor_user_id: 'operator_1', created_at: '2026-09-28T00:00:00Z', note: '接单' }
  ]), () => listFeedbackWorkflowEvents('rpt_1'))
  assert.equal(events[0].actorUserId, 'operator_1')
  assert.equal(events[0].createdAt, '2026-09-28T00:00:00Z')
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

test('个人和管理写操作固定发送各自 actor_mode 且调用参数不能覆盖', async () => {
  const requests = []
  await withFetch(async (url, options) => {
    requests.push({ url: String(url), options })
    return apiResponse({ id: 'rpt_1', type: 'FEEDBACK', status: 'RESOLVED', content: 'ok' })
  }, async () => {
    await appendMyFeedbackMessage('rpt/1', { content: '个人补充', mediaIds: [], actorMode: 'ADMIN', actor_mode: 'ADMIN' })
    await appendManagedFeedbackMessage('rpt/1', { content: '管理回复', mediaIds: [], actorMode: 'REPORTER' })
    await updateMyFeedbackStatus('rpt/1', 'resolved', 'ADMIN')
    await updateManagedFeedbackStatus('rpt/1', 'dismissed', '已处理')
  })
  assert.match(requests[0].url, /\/v1\/reports\/rpt%2F1\/messages$/)
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    content: '个人补充',
    media_ids: [],
    actor_mode: 'REPORTER'
  })
  assert.match(requests[1].url, /\/v1\/reports\/rpt%2F1\/messages$/)
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    content: '管理回复',
    media_ids: [],
    actor_mode: 'ADMIN'
  })
  assert.match(requests[2].url, /\/v1\/reports\/rpt%2F1\/status$/)
  assert.deepEqual(JSON.parse(requests[2].options.body), {
    status: 'RESOLVED',
    actor_mode: 'REPORTER',
    reason: null
  })
  assert.match(requests[3].url, /\/v1\/reports\/rpt%2F1\/status$/)
  assert.deepEqual(JSON.parse(requests[3].options.body), {
    status: 'DISMISSED',
    actor_mode: 'ADMIN',
    reason: '已处理',
    complete_public_feedback: true
  })
})

test('管理员结案默认同步广场且可显式保留公开进度，用户结案不发送同步参数', async () => {
  const bodies = []
  await withFetch(async (_url, options) => {
    bodies.push(JSON.parse(options.body))
    return apiResponse({ id: 'rpt_1', status: 'RESOLVED' })
  }, async () => {
    await updateManagedFeedbackStatus('rpt_1', 'RESOLVED')
    await updateManagedFeedbackStatus('rpt_1', 'RESOLVED', null, false)
    await updateMyFeedbackStatus('rpt_1', 'RESOLVED')
  })
  assert.equal(bodies[0].complete_public_feedback, true)
  assert.equal(bodies[1].complete_public_feedback, false)
  assert.equal('complete_public_feedback' in bodies[2], false)
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

test('旧 FEEDBACK 的 ACCOUNT 类型不覆盖旧 area 板块，无板块的旧类型回落 OTHER', async () => {
  const bodies = []
  await withFetch(async (_url, options) => {
    bodies.push(JSON.parse(options.body))
    return apiResponse({ id: 'rpt_legacy', type: 'ACCOUNT', category: 'OPERATOR', status: 'OPEN' })
  }, async () => {
    await createFeedback({ type: 'FEEDBACK', category: 'ACCOUNT', area: 'OPERATOR', content: '旧账号反馈' })
    await createFeedback({ type: 'FEEDBACK', category: 'BUG', content: '旧问题反馈' })
  })
  assert.equal(bodies[0].type, 'ACCOUNT')
  assert.equal(bodies[0].category, 'OPERATOR')
  assert.equal(bodies[1].type, 'BUG')
  assert.equal(bodies[1].category, 'OTHER')
})

test('历史响应的板块解析优先有效 area，与后端详情授权一致', () => {
  const report = normalizeFeedback({ type: ' FEEDBACK ', category: ' ACCOUNT ', area: ' operator ', status: 'OPEN' })
  assert.equal(report.type, 'ACCOUNT')
  assert.equal(report.category, 'OPERATOR')
  assert.equal(normalizeFeedback({ type: 'FEEDBACK', category: 'BUG', area: null }).category, 'OTHER')
  const experience = normalizeFeedback({ type: 'FEEDBACK', category: 'EXPERIENCE' })
  assert.equal(experience.type, 'EXPERIENCE')
  assert.equal(experience.category, 'OTHER')
  assert.equal(normalizeFeedback({ type: 'BUG', category: 'OTHER', area: 'OPERATOR' }).category, 'OPERATOR')
})
