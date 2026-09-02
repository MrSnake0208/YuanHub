export const ADMIN_PERMISSIONS = Object.freeze({
  OPERATOR_CATALOG_WRITE: 'operator_catalog:write',
  ROLE_MANAGE: 'admin:role:manage',
  FEEDBACK_ACCESS_MANAGE: 'admin:feedback_access:manage',
  AUDIT_READ: 'admin:audit:read'
})

export const ADMIN_ROLES = Object.freeze(['PLATFORM_ADMIN', 'SUPER_ADMIN'])
export const FEEDBACK_AREAS = Object.freeze([
  'INVENTORY',
  'OPERATOR',
  'LEDGER',
  'PLAZA',
  'ACCOUNT',
  'UI',
  'OTHER'
])

function uniqueStrings(value) {
  if (!Array.isArray(value) && !(value instanceof Set)) return []
  return Array.from(new Set(Array.from(value).filter(function (item) {
    return typeof item === 'string' && item.length > 0
  })))
}

function firstPermissionCollection(...values) {
  const collections = values.filter(function (value) {
    return Array.isArray(value) || value instanceof Set
  })
  return collections.find(function (value) {
    return value.length > 0 || value.size > 0
  }) || collections[0] || []
}

export function emptyAdminAccess() {
  return {
    roles: [],
    permissions: [],
    receiveAreas: [],
    manageAreas: [],
    superAdmin: false
  }
}

export function normalizeAdminAccess(value) {
  if (!value || typeof value !== 'object') return emptyAdminAccess()
  return {
    roles: uniqueStrings(value.roles),
    permissions: uniqueStrings(value.permissions),
    receiveAreas: uniqueStrings(firstPermissionCollection(
      value.receiveCategories,
      value.receive_categories,
      value.receiveAreas,
      value.receive_areas
    )),
    manageAreas: uniqueStrings(firstPermissionCollection(
      value.manageCategories,
      value.manage_categories,
      value.manageAreas,
      value.manage_areas
    )),
    superAdmin: value.superAdmin === true || value.super_admin === true
  }
}

export function hasPermission(access, permission) {
  return access && Array.isArray(access.permissions)
    ? access.permissions.includes(permission)
    : false
}

export function canManageAnyFeedback(access) {
  return !!(access && Array.isArray(access.manageAreas) && access.manageAreas.length > 0)
}

export function canManageFeedbackArea(access, area) {
  return !!(area && access && Array.isArray(access.manageAreas) && access.manageAreas.includes(area))
}

export function hasAnyAdminCapability(access) {
  return !!(
    access &&
    ((Array.isArray(access.permissions) && access.permissions.length > 0) || canManageAnyFeedback(access))
  )
}
