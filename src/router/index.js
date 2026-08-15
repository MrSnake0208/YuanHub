import { createRouter, createWebHistory } from 'vue-router'
import { routes } from './routes.js'
import { auth, init as authInit } from '@/store/auth.js'

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (to.hash) return { el: to.hash, behavior: 'smooth', top: 0 }
    return savedPosition || { top: 0 }
  }
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

  if (requiresAuth && !authed) {
    // 未登录访问受保护页 → 去登录，带 redirect 回跳
    return next({ path: '/login', query: { redirect: to.fullPath } })
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
})

export default router
