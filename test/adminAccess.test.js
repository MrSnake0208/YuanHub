import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getCurrentAdminAccess,
  listAdminAuditLogs,
  listAdminRoleUsers,
  normalizeAdminAuditLog,
  replaceAdminRoles
} from '../src/api/admin.js'

function apiResponse(data) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    async json() { return { status_code: 200, data } }
  }
}

async function withFetch(handler, fn) {
  const previous = globalThis.fetch
  globalThis.fetch = handler
  try { return await fn() } finally { globalThis.fetch = previous }
}

test('loads and normalizes current admin access', async () => {
  let url
  await withFetch(async (value) => {
    url = String(value)
    return apiResponse({
      roles: ['PLATFORM_ADMIN'],
      permissions: ['operator_catalog:write'],
      receive_areas: ['INVENTORY'],
      manage_areas: ['OPERATOR'],
      super_admin: false
    })
  }, async () => {
    const access = await getCurrentAdminAccess()
    assert.deepEqual(access.manageAreas, ['OPERATOR'])
    assert.deepEqual(access.receiveAreas, ['INVENTORY'])
  })
  assert.match(url, /\/v1\/admin\/access\/me$/)
})

test('lists role users and sends roles as a complete replacement', async () => {
  const requests = []
  await withFetch(async (url, options = {}) => {
    requests.push({ url: String(url), options })
    return apiResponse({
      user_id: 'user-1', user_name: 'alice', activated: true,
      roles: ['SUPER_ADMIN'], granted_by: 'root', granted_at: '2026-01-01T00:00:00Z',
      updated_by: 'root', updated_at: '2026-01-01T00:00:00Z'
    })
  }, async () => {
    const replaced = await replaceAdminRoles('user/1', [])
    assert.equal(replaced.userId, 'user-1')
  })
  assert.match(requests[0].url, /\/v1\/admin\/roles\/users\/user%2F1$/)
  assert.deepEqual(JSON.parse(requests[0].options.body), { roles: [] })

  await withFetch(async () => apiResponse([{
    user_id: 'user-2', user_name: 'bob', activated: false, roles: ['PLATFORM_ADMIN']
  }]), async () => {
    const users = await listAdminRoleUsers()
    assert.equal(users[0].activated, false)
    assert.deepEqual(users[0].roles, ['PLATFORM_ADMIN'])
  })
})

test('normalizes paged audit records and nullable snapshots', async () => {
  let url
  await withFetch(async (value) => {
    url = String(value)
    return apiResponse({
      has_next: false,
      page: 2,
      total: 21,
      data: [{
        id: 'audit-1', actor_user_id: 'root', action: 'ROLE_REPLACED',
        target_user_id: 'user-1', before: null,
        after: { roles: ['PLATFORM_ADMIN'], manage_areas: ['OPERATOR'] },
        occurred_at: '2026-01-01T00:00:00Z'
      }]
    })
  }, async () => {
    const page = await listAdminAuditLogs({ page: 2, size: 20 })
    assert.equal(page.total, 21)
    assert.equal(page.hasNext, false)
    assert.equal(page.data[0].before, null)
    assert.deepEqual(page.data[0].after.manageAreas, ['OPERATOR'])
  })
  assert.match(url, /page=2/)
  assert.match(url, /size=20/)
})


test('ledger audit preserves public change detail and resource identity', () => {
  const log = normalizeAdminAuditLog({ action: 'LEDGER_CATALOG_UPDATED', actor_user_id: 'editor', target_resource: 'ledger:ru:1000000',
    before: { ledger: { value: '旧价格=6' } }, after: { ledger: { value: '新价格=7' } } })
  assert.equal(log.targetResource, 'ledger:ru:1000000')
  assert.deepEqual(log.before.ledger, { value: '旧价格=6' })
  assert.deepEqual(log.after.ledger, { value: '新价格=7' })
})


test('板块排序审计兼容两种命名并保留前后名称顺序', () => {
  const log = normalizeAdminAuditLog({
    action: 'FEEDBACK_CATEGORY_REORDERED',
    before: { feedback_category_order: ['日历', '其他'] },
    after: { feedbackCategoryOrder: ['其他', '日历'] }
  })
  assert.deepEqual(log.before.feedbackCategoryOrder, ['日历', '其他'])
  assert.deepEqual(log.after.feedbackCategoryOrder, ['其他', '日历'])
})

test('feedback visibility audit preserves both true and false snapshots', () => {
  const log = normalizeAdminAuditLog({
    action: 'FEEDBACK_CATEGORY_VISIBILITY_UPDATED',
    before: { feedback_category_label: '历史板块', feedback_category_hidden: true },
    after: { feedback_category_label: '历史板块', feedback_category_hidden: false }
  })
  assert.equal(log.before.feedbackCategoryHidden, true)
  assert.equal(log.after.feedbackCategoryHidden, false)
})
