// 统一子账号（库存 × 密探共用）接口封装 —— 对照 BackEndV3-Share 子账号统一迁移
// 后端迁移后，账号 CRUD 只保留这一套 /v1/accounts：
// - 一个子账号 = 一个游戏账号，库存、密探、特别关注全部共用同一批账号；
// - Token 不再分「库存/密探」两个账套，token 绑定这个共享子账号，
//   能访问哪些数据完全由 scopes 决定（可同时包含 inventory:* 与 operator:*）。
// - 旧地址 /v1/inventory/accounts、/v1/operator/accounts 已删除（返回 404）。
//
// 约定同 src/api/ledger.js：函数入参一律 camelCase，内部转 snake_case。
// 新版响应：
//   { "id": "acc_...", "name": "...", "game": "代号鸢|如鸢", "created_at": "...", "updated_at": "..." }
// 前端兼容尚未返回 game 的旧后端，直到账号版本迁移完成。
// id 就是 account_id，业务接口继续用该值传 account_id，无需任何迁移。
import { request } from './request.js'

const PATH = '/v1/accounts'

// 账号列表（需登录）——按创建时间升序
// 返回 [{ id, name, game, created_at, updated_at }]
export function listAccounts() {
  return request(PATH, { auth: true })
}

// 创建账号（POST，需登录）——body { name, game }
export function createAccount(name, game) {
  const body = { name }
  if (game) body.game = game
  return request(PATH, {
    method: 'POST',
    auth: true,
    body: body
  })
}

// 局部修改（PATCH，需登录）——body { name?, game? }
export function updateAccount(accountId, patch) {
  return request(PATH + '/' + encodeURIComponent(accountId), {
    method: 'PATCH',
    auth: true,
    body: patch
  })
}

export function renameAccount(accountId, name) {
  return updateAccount(accountId, { name })
}

export function updateAccountGame(accountId, game) {
  return updateAccount(accountId, { game })
}

// 删除账号（DELETE，需登录）——整账号级联删除：
// 该账号的库存数据、密探数据、特别关注与全部 API Token 一并清除，不可恢复。
export function deleteAccount(accountId) {
  return request(PATH + '/' + encodeURIComponent(accountId), {
    method: 'DELETE',
    auth: true
  })
}
