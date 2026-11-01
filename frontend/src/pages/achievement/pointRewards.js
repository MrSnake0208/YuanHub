export function pointRewardTrack(catalog, categoryId) {
  const track = catalog?.point_tracks?.find(value => value.category_id === categoryId)
  return track && track.tiers?.length ? { itemKey: track.item_key, itemName: track.item_name, tiers: track.tiers } : null
}

// Interpolate progress between evenly spaced tier nodes using the imported thresholds.
export function pointTrackFill(score, tiers) {
  if (!Number.isFinite(score) || score <= 0 || !tiers.length) return 0
  const step = 100 / tiers.length
  const next = tiers.findIndex(tier => tier.at > score)
  if (next === -1) return 100 - step / 2
  if (next === 0) return score / tiers[0].at * step / 2
  const previous = tiers[next - 1].at
  return step * (next - 0.5) + (score - previous) / (tiers[next].at - previous) * step
}

export function achievementPoints(entries, records, itemKey) {
  const completed = new Set(records.filter(record => record.status === 'completed').map(record => record.achievement_id))
  let total = 0
  for (const entry of entries) {
    if (!completed.has(entry.achievement_id)) continue
    // 已完成但奖励未知时不能把缺失资料算成零；明确无此物品才贡献零分。
    if (!Array.isArray(entry.rewards)) return null
    for (const reward of entry.rewards) {
      if (reward.item_key !== itemKey) continue
      if (!Number.isSafeInteger(reward.quantity) || reward.quantity <= 0) return null
      total += reward.quantity
      if (!Number.isSafeInteger(total)) return null
    }
  }
  return total
}
