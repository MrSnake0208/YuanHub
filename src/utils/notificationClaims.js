const memory = new Map()

// Only IDs/cooldown are shared; private message content never enters storage.
export async function claimFeedbackNotification(userId, id, sound, isCurrent) {
  const key = 'yuanhub:feedback-alerts:v1:' + encodeURIComponent(userId)
  function claim() {
    if (!isCurrent()) return { claimed: false, sound: false }
    let ledger = memory.get(key) || { ids: [], soundedAt: 0 }
    try {
      const saved = JSON.parse(localStorage.getItem(key) || 'null')
      ledger = Array.isArray(saved?.ids) ? saved : { ids: [], soundedAt: 0 }
    } catch (_) { /* Storage may be disabled. */ }
    if (ledger.ids.includes(id)) return { claimed: false, sound: false }
    const now = Date.now()
    const play = sound && now - (Number(ledger.soundedAt) || 0) >= 3000
    const next = { ids: [...ledger.ids.slice(-511), id], soundedAt: play ? now : ledger.soundedAt }
    memory.set(key, next)
    try { localStorage.setItem(key, JSON.stringify(next)) } catch (_) { /* Per-tab deduplication still works. */ }
    return { claimed: true, sound: play }
  }
  // shortcut: without Web Locks or shared storage, cross-tab dedup is best effort; revisit for older browser support.
  if (navigator.locks?.request) {
    try { return await navigator.locks.request(key, claim) } catch (_) { /* A browser may deny locking in this document. */ }
  }
  return claim()
}
