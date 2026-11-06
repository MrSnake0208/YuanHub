import { AGENT_CATALOG } from '../data/inventory/catalog.js'

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

export function battleRoundRows(rounds) {
  return rounds.map((round, index) => ({
    round: index + 1, remark: round.remark,
    slots: Array.from({ length: 5 }, (_, slot) => round.actions.flatMap((action, order) => action.slot === slot
      ? [{ order: order + 1, symbol: BATTLE_ACTIONS.find(item => item.type === action.type)?.symbol || '?', target: action.target }]
      : [])),
  }))
}

export function buildBattleImageModel(draft) {
  return {
    title: draft.title.trim() || '配队与操作记录', game: draft.game,
    author: draft.author.trim(), note: draft.note.trim(),
    operators: draft.operators.map(operator => ({
      id: operator.id || battleOperatorId(operator.name), name: operator.name.trim(), panelNote: operator.panelNote || '',
      ...Object.fromEntries([...BATTLE_STATS, ...BATTLE_NOTES].map(([key]) => [key, String(operator[key] ?? '').trim()])),
    })),
    targets: draft.targets.map((name, index) => String(name).trim() || ['左二', '左一', 'BOSS', '右一', '右二'][index]),
    rows: battleRoundRows(draft.rounds),
  }
}

export function battleImageError(draft, kind) {
  if (!draft.operators.some(operator => operator.name.trim())) return '请先填写至少一位密探。'
  if (kind === 'actions' && !draft.rounds.some(round => round.actions.length)) return '请先记录至少一个动作。'
  if (kind === 'actions' && draft.rounds.some(round => round.actions.some(action => !draft.operators[action.slot]?.name.trim()))) {
    return '有动作对应的槽位尚未填写密探，请先补全配队。'
  }
  return ''
}
