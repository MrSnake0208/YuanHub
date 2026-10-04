function mergedEntries(documents) {
  return (Array.isArray(documents) ? documents : documents ? [documents] : []).reduce(function (entries, document) {
    return Object.assign(entries, document && document.entries ? document.entries : {})
  }, {})
}

function inventoryRecordingEvidence(inventory) {
  const documents = Array.isArray(inventory) ? inventory : inventory && typeof inventory === 'object' ? [inventory] : null
  if (!documents) return { inventoryRecorded: null, inventoryHasFullBaseline: null }
  if (!documents.length) return { inventoryRecorded: false, inventoryHasFullBaseline: false }
  const inventoryHasFullBaseline = documents.some(function (document) {
    return typeof document?.full_baseline_at === 'string' && Number.isFinite(Date.parse(document.full_baseline_at))
  })
  const hasEntries = documents.some(function (document) {
    if (!document?.entries || typeof document.entries !== 'object' || Array.isArray(document.entries)) return false
    return Object.values(document.entries).some(function (entry) {
      return entry?.count != null && entry.count !== '' && Number.isFinite(Number(entry.count)) && Number(entry.count) >= 0
    })
  })
  return {
    inventoryRecorded: inventoryHasFullBaseline || hasEntries ? true : null,
    inventoryHasFullBaseline
  }
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
    ...inventoryRecordingEvidence(inventory),
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
    inventory: summary.inventoryRecorded === true ? 'ready' : summary.inventoryRecorded === false ? 'empty' : 'unknown',
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
