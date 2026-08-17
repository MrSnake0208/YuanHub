// 第三方 API Token 纯函数（scope 解析 + 描述映射 + 时间格式化）
// 从 profile.vue 抽离，便于单测与复用；无副作用、无依赖。

// 后端 scopes 字段为稳定字符串 key 数组（如 ['inventory:read'] 或
// ['inventory:read','inventory:export']），此处统一归一为数组。
export function scopeKeys(scope) {
  if (Array.isArray(scope)) return scope
  if (scope == null || scope === '') return []
  return [scope]
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

// 是否「只读」token：scope 恰为单个 inventory:read
export function isReadonly(scope) {
  const keys = scopeKeys(scope)
  return keys.length === 1 && keys[0] === 'inventory:read'
}

// 是否「只写」token：scope 恰为单个 inventory:write
export function isWriteonly(scope) {
  const keys = scopeKeys(scope)
  return keys.length === 1 && keys[0] === 'inventory:write'
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
