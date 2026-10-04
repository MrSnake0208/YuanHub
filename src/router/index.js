import { reactive } from 'vue'
import { beta } from '../store/beta.js'
import { recruitmentAccess } from '../store/recruitmentAccess.js'
import { betaLandingFor, safeBetaRedirect } from '../utils/betaAccess.js'
import { createRouter, createWebHistory } from 'vue-router'
import { routes } from './routes.js'
import { isFeatureEnabled } from '@/config/features.js'
import { auth, init as authInit } from '@/store/auth.js'
import { isRouteAccessAllowed, needsAdminAccess } from '@/utils/routeAccess.js'
import { isNavigationCancelled } from '@/utils/navigationCancellation.js'

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

// 首次导航前恢复登录态。
//
// authInit() 只保证「登录态」可用（模块加载期已同步从 localStorage 恢复），
// 管理权限是后台异步加载的，因此首次导航不会再被 /v1/admin/access/me 阻塞。
// 需要管理权限的路由在下面显式等待权限结果，不存在权限绕过。
let authReady = false
export async function authGuard(to, from, next) {
  if (!authReady) {
    await authInit()
    authReady = true
  }
  if (isNavigationCancelled(to)) return next(false)
  const authed = !!(auth.accessToken && auth.userInfo)
  const requiresAuth = to.meta && to.meta.requiresAuth
  const feature = to.meta && to.meta.feature

  if (feature && !isFeatureEnabled(feature)) {
    return next(to.meta.featureFallback || '/cart')
  }

  beta.setIdentity(authed ? auth.userInfo.id : '')
  recruitmentAccess.setIdentity(authed ? auth.userInfo.id : '')
  if (to.meta?.requiresBeta) {
    await beta.refresh()
    if (isNavigationCancelled(to)) return next(false)
    if (authed) {
      if (!beta.canUseBetaFeatures) return next(betaLandingFor(to.fullPath))
    } else if (beta.campaign?.accessMode !== 'OPEN' || beta.publicError) {
      return next(betaLandingFor(to.fullPath))
    }
  }
  if (requiresAuth && !authed) {
    // 未登录访问受保护页 → 去登录，带 redirect 回跳
    return next({ path: '/login', query: { redirect: to.fullPath } })
  }

  if (to.meta?.requiresRecruitmentAccess && authed) {
    await recruitmentAccess.refresh({ force: true })
    if (isNavigationCancelled(to)) return next(false)
    if (!recruitmentAccess.canAccess) {
      return next({ path: '/forbidden', query: { from: to.fullPath } })
    }
  }

  // 只有真正需要管理权限的路由才等待 /v1/admin/access/me。
  // 普通页面（/、/today、/cart…）不走这个分支，首屏不会被权限接口拖住。
  if (needsAdminAccess(to.meta)) {
    if (!isRouteAccessAllowed(to.meta, auth.adminAccess, auth.adminAccessError)) {
      // refreshAdminAccess 内部单飞：init() 已发起时这里只会复用同一个请求。
      await auth.refreshAdminAccess({ suppressErrors: true })
      if (isNavigationCancelled(to)) return next(false)
    }
    if (!isRouteAccessAllowed(to.meta, auth.adminAccess, auth.adminAccessError)) {
      return next({ path: '/forbidden', query: { from: to.fullPath } })
    }
  }

  const authPages = ['/login', '/register', '/forgot']
  if (authed && authPages.includes(to.path)) {
    // 已登录访问登录/注册/找回 → 回首页
    return next(safeBetaRedirect(to.query.redirect, '/beta'))
  }
  next()
}

router.beforeEach(authGuard)

router.afterEach((to) => {
  if (to.meta.title) document.title = to.meta.title
  finishRouteLoading(to)
})

router.onError(() => {
  finishRouteLoading(null, true)
})

export default router
