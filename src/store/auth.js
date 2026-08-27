// auth 状态管理（Vue reactive 单例，无 pinia）
// - userInfo / accessToken / refreshToken
// - localStorage key 'yh_auth' 持久化
// - 方法均挂在 auth 对象上：auth.login() / auth.logout() / auth.refresh()
// - init() 启动时恢复；setTokens() 供登录/刷新成功后更新
//
// 依赖关系：store/auth.js 依赖 api/user.js（接口），api/user.js 依赖 api/request.js，
// request.js 仅在运行时通过「动态 import」读取本模块，故无模块初始化循环。
import { reactive } from 'vue'
import * as userApi from '../api/user.js'
import { isAdminAccessToken } from '../utils/authPermissions.js'

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

function persist() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      userInfo: auth.userInfo,
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken
    })
  )
}

export const auth = reactive({
  userInfo: saved.userInfo,
  accessToken: saved.accessToken,
  refreshToken: saved.refreshToken,
  get isLoggedIn() {
    return !!auth.accessToken
  },
  get isAdmin() {
    return isAdminAccessToken(auth.accessToken)
  },

  // 登录：调接口成功后保存 token 与用户信息
  async login(email, password) {
    const data = await userApi.login({ email, password })
    setTokens(data)
    return data
  },

  // 静默刷新：成功返回 true 并更新 token；失败返回 false（调用方决定登出/跳转）
  async refresh() {
    if (!auth.refreshToken) return false
    try {
      const data = await userApi.refreshToken(auth.refreshToken)
      setTokens(data)
      return true
    } catch (_e) {
      return false
    }
  },

  // 登出：清空状态并跳转登录页
  async logout() {
    auth.accessToken = ''
    auth.refreshToken = ''
    auth.userInfo = null
    localStorage.removeItem(STORAGE_KEY)
    if (typeof location !== 'undefined') {
      location.href = '/login'
    }
  }
})

// 用登录 / 刷新接口的 data 更新并持久化 token 与用户信息
export function setTokens(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('登录响应异常：缺少 token 数据')
  }
  const { token, refresh_token, user_info } = payload
  auth.accessToken = token || ''
  auth.refreshToken = refresh_token || ''
  auth.userInfo = user_info || auth.userInfo || null
  persist()
  return auth
}

// 启动时恢复（已在模块加载时用 loadSaved 初始化，此处保证幂等并返回 auth）
export function init() {
  return auth
}

// 模块级具名导出（兼容旧调用方，如 IslandSidebar 的 logout as doLogout）
export async function login(email, password) {
  return auth.login(email, password)
}
export async function refresh() {
  return auth.refresh()
}
export async function logout() {
  return auth.logout()
}
