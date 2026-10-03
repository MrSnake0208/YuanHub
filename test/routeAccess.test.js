// Case 3 / Case 4：管理权限等待必须精确到「真正需要权限的路由」，且不能绕过权限判断。
import test from 'node:test'
import assert from 'node:assert/strict'
import { routes } from '../src/router/routes.js'
import { isRouteAccessAllowed, needsAdminAccess } from '../src/utils/routeAccess.js'

const ADMIN_META_KEYS = ['requiredPermission', 'requiredAnyPermission', 'requiresFeedbackManage', 'requiresManagement', 'requiresAdmin']

function metaFor(path) {
  const route = routes.find(function (item) { return item.path === path })
  assert.ok(route, '缺少路由：' + path)
  return route.meta
}

function access({ permissions = [], operatorAreas = [], roles = [] } = {}) {
  return { roles, permissions, receiveAreas: [], operatorAreas, developerAreas: [], superAdmin: false }
}

test('Case 3：普通页面不需要管理权限，因此首屏不会等待 /v1/admin/access/me', function () {
  ;['/', '/today', '/cart', '/works', '/inventory', '/star', '/beta', '/login', '/register', '/user/profile', '/feedback']
    .forEach(function (path) {
      const route = routes.find(function (item) { return item.path === path })
      if (!route) return
      assert.equal(needsAdminAccess(route.meta), false, path + ' 不应要求管理权限')
      assert.equal(isRouteAccessAllowed(route.meta, null, ''), true, path + ' 不应被权限判断拦住')
    })
})

test('Case 4：所有带权限元数据的路由都必须先拿到权限结果', function () {
  const guarded = routes.filter(function (route) {
    return route.meta && ADMIN_META_KEYS.some(function (key) { return route.meta[key] != null })
  })
  assert.ok(guarded.length >= 8, '应当存在多条受管理权限保护的路由')
  guarded.forEach(function (route) {
    assert.equal(needsAdminAccess(route.meta), true, route.path + ' 必须等待权限结果')
    assert.equal(isRouteAccessAllowed(route.meta, null, ''), false, route.path + ' 在无权限时必须被拒绝')
  })
})

test('Case 4：权限满足时放行，权限不足时拒绝（逐条覆盖管理路由）', function () {
  const cases = [
    ['/admin/beta', access({ permissions: ['beta:manage'] })],
    ['/feedback/manage', access({ operatorAreas: ['INVENTORY'] })],
    ['/feedback/admin', access({ permissions: ['admin:feedback_access:manage'] })],
    ['/admin/roles', access({ permissions: ['admin:role:manage'] })],
    ['/admin/audit', access({ permissions: ['admin:audit:read'] })],
    ['/manage', access({ permissions: ['beta:manage'] })]
  ]
  cases.forEach(function ([path, granted]) {
    assert.equal(isRouteAccessAllowed(metaFor(path), granted, ''), true, path + ' 有权限时应放行')
    assert.equal(isRouteAccessAllowed(metaFor(path), null, ''), false, path + ' 无权限时应拒绝')
    assert.equal(isRouteAccessAllowed(metaFor(path), access(), ''), false, path + ' 空权限对象应拒绝')
  })

  // 任一权限命中即可（changelog:write / changelog:review）
  assert.equal(isRouteAccessAllowed(metaFor('/admin/changelog'), access({ permissions: ['changelog:review'] }), ''), true)
  assert.equal(isRouteAccessAllowed(metaFor('/admin/changelog'), access({ permissions: ['unrelated'] }), ''), false)
})

test('/manage 在权限读取失败时保留进入页面展示失败态（不误判为越权）', function () {
  assert.equal(isRouteAccessAllowed(metaFor('/manage'), null, '管理权限读取失败'), true)
  // 其他受保护路由不享受该宽容语义
  assert.equal(isRouteAccessAllowed(metaFor('/admin/roles'), null, '管理权限读取失败'), false)
})

test('permission 判定只认显式权限，不接受角色名冒充权限', function () {
  assert.equal(isRouteAccessAllowed(metaFor('/admin/roles'), access({ roles: ['SUPER_ADMIN'] }), ''), false)
})


test('日历测试路由严格要求管理员；权限读取失败不能放行，反馈管理成员也可测试', () => {
  for (const path of ['/calendar', '/calendar/suggestions', '/calendar/suggestions/new']) {
    const meta = metaFor(path)
    assert.equal(meta.requiresAuth, true)
    assert.equal(needsAdminAccess(meta), true)
    assert.equal(isRouteAccessAllowed(meta, access()), false)
    assert.equal(isRouteAccessAllowed(meta, null, '管理权限读取失败'), false)
    assert.equal(isRouteAccessAllowed(meta, access({ permissions: ['beta:manage'] })), true)
    assert.equal(isRouteAccessAllowed(meta, access({ operatorAreas: ['INVENTORY'] })), true)
  }
})
