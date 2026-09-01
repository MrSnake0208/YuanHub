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
    manage_areas: ['OPERATOR']
  })
  assert.deepEqual(getVisibleAdminTools(access).map(function (tool) { return tool.to }), [
    '/feedback/manage',
    '/feedback/admin',
    '/operator/admin',
    '/admin/roles',
    '/admin/audit'
  ])
  assert.deepEqual(ADMIN_TOOL_GROUPS.map(function (group) { return group.key }), ['feedback', 'content', 'platform'])
})

test('filters management tools for a single feedback-area manager', function () {
  const access = normalizeAdminAccess({ manage_areas: ['INVENTORY'] })
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

test('keeps shared navigation and notification entry points stable', function () {
  const sidebar = readSource('../src/components/IslandSidebar.vue')
  const feedbackNav = readSource('../src/components/feedback/FeedbackWorkspaceNav.vue')
  const notificationPage = readSource('../src/pages/notifications/index.vue')

  assert.match(sidebar, /to="\/cart"[\s\S]*to="\/inventory"[\s\S]*to="\/operator"[\s\S]*to="\/notifications"[\s\S]*to="\/feedback"[\s\S]*to="\/(?:user\/profile|login)"/)
  assert.doesNotMatch(sidebar, /to="\/manage"/)
  assert.match(feedbackNav, /to="\/manage"/)
  assert.match(notificationPage, /item\.kind === 'FEEDBACK_ASSIGNED' \? '\/feedback\/manage' : '\/feedback'/)
})
