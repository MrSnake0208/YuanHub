// 库存（inventory）接口封装 —— 对照《5.1-库存数据交换协议-v1.md》《5.0-库存数据后端设计.md》
// 后端为 Spring Boot，BaseURL 见 src/api/request.js 的 API_BASE；
// 响应统一包 ApiResult{ status_code, message, data }，request() 成功时返回 data。
//
// Jackson SNAKE_CASE：请求/响应 JSON 字段均为 snake_case（entity_type、catalog_version、
// record_id、record_type、effective_at、snapshot_scope、history_only、superseded 等）。
// 约定同 src/api/ledger.js：函数入参一律 camelCase，内部转 snake_case。
import { request } from './request.js'

const PATH = '/v1/inventory'

// 对象目录（公开，无需登录）
// 返回 { format, version, catalog_version, entities: [{ entity_type, id, name }] }
export function getCatalog() {
  return request(PATH + '/catalog', { auth: false })
}

// 导入（POST，需登录）——body 为完整交换文档（snake_case 原样透传）
// 响应 { accepted, duplicates, history_only, superseded, warnings: [] }
export function importInventory(doc) {
  return request(PATH + '/import', {
    method: 'POST',
    auth: true,
    body: doc
  })
}

// 当前库存（GET，需登录）——entityType?：'item' | 'agent'
// 返回 { entity_type, entries: [{ id, name, count }] }
export function getCurrent({ entityType } = {}) {
  const params = new URLSearchParams()
  if (entityType != null && entityType !== '') params.set('entity_type', entityType)
  const qs = params.toString()
  return request(PATH + '/current' + (qs ? '?' + qs : ''), { auth: true })
}

// 时段获得量（GET，需登录）——{ entityType, from, to }
// 返回 { entity_type, from, to, entries: [{ id, name, count }] }
export function getAcquired({ entityType, from, to }) {
  const params = new URLSearchParams()
  if (entityType != null && entityType !== '') params.set('entity_type', entityType)
  if (from != null) params.set('from', from)
  if (to != null) params.set('to', to)
  const qs = params.toString()
  return request(PATH + '/acquired' + (qs ? '?' + qs : ''), { auth: true })
}

// 导出（GET，需登录）——{ include, from, to }
// include 逗号分隔枚举（current,rewards），返回完整交换文档
export function exportInventory({ include, from, to }) {
  const params = new URLSearchParams()
  if (include != null) params.set('include', include)
  if (from != null) params.set('from', from)
  if (to != null) params.set('to', to)
  const qs = params.toString()
  return request(PATH + '/export' + (qs ? '?' + qs : ''), { auth: true })
}
