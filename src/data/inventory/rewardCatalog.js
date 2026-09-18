/**
 * 库存目录可能保留历史密探 ID，供旧流水展示使用。
 * 新奖励只使用公共图鉴中的密探身份，不能把历史条目重新并入可写目录。
 */
export function buildRewardCatalog(inventoryCatalog, operatorCatalog) {
  if (!Array.isArray(inventoryCatalog?.entities)) {
    throw new TypeError('库存目录加载失败，请重新加载奖励目录')
  }
  if (!Array.isArray(operatorCatalog?.operators)) {
    throw new TypeError('密探公共图鉴加载失败，请重新加载奖励目录')
  }
  const seen = new Set()
  const agents = operatorCatalog.operators.map(operator => {
    if (!operator || typeof operator.id !== 'string' || !operator.id.trim() ||
        typeof operator.name !== 'string' || !operator.name.trim() || seen.has(operator.id)) {
      throw new TypeError('密探公共图鉴包含无效或重复 ID，请联系管理员修复目录')
    }
    seen.add(operator.id)
    return { ...operator, entity_type: 'agent' }
  })
  return [
    ...inventoryCatalog.entities.filter(entity => entity?.entity_type === 'item'),
    ...agents,
  ]
}
