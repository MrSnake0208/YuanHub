export const OPERATOR_TAB_STORAGE_KEY = 'operator-tabs'
export const OPERATOR_ACTIVE_TAB_SESSION_KEY = 'yuanhub:operator-active-tab:v1'
export const OPERATOR_TABS = Object.freeze(['catalog', 'current', 'tracking'])

export function setActiveOperatorTab(tab) {
  if (!OPERATOR_TABS.includes(tab)) return
  try { sessionStorage.setItem(OPERATOR_ACTIVE_TAB_SESSION_KEY, tab) } catch (_) { /* sessionStorage may be unavailable */ }
}

export function readActiveOperatorTab() {
  try {
    const sessionTab = sessionStorage.getItem(OPERATOR_ACTIVE_TAB_SESSION_KEY)
    if (OPERATOR_TABS.includes(sessionTab)) return sessionTab
  } catch (_) { /* sessionStorage may be unavailable */ }
  try {
    const savedTab = localStorage.getItem(OPERATOR_TAB_STORAGE_KEY)
    if (OPERATOR_TABS.includes(savedTab)) return savedTab
  } catch (_) { /* localStorage may be unavailable */ }
  return 'catalog'
}

