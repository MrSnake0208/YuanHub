import { AGENT_CATALOG } from '../data/inventory/catalog.js'
import { DISC_SELECTION_LIMIT, discNameOf } from './operatorDiscLoadouts.js'
import { subProfList } from './operatorFilters.js'
import { battleStarFields } from './battleEditor.js'

export const BATTLE_ACTIONS = Object.freeze([
  { type: 'attack', symbol: 'A', label: '普攻' },
  { type: 'ultimate', symbol: '↑', label: '大招' },
  { type: 'defense', symbol: '↓', label: '防御' },
  { type: 'sp', symbol: '圈', label: '特殊技能' },
])
export const BATTLE_STATS = Object.freeze([
  ['hp', '生命'], ['attack', '攻击'], ['level', '等级'], ['elite', '修为'], ['huaji', '化极 / 觉醒'],
])
export const BATTLE_NOTES = Object.freeze([
  ['discs', '携带命盘'], ['requiredDiscs', '必须命盘'], ['forbiddenDiscs', '禁用命盘'], ['stars', '星石 / 辅星'],
])
export const TARGET_COLORS = ['#dce8f1', '#f6e4bb', '#edd6d0', '#deead6', '#e4dcf0']
const agents = new Map(AGENT_CATALOG.map(agent => [agent.name, agent.id]))

export function battleOperatorId(name) {
  return agents.get(String(name || '').trim()) || ''
}

export function createBattleOperator(name = '', id = '') {
  return { id, name, ...Object.fromEntries([...BATTLE_STATS, ...BATTLE_NOTES].map(([key]) => [key, ''])), discLoadouts: [], discIndex: 0, panelNote: '' }
}

export function createBattleDraft() {
  return {
    title: '', author: '', game: '如鸢', note: '',
    operators: Array.from({ length: 5 }, () => createBattleOperator()),
    targets: ['左二', '左一', 'BOSS', '右一', '右二'],
    rounds: [{ actions: [], remark: '' }],
  }
}

export function battleDiscNames(value) {
  return String(value ?? '').split(/\r\n?|\n/).map(name => name.trim()).filter(Boolean)
}

export function battleDiscError(value) {
  const names = battleDiscNames(value)
  if (names.length > DISC_SELECTION_LIMIT) return `携带命盘最多 ${DISC_SELECTION_LIMIT} 项，当前 ${names.length} 项，请移除多余词条。`
  if (new Set(names).size !== names.length) return '携带命盘不能重复，请移除重复词条。'
  return ''
}

export function battleDraftDiscError(draft) {
  for (const [index, operator] of draft.operators.entries()) {
    const error = battleDiscError(operator.discs)
    if (error) return `${index + 1} 号位${operator.name ? '（' + operator.name + '）' : ''}：${error}`
  }
  return ''
}

// 下载文件名：带攻略标题，去掉系统不允许的字符并限制长度。
export function battleFileName(title, suffix, extension) {
  const stem = String(title ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40).trim()
  return `YuanHub-${stem ? stem + '-' : ''}${suffix}.${extension}`
}

export function battleRoundRows(rounds) {
  return rounds.map((round, index) => ({
    round: index + 1, remark: round.remark,
    slots: Array.from({ length: 5 }, (_, slot) => round.actions.flatMap((action, order) => action.slot === slot
      ? [{ order: order + 1, symbol: BATTLE_ACTIONS.find(item => item.type === action.type)?.symbol || '?', target: action.target }]
      : [])),
  }))
}

// 化极文本来自导入时的固定格式（如“5 星 · 3 节点 · 已觉醒”）；手填的其它写法保留原文。
export function battleHuajiProgress(value) {
  const match = String(value ?? '').trim().match(/^([1-5])\s*(?:星|★)(?:\s*·\s*([0-5])\s*节点)?(?:\s*·\s*(已觉醒|未觉醒|觉醒待确认))?$/)
  if (!match) return null
  return { stars: Number(match[1]), nodes: match[2] == null ? null : Number(match[2]), awakened: match[3] === '已觉醒', status: match[3] || '' }
}

// 出图星石与编辑器同一解析：按槽位写成“天相60”，未知等级只写名字，无法识别的行原样保留。
export function battleStarStones(value) {
  const fields = battleStarFields(value)
  const parsed = new Set(fields.map(star => star.line).filter(line => line >= 0))
  const stone = star => star.name ? { name: star.name, label: star.name + star.level } : null
  return {
    main: fields.slice(0, 3).map(stone), support: fields.slice(3).map(stone),
    other: String(value ?? '').split('\n').filter((line, index) => !parsed.has(index) && line.trim()).map(line => line.trim()),
  }
}

const DISC_COLOR_ORDER = { 金: 0, 紫: 1, 蓝: 2 }
// 出图用图鉴里的简称与品质色；图鉴未加载或词条不在图鉴时保留原名并用中性色。
export function battleDiscTerms(value, discs = []) {
  const terms = new Map(discs.map(disc => [discNameOf(disc), disc]))
  return battleDiscNames(value).map(name => {
    const disc = terms.get(name)
    return { name, label: disc?.abbreviation || name, color: disc?.color || '' }
  }).sort((a, b) => (DISC_COLOR_ORDER[a.color] ?? 3) - (DISC_COLOR_ORDER[b.color] ?? 3))
}

export function buildBattleImageModel(draft, catalog = []) {
  return {
    title: draft.title.trim() || '配队与操作记录', game: draft.game,
    author: draft.author.trim(), note: draft.note.trim(),
    operators: draft.operators.map(operator => {
      const id = operator.id || battleOperatorId(operator.name)
      const entry = (id && (catalog.find(item => item.id === id) || AGENT_CATALOG.find(item => item.id === id))) || {}
      const fields = Object.fromEntries([...BATTLE_STATS, ...BATTLE_NOTES].map(([key]) => [key, String(operator[key] ?? '').trim()]))
      return {
        id, name: operator.name.trim(), panelNote: operator.panelNote || '', ...fields,
        prof: Array.isArray(entry.prof) ? entry.prof[0] : entry.prof || '', job: subProfList(entry)[0] || '',
        huajiProgress: battleHuajiProgress(fields.huaji),
        starStones: battleStarStones(fields.stars),
        discTerms: Object.fromEntries(['discs', 'requiredDiscs', 'forbiddenDiscs'].map(key => [key, battleDiscTerms(fields[key], entry.discs || [])])),
      }
    }),
    targets: draft.targets.map((name, index) => String(name).trim() || ['左二', '左一', 'BOSS', '右一', '右二'][index]),
    rows: battleRoundRows(draft.rounds),
  }
}

export function battleImageError(draft, kind) {
  const discError = battleDraftDiscError(draft)
  if (discError) return discError
  if (!draft.operators.some(operator => operator.name.trim())) return '请先填写至少一位密探。'
  if (kind === 'actions' && !draft.rounds.some(round => round.actions.length)) return '请先记录至少一个动作。'
  if (kind === 'actions' && draft.rounds.some(round => round.actions.some(action => !draft.operators[action.slot]?.name.trim()))) {
    return '有动作对应的槽位尚未填写密探，请先补全配队。'
  }
  return ''
}
