// 路由权限判定（纯函数，供 router 守卫与测试共用）。
//
// 分层原则（对应本次冷启动修复）：
// - 登录态（accessToken / refreshToken / userInfo）在 store/auth.js 模块加载期
//   已同步从 localStorage 恢复，首次导航无需任何网络请求即可判定。
// - 管理权限（/v1/admin/access/me）只在「真正需要管理员权限」的路由上才等待，
//   普通页面首屏不等待，避免权限接口慢或挂起时整站白屏。
//
// 这里只做纯判定，不发起请求、不修改 store，避免在 Router 层复制一套 auth/request 逻辑。
import { canManageAnyFeedback, hasAnyAdminCapability, hasPermission } from './authPermissions.js'

/**
 * 该路由是否必须先拿到管理权限结果才能决定导航。
 * 普通页面（/、/today、/cart…）返回 false。
 */
export function needsAdminAccess(meta) {
  if (!meta || typeof meta !== 'object') return false
  if (typeof meta.requiredPermission === 'string' && meta.requiredPermission) return true
  if (Array.isArray(meta.requiredAnyPermission) && meta.requiredAnyPermission.length > 0) return true
  if (meta.requiresFeedbackManage === true) return true
  if (meta.requiresAdmin === true) return true
  if (meta.requiresManagement === true) return true
  return false
}

/**
 * 纯判定：在已有（或刚拉取到的）管理权限下，该路由是否允许进入。
 * 判定顺序与旧守卫保持一致，任一权限命中即可。
 *
 * adminAccessError 非空时，requiresManagement（/manage）允许进入，
 * 以便工作台自己展示「权限读取失败」而不是被误判为越权。
 */
export function isRouteAccessAllowed(meta, adminAccess, adminAccessError = '') {
  if (!meta || typeof meta !== 'object') return true
  if (typeof meta.requiredPermission === 'string' && meta.requiredPermission) {
    if (!hasPermission(adminAccess, meta.requiredPermission)) return false
  }
  if (Array.isArray(meta.requiredAnyPermission) && meta.requiredAnyPermission.length > 0) {
    const matched = meta.requiredAnyPermission.some(function (permission) {
      return hasPermission(adminAccess, permission)
    })
    if (!matched) return false
  }
  if (meta.requiresFeedbackManage === true && !canManageAnyFeedback(adminAccess)) return false
  if (meta.requiresAdmin === true && !hasAnyAdminCapability(adminAccess)) return false
  if (meta.requiresManagement === true) {
    // 权限读取失败时仍然放行，页面自行展示失败态（保持既有产品语义）。
    if (!hasAnyAdminCapability(adminAccess) && !adminAccessError) return false
  }
  return true
}
