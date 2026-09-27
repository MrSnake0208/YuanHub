// 首屏初始化分层回归（Case 3）：登录态恢复不得被管理权限接口阻塞。
//
// 背景：登录态（accessToken / refreshToken / userInfo）在 store/auth.js 模块加载期
// 已经同步从 localStorage 恢复；init() 只是幂等收口。因此 init() 不能 await
// /v1/admin/access/me —— 否则管理权限接口慢或挂起时，router.beforeEach 永远拿不到
// next()，用户只能看到 PWA 背景色（本次线上问题的主要表现）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { installAuthStorage } from '../test-support/authStorageFixture.js'
import { jsonResponse, delay, withDeadline } from '../test-support/fakeApiFetch.js'

const authStorage = installAuthStorage({
  accessToken: 'valid-access',
  refreshToken: 'refresh-1',
  userInfo: { id: 'u1', userName: 'tester' }
})
const { auth, init } = await import('../src/store/auth.js')

test('Case 3：管理权限接口挂起时，init() 仍应立即完成并同步给出登录态', async function () {
  const calls = []
  let releaseAdminAccess = null
  const previousFetch = globalThis.fetch
  globalThis.fetch = function (url) {
    const target = String(url)
    calls.push(target)
    if (target.indexOf('/v1/admin/access/me') >= 0) {
      return new Promise(function (resolve) {
        releaseAdminAccess = function () {
          resolve(jsonResponse({ status_code: 200, data: { roles: ['PLATFORM_ADMIN'], permissions: ['beta:manage'] } }))
        }
      })
    }
    throw new Error('unexpected request: ' + target)
  }

  try {
    const startedAt = Date.now()
    await withDeadline(init(), 2000, '首屏初始化')
    const elapsed = Date.now() - startedAt

    assert.ok(elapsed < 500, 'init() 不应等待管理权限接口，实际耗时 ' + elapsed + 'ms')
    // 登录态在模块加载期已经同步恢复，路由守卫无需等待任何请求即可判定
    assert.equal(auth.accessToken, 'valid-access')
    assert.equal(auth.userInfo.id, 'u1')

    // 后台仍应触发一次管理权限加载（保证侧边栏 / 内测弹窗的 isAdmin 语义不变）
    // 它属于「后台异步」，因此允许多等一两个事件循环，但不影响上面的首屏耗时断言。
    await delay(20)
    assert.equal(calls.filter(function (target) { return target.indexOf('/v1/admin/access/me') >= 0 }).length, 1)
    assert.equal(typeof releaseAdminAccess, 'function')
    releaseAdminAccess()
  } finally {
    globalThis.fetch = previousFetch
    authStorage.restore()
  }
})
