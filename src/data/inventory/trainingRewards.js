import { TRAINING_GROUPS } from '../operatorTraining.js'

export const TRAINING_REWARD_GROUPS = TRAINING_GROUPS.filter(group => ['fh', 'ds', 'yy'].includes(group.id))
export const TRAINING_REWARD_LEVELS = Object.freeze(Array.from({ length: 12 }, (_, index) => index + 1))
export const DEFAULT_TRAINING_REWARD_LEVELS = Object.freeze([4, 6, 8, 10, 12])
export const MAX_TRAINING_SELECTIONS = TRAINING_REWARD_GROUPS.length * TRAINING_REWARD_LEVELS.length

// 用户已确认两版本掉落完全一致，共用原表；养成估算的默认层数与每日额度不适用于奖励补录。
export function trainingRewardUnavailableReason(game) {
  if (['代号鸢', '如鸢'].includes(game)) return ''
  return '当前游戏没有已核实的历练预设，请按材料填写实际奖励。'
}

function invalid(message, field) {
  throw Object.assign(new TypeError(message), { field })
}

export function calculateTrainingRewards({ game, groupId, level, runs, entities }) {
  const unavailable = trainingRewardUnavailableReason(game)
  if (unavailable) invalid(unavailable, 'game')
  const group = TRAINING_REWARD_GROUPS.find(group => group.id === groupId)
  if (!group) invalid('请选择风火、地水或阴阳历练', 'group')
  if (!TRAINING_REWARD_LEVELS.includes(level)) invalid('请选择第 1 至 12 关', 'level')
  const stage = group.stages.find(stage => stage.level === level)
  const rewards = Object.entries(stage.rewards)
  const maxRuns = Math.floor(2147483647 / Math.max(...rewards.map(([, count]) => count)))
  if (!['string', 'number'].includes(typeof runs) || !/^\d+$/.test(String(runs)) || !Number.isSafeInteger(Number(runs)) || Number(runs) < 1) {
    invalid('完成次数必须为明确的正整数，不接受小数或科学计数文本', 'runs')
  }
  if (Number(runs) > maxRuns) invalid(`本层完成次数最多为 ${maxRuns} 次，材料数量不能超过 2147483647`, 'runs')
  const entries = rewards.map(([id, perRunCount]) => {
    const entity = Array.isArray(entities) && entities.find(entity => entity.entity_type === 'item' && entity.id === id)
    if (!entity) invalid(`当前奖励目录缺少材料「${id}」，请重新加载目录或按材料填写`, 'catalog')
    return { id, name: entity.name, count: perRunCount * Number(runs), perRunCount }
  })
  return { entries, runs: Number(runs), maxRuns }
}

export function calculateTrainingRewardBatch({ game, selections, entities }) {
  if (!Array.isArray(selections) || selections.length < 1 || selections.length > MAX_TRAINING_SELECTIONS) invalid(`请选择 1 至 ${MAX_TRAINING_SELECTIONS} 组历练`, 'selections')
  const seen = new Set()
  const totals = new Map()
  const groups = selections.map((selection, selectionIndex) => {
    try {
      if (!selection || typeof selection !== 'object') invalid('请选择有效的历练类型', 'group')
      const result = calculateTrainingRewards({ game, groupId: selection.groupId, level: selection.level, runs: selection.runs, entities })
      const key = `${selection.groupId}:${selection.level}`
      if (seen.has(key)) invalid('同一类型的同一关卡只需填写一组，请合并完成次数或选择其他关卡', 'level')
      seen.add(key)
      for (const entry of result.entries) {
        const count = (totals.get(entry.id)?.count || 0) + entry.count
        if (count > 2147483647) invalid(`材料「${entry.name}」合计数量不能超过 2147483647，请减少相关关卡次数或分笔录入`, 'runs')
        totals.set(entry.id, { id: entry.id, name: entry.name, count })
      }
      return result
    } catch (err) { throw Object.assign(err, { selectionIndex }) }
  })
  return { entries: [...totals.values()], groups }
}
