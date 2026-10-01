import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  ADMIN_TOOL_GROUPS,
  getVisibleAdminToolGroups,
  getVisibleAdminTools,
  hasManagementCapability
} from '../src/utils/adminTools.js'
import { ADMIN_PERMISSIONS, normalizeAdminAccess } from '../src/utils/authPermissions.js'
import { routes } from '../src/router/routes.js'

function readSource(path) {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
}

test('maps every management tool to its existing permission boundary', function () {
  const access = normalizeAdminAccess({
    permissions: Object.values(ADMIN_PERMISSIONS),
    operator_areas: ['OPERATOR']
  })
  assert.deepEqual(getVisibleAdminTools(access).map(function (tool) { return tool.to }), [
    '/co-creation/admin',
    '/admin/beta',
    '/feedback/manage',
    '/feedback/admin',
    '/operator/admin',
    '/recruitment/admin',
    '/level/admin',
    '/admin/changelog',
    '/admin/roles',
    '/admin/audit'
  ])
  assert.deepEqual(ADMIN_TOOL_GROUPS.map(function (group) { return group.key }), ['feedback', 'content', 'platform'])
})

test('filters management tools for a single feedback-area manager', function () {
  const access = normalizeAdminAccess({ operator_areas: ['INVENTORY'] })
  const tools = getVisibleAdminTools(access)
  assert.deepEqual(tools.map(function (tool) { return tool.key }), ['feedback-manage'])
  assert.deepEqual(getVisibleAdminToolGroups(access).map(function (group) { return group.key }), ['feedback'])
  assert.equal(hasManagementCapability(access), true)
})

test('does not expose management tools without loaded capability', function () {
  assert.deepEqual(getVisibleAdminTools(null), [])
  assert.deepEqual(getVisibleAdminToolGroups(null), [])
  assert.equal(hasManagementCapability(null), false)
})

test('registers the protected management workbench route', function () {
  const route = routes.find(function (item) { return item.path === '/manage' })
  assert.ok(route)
  assert.equal(route.name, 'manage')
  assert.equal(route.meta.requiresAuth, true)
  assert.equal(route.meta.requiresManagement, true)
  assert.equal(route.meta.title.startsWith('管理工作台'), true)
})

test('招募管理路由与工作台只向具有专属目录权限的管理员开放', () => {
  const route = routes.find(item => item.path === '/recruitment/admin')
  assert.equal(route.meta.requiresAuth, true)
  assert.equal(route.meta.requiredPermission, ADMIN_PERMISSIONS.RECRUITMENT_CATALOG_WRITE)
  assert.deepEqual(getVisibleAdminTools(normalizeAdminAccess({ permissions: [ADMIN_PERMISSIONS.RECRUITMENT_CATALOG_WRITE] })).map(tool => tool.to), ['/recruitment/admin'])
  assert.equal(getVisibleAdminTools(normalizeAdminAccess({ permissions: [ADMIN_PERMISSIONS.OPERATOR_CATALOG_WRITE] })).some(tool => tool.to === '/recruitment/admin'), false)
})

test('招募档案访问配置使用独立平台权限和管理入口', () => {
  const route = routes.find(item => item.path === '/admin/recruitment-access')
  assert.equal(route.meta.requiresAuth, true)
  assert.equal(route.meta.requiredPermission, ADMIN_PERMISSIONS.RECRUITMENT_ACCESS_MANAGE)
  assert.deepEqual(getVisibleAdminTools(normalizeAdminAccess({ permissions: [ADMIN_PERMISSIONS.RECRUITMENT_ACCESS_MANAGE] })).map(tool => tool.to), ['/admin/recruitment-access'])
  assert.equal(getVisibleAdminTools(normalizeAdminAccess({ permissions: [ADMIN_PERMISSIONS.RECRUITMENT_CATALOG_WRITE] })).some(tool => tool.to === '/admin/recruitment-access'), false)
})

test('adds a single accessible workbench back link to management detail pages', function () {
  const backLink = readSource('../src/components/admin/AdminBackLink.vue')
  const detailPages = [
    '../src/pages/admin/roles.vue',
    '../src/pages/admin/audit.vue',
    '../src/pages/operator/admin.vue',
    '../src/pages/changelog/admin.vue'
  ].map(readSource)
  const workbench = readSource('../src/pages/admin/index.vue')

  assert.match(backLink, /<router-link[^>]+to="\/manage"[^>]+aria-label="返回管理工作台"/s)
  assert.match(backLink, /<ArrowLeft[^>]+:size="20"[^>]+aria-hidden="true"/)
  assert.match(backLink, /\.admin-back-link\s*\{[\s\S]*display:\s*inline-flex[\s\S]*min-height:\s*48px[\s\S]*font:\s*800 16px/)
  assert.match(backLink, /@media\s*\(max-width:\s*767px\)[\s\S]*\.admin-back-link\s*\{[\s\S]*font-size:\s*16px/)
  detailPages.forEach(function (source) {
    assert.equal((source.match(/<AdminBackLink\s*\/>/g) || []).length, 1)
    assert.match(source, /<header class="hero(?: [^"]+)?">\s*<div class="wrap">\s*<AdminBackLink\s*\/>/s)
  })
  assert.doesNotMatch(workbench, /AdminBackLink/)
})

test('feedback pages share their own navigation and retain their protected routes', function () {
  const feedbackRoutes = routes.filter(route => route.path.startsWith('/feedback'))
  assert.equal(feedbackRoutes.length, 4)
  for (const route of feedbackRoutes) {
    assert.ok(route.meta.title.startsWith('反馈中心 · '))
  }
  assert.equal(feedbackRoutes.find(route => route.path === '/feedback/manage').meta.requiresFeedbackManage, true)
  assert.equal(feedbackRoutes.find(route => route.path === '/feedback/admin').meta.requiredPermission, ADMIN_PERMISSIONS.FEEDBACK_ACCESS_MANAGE)
  for (const page of ['index', 'plaza', 'manage', 'admin']) {
    const source = readSource(`../src/pages/feedback/${page}.vue`)
    assert.match(source, /<FeedbackWorkspaceNav\b/)
    assert.doesNotMatch(source, /AdminBackLink|show-management/)
  }
})

// Replaced by mounted behavior tests; see docs/testing.md (no pixel/source-shape gate).


test('groups private sidebar entries while keeping guest access to public feedback', function () {
  const sidebar = readSource('../src/components/IslandSidebar.vue')
  const desktopNav = sidebar.match(/<nav class="nav">([\s\S]*?)<\/nav>/)[1]

  const privateEntries = desktopNav.match(/<template v-if="isLoggedIn">([\s\S]*?)<\/template>/)[1]
  assert.match(privateEntries, /to="\/notifications"/)
  assert.match(privateEntries, /to="\/feedback"/)
  assert.match(desktopNav, /<router-link\s+v-if="!isLoggedIn"\s+to="\/feedback\/plaza"/)
})
