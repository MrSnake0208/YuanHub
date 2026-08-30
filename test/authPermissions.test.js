import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ADMIN_PERMISSIONS,
  canManageAnyFeedback,
  canManageFeedbackArea,
  hasAnyAdminCapability,
  hasPermission,
  normalizeAdminAccess
} from '../src/utils/authPermissions.js'

test('normalizes the server admin access response without JWT authorities', function () {
  assert.deepEqual(normalizeAdminAccess({
    roles: ['SUPER_ADMIN'],
    permissions: ['operator_catalog:write', 'operator_catalog:write'],
    receive_areas: ['INVENTORY'],
    manage_areas: ['OPERATOR'],
    super_admin: true
  }), {
    roles: ['SUPER_ADMIN'],
    permissions: ['operator_catalog:write'],
    receiveAreas: ['INVENTORY'],
    manageAreas: ['OPERATOR'],
    superAdmin: true
  })
})

test('checks concrete permissions and feedback management areas', function () {
  const access = normalizeAdminAccess({
    permissions: [ADMIN_PERMISSIONS.OPERATOR_CATALOG_WRITE],
    manageAreas: ['OPERATOR']
  })
  assert.equal(hasPermission(access, ADMIN_PERMISSIONS.OPERATOR_CATALOG_WRITE), true)
  assert.equal(hasPermission(access, ADMIN_PERMISSIONS.ROLE_MANAGE), false)
  assert.equal(canManageAnyFeedback(access), true)
  assert.equal(canManageFeedbackArea(access, 'OPERATOR'), true)
  assert.equal(canManageFeedbackArea(access, 'INVENTORY'), false)
  assert.equal(hasAnyAdminCapability(access), true)
})

test('treats missing access as having no management capability', function () {
  assert.equal(hasPermission(undefined, ADMIN_PERMISSIONS.AUDIT_READ), false)
  assert.equal(canManageAnyFeedback(undefined), false)
  assert.equal(hasAnyAdminCapability(normalizeAdminAccess(null)), false)
})
