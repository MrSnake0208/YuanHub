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

// 密探目录 id 的末段是稳定拼音 slug（如 char_001_yangxiu）。搜索时同时兼容：
// - 中文名 / 属性 / 从属
// - 完整拼音或带空格拼音（yangxiu / yang xiu）
// - 从首字母输入习惯产生的有序缩写（yx / ssx）
// 后端若后续直接提供 pinyin 字段，也会优先一并纳入，无需修改调用方。
function compactLatin(value) {
  return String(value || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function isOrderedAbbreviation(query, source) {
  if (!query || !source || query[0] !== source[0]) return false
  let cursor = 0
  for (const character of source) {
    if (character === query[cursor]) cursor += 1
    if (cursor === query.length) return true
  }
  return false
}

export function operatorPinyinTokens(entry) {
  if (!entry) return []
  const idPinyin = String(entry.id || '').match(/^char_\d+_(.+)$/i)?.[1] || ''
  return [...new Set([entry.pinyin, entry.namePinyin, entry.name_pinyin, entry.romanizedName, idPinyin]
    .map(compactLatin)
    .filter(Boolean))]
}

export function matchesOperatorSearch(entry, rawQuery) {
  const query = String(rawQuery || '').trim().toLowerCase()
  if (!query) return true

  const directText = [entry?.name, entry?.id, entry?.prof, entry?.subProf, entry?.sub_prof]
    .flatMap(value => Array.isArray(value) ? value : [value])
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  if (directText.includes(query)) return true

  const latinQuery = compactLatin(query)
  if (!latinQuery || !/^[a-z]/.test(latinQuery)) return false
  return operatorPinyinTokens(entry).some(token => token.includes(latinQuery) || isOrderedAbbreviation(latinQuery, token))
}

// starLevel=0 是协议中的“未拥有”。等级、修为可能由 SP 本体同步，不能作为拥有依据。
export function isOperatorOwned(entry) {
  if (!entry) return false
  const starLevel = entry.starLevel != null ? entry.starLevel : entry.star_level
  return Number(starLevel) > 0
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

// 品质（原“稀有度”）共用选项：按品质从高到低排列。
// 图鉴 / 当前养成 / 快捷录入 / 养成规划共用这一份，避免各页顺序与文案分叉。
export const OPERATOR_RARITY_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 5, label: '绝密' },
  { value: 4, label: '机密' },
  { value: 3, label: '隐密' }
]

export const OPERATOR_RARITY_LABELS = { 3: '隐密', 4: '机密', 5: '绝密' }

// 图鉴列表的筛选口径：必须与图鉴实际展示的列表保持同一套条件，
// 否则“筛选出 N 位密探”会与列表数量不一致。
export function matchesManifestFilters(entry, filters) {
  if (!entry) return false
  const f = filters || {}
  if (f.rarityFilter != null && f.rarityFilter !== 'all' && Number(entry.rarity) !== Number(f.rarityFilter)) return false
  if (!matchesProfSubFilter(entry, f.profFilter, f.subProfFilter)) return false
  if (f.manifestFilter === 'owned' && !entry.owned) return false
  if (f.manifestFilter === 'missing' && entry.owned) return false
  const query = String(f.search || '').trim().toLowerCase()
  if (query) {
    const hay = [entry.name, entry.alias, entry.id, entry.prof, entry.subProf].filter(Boolean).join(' ').toLowerCase()
    if (hay.indexOf(query) === -1) return false
  }
  return true
}

export function hasActiveManifestFilters(filters) {
  const f = filters || {}
  return Boolean(
    (f.rarityFilter != null && f.rarityFilter !== 'all') ||
    (f.profFilter != null && f.profFilter !== 'all') ||
    (f.subProfFilter != null && f.subProfFilter !== 'all') ||
    (f.manifestFilter != null && f.manifestFilter !== 'all') ||
    String(f.search || '').trim()
  )
}
