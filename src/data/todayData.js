function mergedEntries(documents) {
  return (Array.isArray(documents) ? documents : documents ? [documents] : []).reduce(function (entries, document) {
    return Object.assign(entries, document && document.entries ? document.entries : {})
  }, {})
}

export function summarizeTodayData({ current, inventory, favorites, notifications } = {}) {
  const favoriteIds = Array.isArray(favorites && favorites.agent_ids) ? favorites.agent_ids : []
  const unread = Number(notifications && notifications.count)
  return {
    operatorCount: Object.keys(mergedEntries(current)).length,
    favoriteCount: new Set(favoriteIds).size,
    inventoryKindCount: Object.values(mergedEntries(inventory)).filter(function (entry) {
      return Number(entry && entry.count) > 0
    }).length,
    unreadCount: Number.isFinite(unread) && unread > 0 ? Math.floor(unread) : 0
  }
}

export function shouldShowTodayDataOnboarding({ hasAccounts, summary } = {}) {
  if (!hasAccounts) return true
  if (!summary) return false
  return summary.operatorCount === 0 && summary.inventoryKindCount === 0
}
