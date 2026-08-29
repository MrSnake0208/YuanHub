// 用户接口封装（对照 BackEndV3-Share 契约）
// 函数参数均为「普通对象（camelCase）」，内部转成后端约定的 snake_case 字段。
import { request } from './request.js'

// 登录（匿名）
export function login({ email, password }) {
  return request('/user/login', {
    method: 'POST',
    body: { email, password }
  })
}

// 注册（匿名）
export function register({ email, userName, password, registrationToken }) {
  return request('/user/register', {
    method: 'POST',
    body: {
      email,
      user_name: userName,
      password,
      registration_token: registrationToken
    }
  })
}

// 发送注册验证码（匿名）
export function sendRegistrationToken({ email }) {
  return request('/user/sendRegistrationToken', {
    method: 'POST',
    body: { email }
  })
}

// 发送重置密码验证码（公开）
export function sendResetVCode({ email }) {
  return request('/user/password/reset_request', {
    method: 'POST',
    body: { email }
  })
}

// 重置密码（公开）
export function resetPassword({ email, activeCode, password }) {
  return request('/user/password/reset', {
    method: 'POST',
    body: {
      email,
      active_code: activeCode,
      password
    }
  })
}

// 刷新 token（公开）
export function refreshToken(refreshToken) {
  return request('/user/refresh', {
    method: 'POST',
    body: { refresh_token: refreshToken }
  })
}

// 用户公开信息（公开）
export function getUserInfo(userId) {
  return request(`/user/info?userId=${encodeURIComponent(userId)}`)
}

// 修改密码（需登录）
export function updatePassword({ originalPassword, newPassword }) {
  return request('/user/update/password', {
    method: 'POST',
    auth: true,
    body: {
      original_password: originalPassword,
      new_password: newPassword
    }
  })
}

// 更新信息（需登录）
export function updateInfo({ userName }) {
  return request('/user/update/info', {
    method: 'POST',
    auth: true,
    body: { user_name: userName }
  })
}

function normalizeFeedbackAccessUser(user) {
  return {
    id: user.id || user.user_id,
    userName: user.userName || user.user_name || '',
    email: user.email || '',
    activated: user.activated ?? false
  }
}

// 反馈权限配置专用搜索，邮箱只对超级管理员端点返回。
export async function searchFeedbackAccessUsers({ q, page = 1, size = 10 }) {
  const params = new URLSearchParams()
  if (q != null && q.trim()) params.set('q', q.trim())
  params.set('page', String(page))
  params.set('size', String(size))
  const data = await request('/v1/admin/feedback-access/users?' + params.toString(), { auth: true })
  const users = Array.isArray(data)
    ? data
    : Array.isArray(data?.content)
      ? data.content
      : Array.isArray(data?.items)
        ? data.items
        : []
  return users.map(normalizeFeedbackAccessUser)
}

// 用户搜索（公开，size≤50）
export function searchUsers({ userName, page, size }) {
  const params = new URLSearchParams()
  if (userName != null && userName !== '') params.set('userName', userName)
  if (page != null) params.set('page', String(page))
  if (size != null) params.set('size', String(size))
  const qs = params.toString()
  return request(`/user/search${qs ? '?' + qs : ''}`)
}
