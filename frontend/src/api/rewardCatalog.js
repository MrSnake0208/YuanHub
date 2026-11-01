import { getCatalog } from './inventory.js'
import { getOperatorCatalog } from './operator.js'
import { buildRewardCatalog } from '../data/inventory/rewardCatalog.js'

// 两份目录都必须成功读取；公共图鉴不可用时不能退回含历史 ID 的库存密探目录。
export async function getRewardCatalog() {
  const [inventoryCatalog, operatorCatalog] = await Promise.all([
    getCatalog(),
    getOperatorCatalog(),
  ])
  return buildRewardCatalog(inventoryCatalog, operatorCatalog)
}
