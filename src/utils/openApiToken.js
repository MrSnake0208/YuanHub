// 第三方 API Token 纯函数（scope 解析 + 描述映射 + 时间格式化）
// 从 profile.vue 抽离，便于单测与复用；无副作用、无依赖。

// 后端 scopes 字段为稳定字符串 key 数组（如 ['inventory:read'] 或
// ['inventory:read','inventory:export']），此处统一归一为数组。
export function scopeKeys(scope) {
  if (Array.isArray(scope)) return scope
  if (scope == null || scope === '') return []
  return [scope]
}

// MaaYuan 当前实际使用的最小权限：单向上传库存 + 密探自动采集。
// 查询 Token 绑定账号只要求 Token 有效，不需要额外 read 权限。
export const MAAYUAN_REQUIRED_SCOPES = Object.freeze([
  'inventory:write',
  'operator:scan:write'
])

export function hasEveryScope(scope, required) {
  const current = new Set(scopeKeys(scope))
  return scopeKeys(required).every(function (key) { return current.has(key) })
}

// 为现有连接补权限时保留原有顺序和能力，避免完整替换接口误删其他用途。
export function mergeScopes(scope, additions) {
  return Array.from(new Set(scopeKeys(scope).concat(scopeKeys(additions))))
}
// 按 key 查描述：优先后端权限列表（{ scope, description }），
// 其次兜底映射，最后返回 key 本身。
export function descByKey(key, permissions, fallback = {}) {
  const hit = permissions.find(function (p) { return p.scope === key })
  if (hit && hit.description) return hit.description
  if (fallback[key]) return fallback[key]
  return key
}

// 多个权限拼接描述（如「库存数据读取、库存数据写入」）
export function scopeDesc(scope, permissions, fallback = {}) {
  const keys = scopeKeys(scope)
  if (keys.length === 0) return '未知权限'
  return keys.map(function (k) { return descByKey(k, permissions, fallback) }).join('、')
}

// 是否「只读」token：scope 恰为单个 read（库存或密探）
export function isReadonly(scope) {
  const keys = scopeKeys(scope)
  return keys.length === 1 && (keys[0] === 'inventory:read' || keys[0] === 'operator:read')
}

// 是否「只写」token：scope 恰为单个 write（库存或密探）
export function isWriteonly(scope) {
  const keys = scopeKeys(scope)
  return keys.length === 1 && (keys[0] === 'inventory:write' || keys[0] === 'operator:write')
}

// 判断单个 scope key 属于哪个业务域
export function isInventoryScope(key) {
  return String(key || '').startsWith('inventory:')
}

export function isOperatorScope(key) {
  return String(key || '').startsWith('operator:')
}

// 根据 scope（数组或单字符串）判断 token 所属域：
// 全部为库存权限 → 'inventory'；全部为密探权限 → 'operator'；
// 空 → ''；混用 → 'mixed'（子账号统一后后端允许混用，生成「双域 Token」，
// 前端据此推导「库存 Token / 密探 Token / 双域 Token」标签，不再按账号域猜测）。
export function scopeDomain(scope) {
  const keys = scopeKeys(scope)
  if (keys.length === 0) return ''
  const inventoryCount = keys.filter(isInventoryScope).length
  const operatorCount = keys.filter(isOperatorScope).length
  if (inventoryCount === keys.length) return 'inventory'
  if (operatorCount === keys.length) return 'operator'
  return 'mixed'
}

// 内置权限兜底描述（后端权限列表不可用或离线时使用）
export const FALLBACK_DESCRIPTIONS = {
  'inventory:read': '库存数据读取（只读）',
  'inventory:write': '库存数据写入（只写）',
  'inventory:export': '库存数据导出',
  'operator:read': '密探数据读取（只读）',
  'operator:write': '密探数据写入（只写）',
  'operator:export': '密探数据导出',
  'operator:scan:write': '密探自动采集写入'
}

// 后端 created_at 为 ISO-8601 字符串（Instant），格式化为本地时间（无秒）。
// 兼容 epoch 毫秒数字输入。
export function formatCreateTime(value) {
  if (value == null || value === '') return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return ''
  const pad = function (x) { return String(x).padStart(2, '0') }
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}
