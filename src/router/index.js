import { reactive } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { routes } from './routes.js'
import { isFeatureEnabled } from '@/config/features.js'
import { auth, init as authInit } from '@/store/auth.js'
import { canManageAnyFeedback, hasAnyAdminCapability, hasPermission } from '@/utils/authPermissions.js'

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (to.hash) return { el: to.hash, behavior: 'smooth', top: 0 }
    return savedPosition || { top: 0 }
  }
})

// 全站路由加载状态：仅真实路径切换时展示，初次进入及 query/hash 更新不打断用户。
export const routeLoadingState = reactive({ active: false })
const trackedNavigations = new WeakSet()
let pendingNavigations = 0
let loadingStartedAt = 0
let loadingEndTimer = null

function beginRouteLoading(to, from) {
  if (!from.matched.length || to.path === from.path) return
  trackedNavigations.add(to)
  pendingNavigations += 1
  if (loadingEndTimer) clearTimeout(loadingEndTimer)
  if (!routeLoadingState.active) loadingStartedAt = Date.now()
  routeLoadingState.active = true
}

function finishRouteLoading(to, force = false) {
  if (force) {
    pendingNavigations = 0
  } else {
    if (!trackedNavigations.has(to)) return
    trackedNavigations.delete(to)
    pendingNavigations = Math.max(0, pendingNavigations - 1)
    if (pendingNavigations > 0) return
  }

  const elapsed = Date.now() - loadingStartedAt
  const delay = Math.max(140, 280 - elapsed)
  if (loadingEndTimer) clearTimeout(loadingEndTimer)
  loadingEndTimer = setTimeout(() => {
    if (pendingNavigations === 0) routeLoadingState.active = false
  }, delay)
}

// 放在权限守卫前面，让异步登录态恢复和懒加载组件都能获得即时反馈。
router.beforeEach((to, from) => {
  beginRouteLoading(to, from)
})

// 首次导航前恢复登录态（async init 保证刷新页面后登录态已还原再判守卫）
let authReady = false
router.beforeEach(async (to, from, next) => {
  if (!authReady) {
    await authInit()
    authReady = true
  }
  const authed = !!(auth.accessToken && auth.userInfo)
  const requiresAuth = to.meta && to.meta.requiresAuth
  const requiredPermission = to.meta && to.meta.requiredPermission
  const requiresFeedbackManage = to.meta && to.meta.requiresFeedbackManage
  const requiresManagement = to.meta && to.meta.requiresManagement
  const feature = to.meta && to.meta.feature

  if (feature && !isFeatureEnabled(feature)) {
    return next(to.meta.featureFallback || '/cart')
  }

  if (requiresAuth && !authed) {
    // 未登录访问受保护页 → 去登录，带 redirect 回跳
    return next({ path: '/login', query: { redirect: to.fullPath } })
  }
  if (requiredPermission && !hasPermission(auth.adminAccess, requiredPermission)) {
    return next({ path: '/forbidden', query: { from: to.fullPath } })
  }
  if (requiresFeedbackManage && !canManageAnyFeedback(auth.adminAccess)) {
    return next({ path: '/forbidden', query: { from: to.fullPath } })
  }
  // Keep authenticated users on the workbench when access lookup fails so the
  // page can show the failure state instead of mislabeling it as forbidden.
  if (requiresManagement && !auth.adminAccessError && !hasAnyAdminCapability(auth.adminAccess)) {
    return next({ path: '/forbidden', query: { from: to.fullPath } })
  }
  const authPages = ['/login', '/register', '/forgot']
  if (authed && authPages.includes(to.path)) {
    // 已登录访问登录/注册/找回 → 回首页
    return next('/')
  }
  next()
})

router.afterEach((to) => {
  if (to.meta.title) document.title = to.meta.title
  finishRouteLoading(to)
})

router.onError(() => {
  finishRouteLoading(null, true)
})

export default router
