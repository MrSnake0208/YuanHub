// 密探 属性(prof) / 从属(subProf) 匹配与选项推导 —— operator 页 / quick 页共用
// ------------------------------------------------------------
// 数据形态兼容（目录归一化前后与本地兜底均覆盖）：
//   prof：字符串（"阳"）或 "、" 拼接的多值（"阳、阴"）
//   subProf：字符串（"神纪"）或数组（["神纪","破军"]）或后端 snake_case 的 sub_prof
// 语义：属性与从属多个条件同时存在时按 AND 组合，"all" 视为不过滤。
//
// 从属的「存储 code → 展示名」归一：后端目录以拼音 code 存储 sub_prof
// （shenji/guidao/pojun/qihuang/longdun，见 /operator/admin 管理端），
// 本地兜底目录用中文（神纪/诡道/破军/岐黄/龙盾）。
// subProfList 统一在此把 code 归一到中文，保证筛选与选项在两种数据源下一致。

const SUB_PROF_LABELS = {
  shenji: '神纪',
  guidao: '诡道',
  pojun: '破军',
  qihuang: '岐黄',
  longdun: '龙盾'
}

// 单个从属值 → 展示名（未知 code 原样返回，中文直接透传）
export function canonicalSubProf(s) {
  if (s == null) return ''
  const t = String(s).trim()
  return SUB_PROF_LABELS[t] || t
}

// 把某个密探的 subProf 归一化为字符串数组（空 → []）
export function subProfList(op) {
  const raw = op && (op.subProf || op.sub_prof)
  if (!raw) return []
  const arr = Array.isArray(raw) ? raw : String(raw).split(/[、，,]/)
  return arr.map(function (s) { return canonicalSubProf(s) }).filter(Boolean)
}

// 按 、/，切分为数组（用于 prof 等多值字符串）
export function tokens(v) {
  if (v == null) return []
  return String(v).split(/[、，,]/).map(function (s) { return s.trim() }).filter(Boolean)
}

// 属性 + 从属 AND 匹配；prof/subProf 传 'all' 或空值 = 该维度不过滤
export function matchesProfSubFilter(op, prof, subProf) {
  if (prof && prof !== 'all') {
    const profs = tokens(op && op.prof)
    if (profs.indexOf(prof) === -1) return false
  }
  if (subProf && subProf !== 'all') {
    const list = subProfList(op)
    if (list.indexOf(subProf) === -1) return false
  }
  return true
}

// 从目录数据去重推导从属选项（保持首次出现顺序），新增从属无需改代码
export function subProfOptions(ops) {
  const seen = new Set()
  const out = []
  ;(ops || []).forEach(function (op) {
    subProfList(op).forEach(function (s) {
      if (!seen.has(s)) { seen.add(s); out.push(s) }
    })
  })
  return out
}
