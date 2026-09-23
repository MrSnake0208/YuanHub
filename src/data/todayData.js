function mergedEntries(documents) {
  return (Array.isArray(documents) ? documents : documents ? [documents] : []).reduce(function (entries, document) {
    return Object.assign(entries, document && document.entries ? document.entries : {})
  }, {})
}

export function summarizeTodayData({ current, inventory, starState, favorites, notifications } = {}) {
  const favoriteIds = Array.isArray(favorites && favorites.agent_ids) ? favorites.agent_ids : []
  const unread = Number(notifications && notifications.count)
  return {
    operatorCount: Object.keys(mergedEntries(current)).length,
    favoriteCount: new Set(favoriteIds).size,
    inventoryKindCount: Object.values(mergedEntries(inventory)).filter(function (entry) {
      return Number(entry && entry.count) > 0
    }).length,
    starCount: summarizeTodayStarState(starState),
    unreadCount: Number.isFinite(unread) && unread > 0 ? Math.floor(unread) : 0
  }
}

export function summarizeTodayStarState(starState) {
  return Array.isArray(starState && starState.inventory) ? starState.inventory.length : 0
}

function countReadiness(value) {
  if (value == null) return 'unknown'
  return Number(value) > 0 ? 'ready' : 'empty'
}

export function getTodayDataReadiness(summary = {}) {
  return {
    operator: countReadiness(summary.operatorCount),
    inventory: countReadiness(summary.inventoryKindCount),
    star: countReadiness(summary.starCount)
  }
}

export function getTodayOnboardingStage({ isLoggedIn, hasAccounts, summary } = {}) {
  if (!isLoggedIn) return 'auth'
  if (!hasAccounts) return 'account'
  const readiness = getTodayDataReadiness(summary)
  return Object.values(readiness).includes('empty') ? 'data' : 'ready'
}

export function shouldShowTodayDataOnboarding(options = {}) {
  return getTodayOnboardingStage(options) !== 'ready'
}
