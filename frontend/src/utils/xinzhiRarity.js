import { AGENT_CATALOG } from '../data/inventory/catalog.js'

const localRarities = new Map(AGENT_CATALOG.map(agent => [agent.id, agent.rarity]))

// 流水和成就奖励可能只有 ID；有实时目录品质时优先使用。
export function xinzhiRarity(id, rarity) {
  return rarity ?? localRarities.get(id)
}
