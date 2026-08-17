// 库存（inventory）接口封装 —— 对照《5.1-库存数据交换协议-v2.md》《5.0-库存数据后端设计.md》
// 后端为 Spring Boot，BaseURL 见 src/api/request.js 的 API_BASE；
// 响应统一包 ApiResult{ status_code, message, data }，request() 成功时返回 data。
// 例外：导出接口（exportInventory）直接返回完整交换文档（无 ApiResult 包装），故用 raw。
//
// Jackson SNAKE_CASE：请求/响应 JSON 字段均为 snake_case（entity_type、catalog_version、
// record_id、record_type、effective_at、snapshot_scope、account_id 等）。
// 约定同 src/api/ledger.js：函数入参一律 camelCase，内部转 snake_case。
import { request } from './request.js'

const PATH = '/v1/inventory'

// —— 库存子账号 ——

// 账号列表（需登录）
// 返回 [{ id, name, created_at, updated_at }]
export function listAccounts() {
  return request(PATH + '/accounts', { auth: true })
}

// 创建账号（POST，需登录）——body { name }
export function createAccount(name) {
  return request(PATH + '/accounts', {
    method: 'POST',
    auth: true,
    body: { name }
  })
}

// 改名（PATCH，需登录）——body { name }
export function renameAccount(accountId, name) {
  return request(PATH + '/accounts/' + encodeURIComponent(accountId), {
    method: 'PATCH',
    auth: true,
    body: { name }
  })
}

// 删除账号（DELETE，需登录）——级联删除该账号的库存、流水与 token
export function deleteAccount(accountId) {
  return request(PATH + '/accounts/' + encodeURIComponent(accountId), {
    method: 'DELETE',
    auth: true
  })
}

// 对象目录（公开，无需登录）
// 返回 { format, version, catalog_version, entities: [{ entity_type, id, name }] }
export function getCatalog() {
  return request(PATH + '/catalog', { auth: false })
}

// 导入（POST，需登录）——body 为完整交换文档 v2（snake_case 原样透传）
// 响应 { accepted, duplicates, history_only, superseded, warnings: [] }
export function importInventory(doc) {
  return request(PATH + '/import', {
    method: 'POST',
    auth: true,
    body: doc
  })
}

// 当前库存（GET，需登录）——accountId 必填；entityType?：'item' | 'agent'
// 返回 [{ entity_type, entries: { "<id>": { count, listed_baseline_at } } }]
export function getCurrent({ accountId, entityType } = {}) {
  const params = new URLSearchParams()
  if (accountId != null && accountId !== '') params.set('account_id', accountId)
  if (entityType != null && entityType !== '') params.set('entity_type', entityType)
  const qs = params.toString()
  return request(PATH + '/current' + (qs ? '?' + qs : ''), { auth: true })
}

// 时段获得量（GET，需登录）——{ accountId, entityType, from, to }
// from/to 为 RFC 3339 时刻（后端 OffsetDateTime）；返回 { entity_type, from, to, acquired: { "<id>": count } }
export function getAcquired({ accountId, entityType, from, to }) {
  const params = new URLSearchParams()
  if (accountId != null && accountId !== '') params.set('account_id', accountId)
  if (entityType != null && entityType !== '') params.set('entity_type', entityType)
  if (from != null) params.set('from', from)
  if (to != null) params.set('to', to)
  const qs = params.toString()
  return request(PATH + '/acquired' + (qs ? '?' + qs : ''), { auth: true })
}

// 导出（GET，需登录）——{ accountId?, scope?, include, from, to }
// 二选一：account_id（单账号）或 scope=all（全部账号）；include 为 current 或 current,rewards。
// 注意：后端导出接口直接返回交换文档（无 ApiResult 包装），故用 raw。
export function exportInventory({ accountId, scope, include, from, to }) {
  const params = new URLSearchParams()
  if (accountId != null && accountId !== '') params.set('account_id', accountId)
  if (scope != null && scope !== '') params.set('scope', scope)
  if (include != null) params.set('include', include)
  if (from != null) params.set('from', from)
  if (to != null) params.set('to', to)
  const qs = params.toString()
  return request(PATH + '/export' + (qs ? '?' + qs : ''), { auth: true, raw: true })
}

// 导入记录列表（GET，需登录）——{ accountId, entityType?, from?, to?, cursor?, limit? }，按 effective_at 倒序（游标分页）
// 返回 { items: [{ account_id, record_id, record_type, entity_type, acquisition_channel, effective_at, received_at, stock_effect, entries: [{ id, name, count }] }], next_cursor }
export function listRecords({ accountId, entityType, from, to, cursor, limit } = {}) {
  const params = new URLSearchParams()
  if (accountId != null && accountId !== '') params.set('account_id', accountId)
  if (entityType != null && entityType !== '') params.set('entity_type', entityType)
  if (from != null) params.set('from', from)
  if (to != null) params.set('to', to)
  if (cursor != null && cursor !== '') params.set('cursor', cursor)
  if (limit != null) params.set('limit', String(limit))
  const qs = params.toString()
  return request(PATH + '/records' + (qs ? '?' + qs : ''), { auth: true })
}

// 删除单条记录（DELETE，需登录）——删除后后端全量重放剩余记录重建库存
// 返回 true；不存在/越权抛 404
export function deleteRecord(recordId, accountId) {
  const params = new URLSearchParams()
  if (accountId != null && accountId !== '') params.set('account_id', accountId)
  const qs = params.toString()
  return request(PATH + '/records/' + encodeURIComponent(recordId) + (qs ? '?' + qs : ''), {
    method: 'DELETE',
    auth: true
  })
}
