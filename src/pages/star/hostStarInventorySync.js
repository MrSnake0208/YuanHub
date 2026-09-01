import { putCurrentStarInventory } from '../../api/starInventory.js'

function backendSnapshot(snapshot) {
  if (!snapshot || typeof snapshot.effective_at !== 'string' || !snapshot.effective_at) {
    throw new Error('星石同步快照缺少有效时间。')
  }
  if (!Array.isArray(snapshot.entries)) {
    throw new Error('星石同步快照缺少库存条目。')
  }
  return {
    effective_at: snapshot.effective_at,
    entries: snapshot.entries.map(function (entry) {
      return {
        instance_id: entry.instance_id,
        kind: entry.kind,
        name: entry.name,
        quality: entry.quality,
        level: entry.level,
      }
    }),
  }
}

export function createHostStarInventorySync(selectedHostAccount, put = putCurrentStarInventory) {
  return {
    async sync(payload) {
      const host = selectedHostAccount()
      if (!host || typeof host.accountId !== 'string' || !host.accountId.trim()) {
        throw new Error('请先登录并选择 YuanHub 子账号，再同步星石。')
      }
      const localAccountId = payload?.localAccount?.localAccountId
      if (typeof localAccountId !== 'string' || !localAccountId.trim()) {
        throw new Error('无法确认当前 YuanStar 工作区账号，未同步。')
      }
      if (localAccountId !== host.accountId) {
        throw new Error('当前 YuanStar 工作区与 YuanHub 子账号不一致，未同步。')
      }
      return put(host.accountId, backendSnapshot(payload?.snapshot))
    },
  }
}
