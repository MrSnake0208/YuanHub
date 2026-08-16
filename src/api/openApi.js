// 第三方开放接口（Open API）封装 —— 对照 BackEndV3-Share 契约
// 用于管理「第三方 API Token」：生成 / 列举 / 删除，scope 权限区分只读与只写。
// 约定同 src/api/user.js：函数入参一律 camelCase，内部转 snake_case。
import { request } from './request.js'

// 权限列表（公开，无需登录）——返回可用 scope 及其描述
// 返回 [{ scope, description }]（后端字段为 snake_case）
export function getOpenApiPermissions() {
  return request('/user/open-api/permissions', { auth: false })
}

// 已生成的 Token 列表（需登录）
// 返回 [{ token, scope, remark, created_at }]（后端字段为 snake_case）
export function getOpenApiTokens() {
  return request('/user/open-api/tokens', { auth: true })
}

// 生成 Token（POST，需登录）——{ scope, remark }
export function generateOpenApiToken({ scope, remark }) {
  return request('/user/open-api/token', {
    method: 'POST',
    auth: true,
    body: { scope, remark }
  })
}

// 删除 Token（POST，需登录）——body 传 token 字符串
export function deleteOpenApiToken(token) {
  return request('/user/open-api/token/delete', {
    method: 'POST',
    auth: true,
    body: { token }
  })
}
