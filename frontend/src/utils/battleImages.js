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
// 关卡内互动（玩家口中的“箱”、MaaYuan 的局内工具箱）：不属于任何密探、无目标，只占全队出手顺序中的一步。
// 数据只存 { type: 'interaction' }，与作业协议的 interaction 动作同义；表格与出图中挂在紧邻的密探格内显示。
export const BATTLE_INTERACTION = Object.freeze({ type: 'interaction', symbol: '箱', label: '关卡互动' })
export const isBattleInteraction = action => action?.type === BATTLE_INTERACTION.type
export const BATTLE_STATS = Object.freeze([
  ['hp', '生命'], ['attack', '攻击'], ['level', '等级'], ['elite', '修为'], ['huaji', '化极'],
])
export const BATTLE_NOTES = Object.freeze([
  ['discs', '携带命盘'], ['requiredDiscs', '必须命盘'], ['forbiddenDiscs', '禁用命盘'], ['stars', '星石 / 辅星'],
])
// 目标色：浅底色作动作块底，深一档的强调色作左侧色条与图例，色相拉开（蓝、琥珀、珊瑚、绿、紫）。
// 主位无色，下标 2 的颜色不用于动作，保留以对齐目标下标。
export const TARGET_COLORS = ['#dce8f1', '#f6e4bb', '#edd6d0', '#deead6', '#e4dcf0']
export const TARGET_ACCENTS = ['#5b8db8', '#d4a017', '#c8644f', '#6a9f55', '#8b6cc0']
export const BATTLE_MAIN_TARGET = 2
const agents = new Map(AGENT_CATALOG.map(agent => [agent.name, agent.id]))

export function battleTargetShortName(name) {
  if (/^作业目标\d+$/.test(name)) return name.slice(2)
  const chars = Array.from(name)
  return chars.length > 4 ? chars.slice(0, 4).join('') + '…' : name
}

export function battleOperatorId(name) {
  return agents.get(String(name || '').trim()) || ''
}

export const sameBattleOperator = (member, agent) => Boolean(member?.name) && (member.id ? member.id === agent.id : member.name === agent.name)

export function createBattleOperator(name = '', id = '') {
  return { id, name, ...Object.fromEntries([...BATTLE_STATS, ...BATTLE_NOTES].map(([key]) => [key, ''])), discLoadouts: [], discIndex: 0, panelNote: '' }
}

export function createBattleDraft() {
  return {
    title: '', author: '', game: '如鸢', note: '',
    operators: Array.from({ length: 5 }, () => createBattleOperator()),
    targets: ['左二', '左一', 'BOSS', '右一', '右二'],
    rounds: [{ actions: [], remark: '' }],
    absentTargets: [],
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

// 箱不单独成列：显示在本回合紧邻其前出手的密探格内；本回合开头的箱跟随其后第一位出手的密探，
// 整回合只有箱时放在第一位已选密探处。只影响显示，数据中仍是独立一步。
function battleBoxHost(actions, index, fallback) {
  for (let i = index - 1; i >= 0; i--) if (!isBattleInteraction(actions[i])) return actions[i].slot
  for (let i = index + 1; i < actions.length; i++) if (!isBattleInteraction(actions[i])) return actions[i].slot
  return fallback
}

export function battleRoundRows(rounds, operators = []) {
  const fallback = Math.max(0, operators.findIndex(operator => String(operator?.name || '').trim()))
  return rounds.map((round, index) => {
    const entries = round.actions.map((action, order) => isBattleInteraction(action)
      ? { slot: battleBoxHost(round.actions, order, fallback), entry: { order: order + 1, symbol: BATTLE_INTERACTION.symbol, target: null, box: true } }
      : { slot: action.slot, entry: { order: order + 1, symbol: BATTLE_ACTIONS.find(item => item.type === action.type)?.symbol || '?', target: action.target } })
    return {
      round: index + 1, remark: round.remark,
      slots: Array.from({ length: 5 }, (_, slot) => entries.filter(item => item.slot === slot).map(item => item.entry)),
    }
  })
}

// used 为用到的目标序号（升序）；主位固定无色，multi 表示存在需要上色的目标。
export function battleTargetUsage(rows) {
  const targets = new Set()
  for (const entry of rows.flatMap(row => row.slots.flat())) if (!entry.box && entry.target != null) targets.add(entry.target)
  const used = [...targets].sort((a, b) => a - b)
  return { used, main: BATTLE_MAIN_TARGET, multi: used.some(index => index !== BATTLE_MAIN_TARGET) }
}

// 化极文本来自导入时的固定格式（如“5 星 · 3 节点 · 已觉醒”）；手填的其它写法保留原文。
export function battleHuajiProgress(value) {
  const match = String(value ?? '').trim().match(/^([1-5])\s*(?:星|★)(?:\s*·\s*([0-5])\s*节点)?(?:\s*·\s*(已觉醒|未觉醒|觉醒待确认))?$/)
  if (!match) return null
  return { stars: Number(match[1]), nodes: match[2] == null ? null : Number(match[2]), awakened: match[3] === '已觉醒', status: match[3] || '' }
}

export function battleHuajiLabel(value) {
  const text = String(value ?? '').trim()
  const progress = battleHuajiProgress(text)
  if (progress?.status === '已觉醒') return '觉醒'
  if (progress?.status === '觉醒待确认' || progress?.status === '未觉醒') return `${progress.stars} 星`
  return text
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
    title: draft.title.trim(), game: draft.game,
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
    rows: battleRoundRows(draft.rounds, draft.operators),
  }
}

export function battleImageError(draft, kind) {
  const discError = battleDraftDiscError(draft)
  if (discError) return discError
  if (!draft.operators.some(operator => operator.name.trim())) return '请先填写至少一位密探。'
  if (kind === 'actions' && !draft.rounds.some(round => round.actions.length)) return '请先记录至少一个动作。'
  if (kind === 'actions' && draft.rounds.some(round => round.actions.some(action => !isBattleInteraction(action) && !draft.operators[action.slot]?.name.trim()))) {
    return '有动作对应的槽位尚未填写密探，请先补全配队。'
  }
  return ''
}
