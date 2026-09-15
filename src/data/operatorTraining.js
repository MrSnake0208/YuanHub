// 历练必得奖励：用户提供的十二层修为表与八档经验表。
export const TRAINING_DAILY_LIMIT = 6
const COUNTS = [[15], [25], [25, 15], [30, 20], [35, 25], [40, 30], [40, 30], [45, 35], [45, 35], [50, 40], [55, 40], [60, 45]]
const TIER_START = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4]
const GROUP_ITEMS = {
  fh: ['juanshan', 'cuishan', 'jinsishan', 'yushan', 'xianmenshan', 'beihuifengshan'],
  ds: ['zhuojiu', 'qingjiu', 'baimozhijiu', 'lingshanquan', 'bawanglei', 'mulanzhuilu'],
  yy: ['tongjing', 'liubojing', 'liujinjing', 'baoshijing', 'shuijing', 'xinghanjing']
}
const EXPERIENCE_NAMES = ['新手历练', '初级历练', '中级历练', '高级历练', '终极历练', '实战历练', '鏖战历练', '绝境历练']
const EXPERIENCE_REWARDS = [[25, 0], [25, 2], [30, 3], [40, 4], [50, 5], [65, 6], [85, 8], [100, 9]]
export const TRAINING_GROUPS = Object.entries(GROUP_ITEMS).map(([id, items]) => ({
  id, name: { fh: '风火', ds: '地水', yy: '阴阳' }[id], items,
  stages: COUNTS.map((counts, index) => ({
    level: index + 1, name: '第 ' + (index + 1) + ' 层',
    rewards: Object.fromEntries(counts.map((count, offset) => [items[TIER_START[index] + offset], count]))
  }))
})).concat({
  id: 'experience', name: '经验', items: ['bingshucanjuan', 'bingshuquanjuan'],
  stages: EXPERIENCE_REWARDS.map(([fragment, complete], index) => ({
    level: index + 1, name: EXPERIENCE_NAMES[index],
    rewards: { bingshucanjuan: fragment, bingshuquanjuan: complete }
  }))
})
export const DEFAULT_TRAINING_LEVELS = { fh: 12, ds: 12, yy: 12, experience: 8 }
export const BOOK_VALUES = { bingshucanjuan: 100, bingshuquanjuan: 1000, liutaobingshu: 10000 }
const BOOK_NAMES = { bingshucanjuan: '兵书残卷', bingshuquanjuan: '兵书全卷', liutaobingshu: '六韬兵书' }

export function bookExperience(stock) {
  return Object.entries(BOOK_VALUES).reduce((sum, [id, value]) => sum + Math.max(0, Number(stock?.[id]) || 0) * value, 0)
}

export function normalizeTrainingLevels(value = {}) {
  return Object.fromEntries(TRAINING_GROUPS.map(group => [group.id,
    Math.max(1, Math.min(group.stages.length, Math.trunc(Number(value[group.id])) || group.stages.length))
  ]))
}

// 与当前养成快捷提升共用：默认绝境历练 9 全卷 + 100 残卷 = 19,000 经验。
export function levelBookGapBundle(experienceGap, maxLevel = 8) {
  const gap = Math.max(0, Number(experienceGap) || 0)
  if (!gap) return []
  const group = TRAINING_GROUPS.find(group => group.id === 'experience')
  const stage = group.stages[normalizeTrainingLevels({ experience: maxLevel }).experience - 1]
  const runs = Math.ceil(gap / bookExperience(stage.rewards))
  return ['bingshuquanjuan', 'bingshucanjuan'].filter(id => stage.rewards[id] > 0).map(id => ({
    id, name: BOOK_NAMES[id], required: runs * stage.rewards[id], owned: 0, lack: runs * stage.rewards[id]
  }))
}

export function trainingRate(id, levels = DEFAULT_TRAINING_LEVELS) {
  const group = TRAINING_GROUPS.find(group => group.items.includes(id))
  if (!group) return null
  const stages = group.stages.slice(0, normalizeTrainingLevels(levels)[group.id])
  return Math.max(...stages.map(stage => stage.rewards[id] || 0)) * TRAINING_DAILY_LIMIT
}

// 为每类历练给出可执行的分配，不把同类材料分别当作拥有六次额度。
// 比较高阶优先与低阶优先的贪心方案；结果是保守估算，不声称全局最优。
export function trainingSchedule(gaps, levels = DEFAULT_TRAINING_LEVELS) {
  const limits = normalizeTrainingLevels(levels)
  return TRAINING_GROUPS.map(group => {
    const wanted = Object.fromEntries(group.items.map(id => [id,
      gaps.filter(gap => gap.id === id).reduce((sum, gap) => sum + Math.max(0, Number(gap.gap) || 0), 0)
    ]))
    const stages = group.stages.slice(0, limits[group.id])
    function allocate(order) {
      const remaining = { ...wanted }
      const allocations = new Map()
      for (const id of order) {
        if (remaining[id] <= 0) continue
        const stage = stages.reduce((best, candidate) =>
          (candidate.rewards[id] || 0) >= (best.rewards[id] || 0) ? candidate : best, stages[0])
        if (!stage.rewards[id]) continue
        const runs = Math.ceil(remaining[id] / stage.rewards[id])
        allocations.set(stage.level, (allocations.get(stage.level) || 0) + runs)
        for (const [materialId, count] of Object.entries(stage.rewards)) remaining[materialId] = Math.max(0, remaining[materialId] - runs * count)
      }
      const runs = [...allocations.values()].reduce((sum, value) => sum + value, 0)
      const blocked = Object.keys(remaining).filter(id => remaining[id] > 0)
      return { runs, blocked, days: blocked.length ? null : Math.ceil(runs / TRAINING_DAILY_LIMIT),
        stages: [...allocations].map(([level, runs]) => ({ ...group.stages[level - 1], runs })) }
    }
    const ascending = allocate(group.items)
    const descending = allocate(group.items.slice().reverse())
    const result = descending.runs < ascending.runs ? descending : ascending
    return { id: group.id, name: group.name, ...result }
  }).filter(group => group.runs || group.blocked.length)
}

export function growthTargetReached(current, target) {
  // 未拥有不能因经验需求为零而被判定完成；五星旧节点 25..30 视作同阶段。
  const star = value => Number(value) >= 25 && Number(value) < 31 ? 25 : Number(value) || 0
  return Boolean(current.level || current.elite || current.starLevel) &&
    Number(current.level || 0) >= target.level && Number(current.elite || 0) >= target.elite && star(current.starLevel) >= star(target.starLevel)
}

// 单人专用刷取方案中，每项材料首次备齐的天数；同类其他材料占用的次数也计入。
export function trainingMaterialEtas(gaps, levels = DEFAULT_TRAINING_LEVELS) {
  const result = {}
  for (const group of trainingSchedule(gaps, levels)) {
    const ids = TRAINING_GROUPS.find(item => item.id === group.id).items
    for (const id of ids) {
      let remaining = gaps.filter(gap => gap.id === id).reduce((sum, gap) => sum + gap.gap, 0)
      if (remaining <= 0) continue
      let elapsed = 0
      result[id] = null
      for (const stage of group.stages) {
        const perRun = stage.rewards[id] || 0
        if (perRun && remaining <= perRun * stage.runs) {
          result[id] = Math.ceil((elapsed + Math.ceil(remaining / perRun)) / TRAINING_DAILY_LIMIT)
          break
        }
        remaining -= perRun * stage.runs
        elapsed += stage.runs
      }
    }
  }
  return result
}
