// 首屏启动反馈。
//
// 问题：首次路由导航被异步逻辑（登录态恢复、内测状态、API 请求）阻塞时，
// App.vue 的「路由切换」进度条不会出现（它只在真实路径切换时展示），
// 用户只能看到 PWA background_color + body 背景，看起来就是「网站卡死」。
//
// 方案：
// - index.html 内置一个极轻量的启动反馈（Logo + 正在加载… + 细进度条），
//   它的 CSS 自带 400ms 延迟淡入，所以快速启动时不会闪现；
// - 这里只负责在「首次导航真正完成」后立刻把它从 DOM 移除，不遮挡任何已渲染页面；
// - 不使用 setTimeout 硬等，只是监听 router 的首次导航结果。
export const STARTUP_SPLASH_ID = 'startup-splash'

function resolveDocument(doc) {
  if (doc) return doc
  return typeof document !== 'undefined' ? document : null
}

/** 移除启动反馈。返回是否真的移除了节点（幂等，可重复调用）。 */
export function removeStartupSplash(doc) {
  const target = resolveDocument(doc)
  if (!target || typeof target.getElementById !== 'function') return false
  const node = target.getElementById(STARTUP_SPLASH_ID)
  if (!node || !node.parentNode) return false
  node.parentNode.removeChild(node)
  return true
}

/**
 * 监听首次导航结果并结束启动反馈。
 * - 首次导航被守卫中止（failure 非空）时保留反馈：此时页面还没有内容，
 *   继续显示「正在启动」比回到空白背景更诚实。
 * - 返回 dispose 函数，便于测试与卸载时清理。
 */
export function watchStartupReadiness(router, doc) {
  const target = resolveDocument(doc)
  let settled = false
  function settle() {
    if (settled) return false
    settled = true
    return removeStartupSplash(target)
  }

  const stopAfterEach = router.afterEach(function (_to, _from, failure) {
    if (failure) return
    settle()
  })

  if (typeof router.isReady === 'function') {
    Promise.resolve(router.isReady()).then(settle, function () {})
  }

  return function dispose() {
    if (typeof stopAfterEach === 'function') stopAfterEach()
  }
}
