import { calculateXiuweiRequirements } from './operatorRequirements.js'
import { TRAINING_GROUPS } from './operatorTraining.js'
import { OPERATOR_ELITE_MAX } from '../utils/operatorGrowthRules.js'

export function calculateXiuweiCapacity(from, to, stock = null) {
  const unavailable = error => ({ error, groups: [] })
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > OPERATOR_ELITE_MAX || to <= from) {
    return unavailable('请选择有效的修为区间，目标修为须高于起始修为。')
  }
  if (!stock || typeof stock !== 'object' || Array.isArray(stock)) return unavailable('库存尚未同步，请刷新库存后重试。')

  const groups = TRAINING_GROUPS.filter(group => group.id !== 'experience').map(group => {
    const cost = calculateXiuweiRequirements(from, to, group.id)
    const materials = Object.entries(cost.items).map(([id, required]) => ({
      id, required, owned: Object.hasOwn(stock, id) ? stock[id] : 0
    }))
    if (materials.some(item => !Number.isSafeInteger(item.owned) || item.owned < 0)) return null
    const count = Math.min(...materials.map(item => Math.floor(item.owned / item.required)))
    return {
      id: group.id, name: group.name, count,
      materials: materials.map(item => {
        const remaining = item.owned - item.required * count
        return { ...item, remaining, nextGap: Math.max(0, item.required - remaining) }
      })
    }
  })
  if (groups.some(group => !group)) return unavailable('库存数量暂不可用，请刷新库存后重试。')
  return { error: '', groups }
}
