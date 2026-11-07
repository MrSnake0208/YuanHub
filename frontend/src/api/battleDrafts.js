import { request } from './request.js'

// 配队与操作图云草稿：按站点用户 + 游戏账号隔离，每个账号最多 5 份。
const base = '/v1/battle-drafts'
const options = (userId, extra = {}) => ({ auth: true, expectedUserId: userId, headers: { 'Cache-Control': 'no-cache' }, ...extra })
const scoped = (path, accountId) => `${path}?account_id=${encodeURIComponent(accountId)}`
const item = (id, accountId) => scoped(`${base}/${encodeURIComponent(id)}`, accountId)

export const listBattleDrafts = (userId, accountId) => request(scoped(base, accountId), options(userId))
export const getBattleDraft = (userId, accountId, id) => request(item(id, accountId), options(userId))
export const createBattleDraft = (userId, accountId, draft) => request(scoped(base, accountId), options(userId, { method: 'POST', body: { draft } }))
export const saveBattleDraft = (userId, accountId, id, revision, draft) => request(item(id, accountId), options(userId, { method: 'PUT', body: { revision, draft } }))
export const deleteBattleDraft = (userId, accountId, id) => request(item(id, accountId), options(userId, { method: 'DELETE' }))
