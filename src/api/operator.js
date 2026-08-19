// 密探（operator）接口封装 —— 对照 BackEndV3-Share 最新 commit ed5347a
// 后端为 Spring Boot，全局 Jackson SNAKE_CASE：
// - 请求/响应 JSON 字段均为 snake_case（account_id、full_baseline_at、
//   snapshot_scope、effective_at、snapshot_effect 等）；
// - 交换协议 v2 为 myshare-operator-exchange，record 自带 account_id。
//
// 约定同 src/api/inventory.js：函数入参一律 camelCase，内部转 snake_case；
// 导出接口与库存一致直接返回完整交换文档（无 ApiResult 包装），故用 raw。
import { request } from './request.js'

const PATH = '/v1/operator'

// —— 统一子账号（库存 × 密探共用） ——
// 账号 CRUD 已统一到 /v1/accounts（见 src/api/accounts.js）。
// 这里以 Operator* 别名导出（兼容既有调用方），实现上与库存页共用同一批子账号。
export {
  listAccounts as listOperatorAccounts,
  createAccount as createOperatorAccount,
  renameAccount as renameOperatorAccount,
  deleteAccount as deleteOperatorAccount
} from './accounts.js'

// —— 密探公开目录 ——

// 密探图鉴（公开，无需登录）
// 返回 { format, version, catalog_version, operators: [{ id, name, alias,
//   rarity, prof, sub_prof?, games, discs, star_stones? }] }
export function getOperatorCatalog() {
  return request(PATH + '/catalog', { auth: false })
}

// —— 个人密探数据 ——

// 导入（POST，需登录）——body 为完整交换文档 v2（snake_case 原样透传）
// 响应 { accepted, duplicates, superseded, warnings: [] }
export function importOperator(doc) {
  return request(PATH + '/import', {
    method: 'POST',
    auth: true,
    body: doc
  })
}

// 当前养成（GET，需登录）——accountId 必填；game?：如鸢/代号鸢/不传=全部
// 返回 [{ user_id, account_id, game, full_baseline_at,
//   entries: { "<char_id>": { elite, star_level, level, discs, star_stones,
//     listed_baseline_at } }, updated_at }]
export function getOperatorCurrent({ accountId, game } = {}) {
  const params = new URLSearchParams()
  if (accountId != null && accountId !== '') params.set('account_id', accountId)
  if (game != null && game !== '') params.set('game', game)
  const qs = params.toString()
  return request(PATH + '/current' + (qs ? '?' + qs : ''), { auth: true })
}

// 导入记录列表（GET，需登录）——{ accountId, game?, cursor?, limit? }
// 返回 { items: [{ account_id, record_id, record_type, game, snapshot_scope,
//   effective_at, received_at, snapshot_effect, entries }], next_cursor }
export function listOperatorRecords({ accountId, game, cursor, limit } = {}) {
  const params = new URLSearchParams()
  if (accountId != null && accountId !== '') params.set('account_id', accountId)
  if (game != null && game !== '') params.set('game', game)
  if (cursor != null && cursor !== '') params.set('cursor', cursor)
  if (limit != null) params.set('limit', String(limit))
  const qs = params.toString()
  return request(PATH + '/records' + (qs ? '?' + qs : ''), { auth: true })
}

// 删除单条记录（DELETE，需登录）——删除后后端重放剩余记录重建养成状态
export function deleteOperatorRecord(recordId, accountId) {
  const params = new URLSearchParams()
  if (accountId != null && accountId !== '') params.set('account_id', accountId)
  const qs = params.toString()
  return request(PATH + '/records/' + encodeURIComponent(recordId) + (qs ? '?' + qs : ''), {
    method: 'DELETE',
    auth: true
  })
}

// 导出（GET，需登录）——{ accountId?, scope? }
// 二选一：account_id（单账号）或 scope=all（全部账号）。
// 直接返回 v2 交换文档（无 ApiResult 包装），故用 raw。
export function exportOperator({ accountId, scope } = {}) {
  const params = new URLSearchParams()
  if (accountId != null && accountId !== '') params.set('account_id', accountId)
  if (scope != null && scope !== '') params.set('scope', scope)
  const qs = params.toString()
  return request(PATH + '/export' + (qs ? '?' + qs : ''), { auth: true, raw: true })
}

// —— 密探公共图鉴管理（仅管理员，/v1/admin/operator-catalog） ——
// 管理的是「公共图鉴背后的全局字典」（有哪些密探、长什么样），
// 与个人子账号的养成档案严格分离。
const ADMIN_PATH = '/v1/admin/operator-catalog'

// 管理员全量列表（含内部字段 star_stones / catalog_version / created_at）
// 返回 [{ id, name, alias, rarity, prof, sub_prof, games, discs, star_stones,
//   sp_of, catalog_version, created_at }]
export function listAdminOperatorCatalog() {
  return request(ADMIN_PATH, { auth: true })
}

// 新增密探目录（body 字段：subProf / starStones / spOf 用 camelCase；
// discs 条目用 ot_name，与后端 OperatorCatalogWriteRequest 契约一致）
export function createAdminOperatorCatalog(entry) {
  return request(ADMIN_PATH, { method: 'POST', auth: true, body: entry })
}

// 更新密探目录（path id 与 body id 必须一致）
export function updateAdminOperatorCatalog(operatorId, entry) {
  return request(ADMIN_PATH + '/' + encodeURIComponent(operatorId), {
    method: 'PUT',
    auth: true,
    body: entry
  })
}

// 删除密探目录
export function deleteAdminOperatorCatalog(operatorId) {
  return request(ADMIN_PATH + '/' + encodeURIComponent(operatorId), {
    method: 'DELETE',
    auth: true
  })
}

// 上传/替换密探头像（multipart，仅管理员）——上传即存、即时生效。
// file 为 File/Blob；成功后返回更新后的目录条目（含 avatar 相对路径）。
export function uploadAdminOperatorAvatar(operatorId, file) {
  const form = new FormData()
  form.append('file', file)
  return request(ADMIN_PATH + '/' + encodeURIComponent(operatorId) + '/avatar', {
    method: 'PUT',
    auth: true,
    multipart: true,
    body: form
  })
}

// 删除密探头像（仅管理员）——移除磁盘文件并置空字典字段
export function deleteAdminOperatorAvatar(operatorId) {
  return request(ADMIN_PATH + '/' + encodeURIComponent(operatorId) + '/avatar', {
    method: 'DELETE',
    auth: true
  })
}