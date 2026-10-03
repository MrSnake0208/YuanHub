// auth 状态管理（Vue reactive 单例，无 pinia）
// - userInfo / accessToken / refreshToken
// - localStorage key 'yh_auth' 持久化
// - 方法均挂在 auth 对象上：auth.login() / auth.logout() / auth.refresh()
// - init() 启动时恢复；setTokens() 供登录/刷新成功后更新
//
// 职责分层（重要）：
// - auth.refresh() 只负责「用 refreshToken 换新 token」这一件事，成功返回 true。
//   它绝不能再隐式调用 refreshAdminAccess()：那会与调用方（例如 request.js 的 401
//   恢复、init() 的首屏恢复）正在等待的 refreshAdminAccess() 形成互相等待的死锁，
//   首次路由守卫便永远拿不到结果，用户只能看到 PWA 背景色。
// - 管理权限由真正需要它的调用方显式发起：登录成功后、管理员路由导航前、403 恢复时。
//
// 依赖关系：store/auth.js 依赖 api/user.js（接口），api/user.js 依赖 api/request.js，
// request.js 仅在运行时通过「动态 import」读取本模块，故无模块初始化循环。
import { reactive } from 'vue'
import { beta } from './beta.js'
import * as userApi from '../api/user.js'
import { getCurrentAdminAccess } from '../api/admin.js'
import { hasAnyAdminCapability } from '../utils/authPermissions.js'

const STORAGE_KEY = 'yh_auth'

// 从 localStorage 恢复初始状态
function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { userInfo: null, accessToken: '', refreshToken: '' }
    const parsed = JSON.parse(raw)
    return {
      userInfo: parsed.userInfo || null,
      accessToken: parsed.accessToken || '',
      refreshToken: parsed.refreshToken || ''
    }
  } catch (_e) {
    return { userInfo: null, accessToken: '', refreshToken: '' }
  }
}

const saved = loadSaved()
let adminAccessRequest = null
let initRequest = null
// token 刷新单飞：多个请求同时 401 时复用同一次刷新，避免并发消耗 refresh token。
let refreshRequest = null
let sessionGeneration = 0
const userId = () => String(auth.userInfo?.id || '')

function persist() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        userInfo: auth.userInfo,
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken
      })
    )
  } catch (_e) {
    // 隐私模式 / 配额不足时 localStorage 会抛错；登录态仍保留在内存中，不影响本次会话。
  }
}

export const auth = reactive({
  userInfo: saved.userInfo,
  accessToken: saved.accessToken,
  refreshToken: saved.refreshToken,
  adminAccess: null,
  adminAccessLoading: false,
  adminAccessLoaded: false,
  adminAccessError: '',
  // 仅当后端明确拒绝 refresh token（401/403）时为 true；超时/断网等临时失败不算。
  refreshRejected: false,
  get isLoggedIn() {
    return !!auth.accessToken
  },
  get isAdmin() {
    return hasAnyAdminCapability(auth.adminAccess)
  },

  // 登录：调接口成功后保存 token 与用户信息
  async login(email, password) {
    const data = await userApi.login({ email, password })
    sessionGeneration++
    clearAdminAccess()
    setTokens(data)
    auth.refreshRejected = false
    // 登录是「刚建立会话」的确定时刻，此时显式同步管理权限，不存在并发刷新。
    await auth.refreshAdminAccess({ suppressErrors: true })
    return data
  },

  // 静默刷新：成功返回 true 并更新 token；失败返回 false（调用方决定登出/跳转）。
  // 只做 token 刷新，不再牵连管理权限；并发调用共享同一次请求。
  async refresh() {
    if (!auth.refreshToken) {
      auth.refreshRejected = true
      return false
    }
    const token = auth.refreshToken, identity = userId(), generation = sessionGeneration
    if (refreshRequest?.token === token && refreshRequest.identity === identity && refreshRequest.generation === generation) return refreshRequest.promise
    const current = () => generation === sessionGeneration && identity === userId() && token === auth.refreshToken

    const pending = (async function () {
      try {
        const data = await userApi.refreshToken(token)
        if (!current()) return false
        setTokens(data)
        auth.refreshRejected = false
        return true
      } catch (error) {
        if (!current()) return false
        // 只有后端明确拒绝才算登录态失效；超时 / 断网不能把用户直接踢下线。
        auth.refreshRejected = !!(error && (error.status === 401 || error.status === 403))
        return false
      }
    })()
    const record = { token, identity, generation, promise: pending }
    refreshRequest = record
    try {
      return await pending
    } finally {
      if (refreshRequest === record) refreshRequest = null
    }
  },

  async refreshAdminAccess({ suppressErrors = false } = {}) {
    if (!auth.accessToken) {
      clearAdminAccess()
      return null
    }
    const identity = userId(), generation = sessionGeneration
    if (adminAccessRequest?.identity === identity && adminAccessRequest.generation === generation) return adminAccessRequest.promise
    const current = () => !!auth.accessToken && generation === sessionGeneration && identity === userId()

    auth.adminAccessLoading = true
    auth.adminAccessError = ''
    const pending = getCurrentAdminAccess()
      .then(function (access) {
        if (!current()) return null
        auth.adminAccess = access
        return access
      })
      .catch(function (error) {
        if (!current()) return null
        auth.adminAccess = null
        auth.adminAccessError = error && error.message ? error.message : '管理权限读取失败'
        if (!suppressErrors) throw error
        return null
      })
      .finally(function () {
        if (adminAccessRequest !== record) return
        auth.adminAccessLoading = false
        auth.adminAccessLoaded = true
        adminAccessRequest = null
      })
    const record = { identity, generation, promise: pending }
    adminAccessRequest = record
    return pending
  },

  // 登出：清空状态并跳转登录页
  async logout(destination = '/login') {
    sessionGeneration++
    auth.accessToken = ''
    auth.refreshToken = ''
    auth.userInfo = null
    auth.refreshRejected = false
    beta.setIdentity('')
    clearAdminAccess()
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (_e) {
      // 与 persist 同理：storage 不可用时不影响内存中的登出结果。
    }
    if (typeof location !== 'undefined') {
      location.href = destination
    }
  }
})

function clearAdminAccess() {
  auth.adminAccess = null
  auth.adminAccessLoading = false
  auth.adminAccessLoaded = false
  auth.adminAccessError = ''
  adminAccessRequest = null
}

// 用登录 / 刷新接口的 data 更新并持久化 token 与用户信息
export function setTokens(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('登录响应异常：缺少 token 数据')
  }
  const { token, refresh_token, user_info } = payload
  if (user_info && String(user_info.id || '') !== userId()) {
    sessionGeneration++
    clearAdminAccess()
  }
  auth.accessToken = token || ''
  auth.refreshToken = refresh_token || ''
  auth.userInfo = user_info || auth.userInfo || null
  beta.setIdentity(auth.userInfo?.id || '')
  persist()
  return auth
}

// 启动时恢复（已在模块加载时用 loadSaved 初始化，此处保证幂等并返回 auth）
//
// 首屏只保证「登录态」可用；管理权限改为后台加载：
// 它只是权限感知 UI（侧边栏入口、内测弹窗）的数据来源，绝不能让首次路由导航
// 等待 /v1/admin/access/me。管理员路由会在守卫里显式 await auth.refreshAdminAccess()，
// 因此不会因为这里的异步化造成权限绕过。
export function init() {
  if (initRequest) return initRequest
  initRequest = Promise.resolve()
    .then(function () {
      if (!auth.accessToken) return null
      void auth.refreshAdminAccess({ suppressErrors: true })
      return null
    })
    .then(function () { return auth })
  return initRequest
}

// 模块级具名导出（兼容旧调用方，如 IslandSidebar 的 logout as doLogout）
export async function login(email, password) {
  return auth.login(email, password)
}
export async function refresh() {
  return auth.refresh()
}
export async function logout(destination) {
  return auth.logout(destination)
}
