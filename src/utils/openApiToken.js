// 第三方 API Token 纯函数（scope 解析 + 描述映射 + 时间格式化）
// 从 profile.vue 抽离，便于单测与复用；无副作用、无依赖。

// 前端只向用户暴露权限预设，底层 scope 由预设统一维护。
export const OPEN_API_TOKEN_PRESETS = Object.freeze([
  Object.freeze({
    id: 'guangling-storehouse',
    name: '广陵库房',
    description: '库存读取、写入与导出',
    scopes: Object.freeze(['inventory:read', 'inventory:write', 'inventory:export'])
  })
])

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

// scope 顺序不影响预设匹配；只有集合完全一致时才视为该预设。
export function tokenPresetForScopes(scope, presets = OPEN_API_TOKEN_PRESETS) {
  const keys = Array.from(new Set(scopeKeys(scope))).sort()
  return presets.find(function (preset) {
    const presetKeys = Array.from(new Set(preset.scopes)).sort()
    return keys.length === presetKeys.length && keys.every(function (key, index) {
      return key === presetKeys[index]
    })
  }) || null
}

export function tokenPresetName(scope) {
  const preset = tokenPresetForScopes(scope)
  return preset ? preset.name : '其他权限'
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
