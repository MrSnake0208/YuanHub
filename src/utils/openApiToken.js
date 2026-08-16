// 第三方 API Token 纯函数（scope 解析 + 描述映射 + 时间格式化）
// 从 profile.vue 抽离，便于单测与复用；无副作用、无依赖。

// 后端 list() 返回的 scope 字段是权限 code 数组（如 [10001] 或 [10001,10002]），
// 但生成接口入参是单个 code（number）。统一归一为数组。
export function scopeCodes(scope) {
  if (Array.isArray(scope)) return scope
  if (scope == null) return []
  return [scope]
}

// 按 code 查描述：优先后端权限列表（{ key, code, desc }），
// 其次兜底映射，最后返回占位描述。
export function descByCode(code, permissions, fallback = {}) {
  const n = Number(code)
  const hit = permissions.find(function (p) { return Number(p.code) === n })
  if (hit && hit.desc) return hit.desc
  if (fallback[n]) return fallback[n]
  return '权限 ' + code
}

// 多个权限拼接描述（如「库存数据读取、库存数据写入」）
export function scopeDesc(scope, permissions, fallback = {}) {
  const codes = scopeCodes(scope)
  if (codes.length === 0) return '未知权限'
  return codes.map(function (c) { return descByCode(c, permissions, fallback) }).join('、')
}

// 是否「只读」token：scope 恰为单个 inventory:read(10001)
export function isReadonly(scope) {
  const codes = scopeCodes(scope)
  return codes.length === 1 && Number(codes[0]) === 10001
}

// 后端 create_time 为 epoch 毫秒，格式化为本地时间（无秒）
export function formatCreateTime(ms) {
  const n = Number(ms)
  if (!n || isNaN(n)) return ''
  const d = new Date(n)
  if (isNaN(d.getTime())) return ''
  const pad = function (x) { return String(x).padStart(2, '0') }
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}
