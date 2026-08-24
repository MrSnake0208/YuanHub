// 第三方开放接口（Open API）封装 —— 对照 BackEndV3-Share 契约
// 用于管理「第三方 API Token」：生成 / 列举 / 更新权限 / 删除，scope 为稳定字符串 key 数组。
// 每个 token 绑定一个统一子账号（account_id，库存 × 密探共用），
// token 能访问哪些数据完全由 scopes 决定，可同时包含 inventory:* 与 operator:*。
// 约定同 src/api/user.js：函数入参一律 camelCase，内部转 snake_case。
import { request } from './request.js'

// 权限列表（公开，无需登录）——返回可用 scope 及其描述
// 返回 [{ scope, description }]（如 inventory:read / inventory:write / inventory:export）
export function getOpenApiPermissions() {
  return request('/user/open-api/permissions', { auth: false })
}

// 已生成的 Token 列表（需登录）
// 返回 [{ token_id, account_id, account_name, remark, scopes, created_at }]
// 注意：出于安全，列表不返回 token 明文（仅生成时一次性返回）。
export function getOpenApiTokens() {
  return request('/user/open-api/tokens', { auth: true })
}

// 生成 Token（POST，需登录）——{ accountId, scopes, remark }
// scopes 为字符串 key 数组（如 ['inventory:read']）；
// 返回 { token_id, token, account_id, account_name, remark, scopes, created_at }（token 仅此一次返回）。
export function generateOpenApiToken({ accountId, scopes, remark }) {
  return request('/user/open-api/token', {
    method: 'POST',
    auth: true,
    body: { account_id: accountId, scopes, remark }
  })
}

// 完整替换 Token 权限（PATCH，需登录）。Token 明文与绑定账号保持不变。
// 返回更新后的列表项，不包含 Token 明文。
export function updateOpenApiTokenScopes(tokenId, scopes) {
  return request('/user/open-api/tokens/' + encodeURIComponent(tokenId) + '/scopes', {
    method: 'PATCH',
    auth: true,
    body: { scopes }
  })
}

// 删除 Token（DELETE，需登录）——按 token_id 删除
export function deleteOpenApiToken(tokenId) {
  return request('/user/open-api/tokens/' + encodeURIComponent(tokenId), {
    method: 'DELETE',
    auth: true
  })
}
