import { STAR_STONE_RESTRICTIONS, isStarStoneAllowedForOperator } from '../data/starStones.js'

export const BATTLE_STAR_SLOTS = ['主星1', '主星2', '主星3', '辅星1', '辅星2', '辅星3']

// 星石只记名称与等级：精简格式“主星1：天相 · 40级”或“主星1：天相”；旧版“名 · 品质 · 等级 · 突破”也能识别。
// 其它自由文本与同槽位重复行不猜测拆分，原样保留。
function parseBattleStarLine(line, label) {
  const match = line.trim().match(new RegExp(`^${label}[：:][ ]*(.+)$`))
  if (!match) return null
  const [name, ...rest] = match[1].split(/[ ]*·[ ]*/)
  if (!name.trim()) return null
  if (!rest.length) return { name: name.trim(), level: '' }
  if (rest.length === 1 && /^\d{1,3}级$/.test(rest[0].trim())) return { name: name.trim(), level: rest[0].trim().slice(0, -1) }
  const level = rest[1]?.trim().match(/^(未知|\d+)级$/)
  if (rest.length === 3 && level && /^突破(未知|\d+)$/.test(rest[2].trim())) return { name: name.trim(), level: level[1] === '未知' ? '' : level[1] }
  return null
}

export function formatBattleStar({ label, name, level }) {
  return `${label}：${name}${level ? ' · ' + level + '级' : ''}`
}

export function battleStarFields(value) {
  const lines = String(value || '').split('\n')
  return BATTLE_STAR_SLOTS.map(label => {
    const matches = lines.flatMap((line, index) => {
      const star = parseBattleStarLine(line, label)
      return star ? [{ line: index, ...star }] : []
    })
    return { label, line: -1, name: '', level: '', ...(matches.length === 1 ? matches[0] : {}) }
  })
}

// 佩戴规则与账号星石配装一致：同一密探的星石不能重复；部分星石仅限指定从属或属性（见 data/starStones.js）。
// agent 缺少从属／属性信息（如图鉴外自定义密探）时不做限制。
export function battleStarRestriction(name) {
  const rule = STAR_STONE_RESTRICTIONS[name]
  if (!rule) return ''
  return rule.subProf ? `仅限${rule.subProf.join('／')}从属` : `仅限${rule.prof.join('／')}属性`
}

export function battleStarNameError(value, slot, name, agent) {
  const trimmed = String(name ?? '').trim()
  if (!trimmed) return ''
  const fields = battleStarFields(value)
  const other = fields.find((star, index) => index !== slot && star.name === trimmed)
  if (other) return `${other.label}已选择「${trimmed}」，同一密探的星石不能重复。`
  if (!isStarStoneAllowedForOperator(trimmed, agent)) return `「${trimmed}」${battleStarRestriction(trimmed)}，${agent?.name || '该密探'}不能佩戴。`
  return ''
}

// 旧草稿或账号带入的已有冲突：重复只在后出现的槽位报告一次。
export function battleStarConflicts(value, agent) {
  const fields = battleStarFields(value)
  return fields.flatMap((star, index) => {
    if (!star.name) return []
    const first = fields.findIndex(item => item.name === star.name)
    if (first !== index) return [`${star.label}「${star.name}」与${fields[first].label}重复`]
    return isStarStoneAllowedForOperator(star.name, agent) ? [] : [`${star.label}「${star.name}」${battleStarRestriction(star.name)}`]
  })
}

// 无法按槽位识别的行（旧说明、重复或未知格式），按原顺序返回；编辑器只展示并允许整体清除，不提供自由文本编辑。
export function battleStarUnparsed(value) {
  const parsed = new Set(battleStarFields(value).map(star => star.line).filter(line => line >= 0))
  return String(value || '').split('\n').filter((line, index) => line.trim() && !parsed.has(index))
}

export function battleStarWithoutUnparsed(value) {
  const parsed = new Set(battleStarFields(value).map(star => star.line).filter(line => line >= 0))
  return String(value || '').split('\n').filter((line, index) => parsed.has(index)).join('\n')
}

// 每次修改按主星1→辅星3 重写已识别槽位，其余说明行保持原顺序附在后面。
export function updateBattleStar(value, slot, field, content) {
  const fields = battleStarFields(value)
  if (!fields[slot] || !['name', 'level'].includes(field)) throw new Error('星石字段无效。')
  const lines = String(value || '').split('\n')
  const next = { ...fields[slot], [field]: String(content).trim() }
  if (next.line < 0 && lines.some(line => line.trim().startsWith(next.label + '：') || line.trim().startsWith(next.label + ':'))) throw new Error('该槽位已有无法识别或重复的内容，请先清除下方无法识别的内容；原内容未改。')
  if (field === 'name' && !next.name) next.level = ''
  if (/[·:：\r\n]/.test(next.name)) throw new Error('名称不能包含分隔符或换行。')
  if (next.level && !/^\d{1,3}$/.test(next.level)) throw new Error('等级请填写非负整数，未知可留空。')
  if (!next.name && next.level) throw new Error('请先填写星石名称，再设置等级。')
  fields[slot] = next
  const parsed = new Set(fields.map(star => star.line).filter(line => line >= 0))
  const others = lines.filter((line, index) => !parsed.has(index) && line.trim())
  const result = [...fields.filter(star => star.name).map(formatBattleStar), ...others].join('\n')
  if (result.length > 300) throw new Error('星石配置最多 300 字；原内容未改，请先清空部分槽位或清除无法识别的内容。')
  return result
}

export function battleStarSummary(value, kind) {
  return String(value || '').split('\n').filter(line => line.trim().startsWith(kind)).join('\n')
}

export function moveBattleAction(actions, from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= actions.length || to < 0 || to >= actions.length) return false
  if (from === to) return true
  const next = [...actions]
  next.splice(to, 0, next.splice(from, 1)[0])
  // 一次替换，避免同步草稿保存观察到中间状态。
  actions.splice(0, actions.length, ...next)
  return true
}
