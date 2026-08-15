// 广陵账房「方案」接口封装（对照 BackEndV3-Share T2 契约 /hub/ledger/plan）
// 全部接口需登录：auth:true。入参一律 camelCase，内部转 snake_case 请求体。
// 成功后返回后端 data：
//   createPlan / updatePlan / getPlan  → LedgerPlanResponse（全量，含 cart_items + custom_packages）
//   listPlans                          → PlanListItemDto[]（轻量 + summary，不含大明细）
//   deletePlan                         → 详见 §3.4 边界（data 可能为 null）
import { request } from './request.js'

const PATH = '/hub/ledger/plan'

// 创建方案（POST）——返回全量快照，自定义礼包 id 以响应为准
export function createPlan({ name, version, exchangeRate, initialPoints, cartItems, customPackages }) {
  return request(PATH, {
    method: 'POST',
    auth: true,
    body: {
      name,
      version,
      exchange_rate: version === 'daihao' ? exchangeRate ?? null : null,
      initial_points: initialPoints || 0,
      cart_items: cartItems,          // [{ content_id, quantity, package_snapshot }]
      custom_packages: customPackages // [{ id, name, ... , price_usd|price_cny, sort_id, extra }]
    }
  })
}

// 整体替换更新（PUT {id}）——请求体同创建
export function updatePlan(id, { name, version, exchangeRate, initialPoints, cartItems, customPackages }) {
  return request(PATH + '/' + id, {
    method: 'PUT',
    auth: true,
    body: {
      name,
      version,
      exchange_rate: version === 'daihao' ? exchangeRate ?? null : null,
      initial_points: initialPoints || 0,
      cart_items: cartItems,
      custom_packages: customPackages
    }
  })
}

// 方案详情（GET {id}）——全量，用于加载完整状态
export function getPlan(id) {
  return request(PATH + '/' + id, { auth: true })
}

// 我的方案列表（GET /）——轻量字段 + summary，加载单方案前先 getPlan 拿明细
export function listPlans() {
  return request(PATH, { auth: true })
}

// 删除方案（DELETE {id}）——后端已定案返回 success(true)，data=true
// 历史注记：旧版后端可能返回 data 为 null，request() 会抛「返回数据为空」；如需兼容旧实现，
// 可改为 .catch 判断 /返回数据为空/ 视为成功，见 §3.4。
export function deletePlan(id) {
  return request(PATH + '/' + id, { method: 'DELETE', auth: true }) // data=true
}
