const storageKey = context => 'yuanhub:operator-reset:pending:' + JSON.stringify(context)

export function readResetRecovery(context) {
  try {
    const raw = sessionStorage.getItem(storageKey(context))
    if (!raw) return null
    const saved = JSON.parse(raw)
    const { operation, preview, undoRecord, stage } = saved
    if (saved.version !== 1 || !operation || typeof operation.key !== 'string' ||
        !operation.body || operation.body.account_id !== context[1] || operation.body.game !== context[2] ||
        typeof operation.body.preview_token !== 'string' || preview?.preview_token !== operation.body.preview_token ||
        !preview?.before || !Array.isArray(preview.resources) || !Array.isArray(preview.blockers) ||
        typeof stage !== 'string' || (saved.manualQuantities != null && (typeof saved.manualQuantities !== 'object' || Array.isArray(saved.manualQuantities))) ||
        (operation.id && (undoRecord?.id !== operation.id || !undoRecord.before))) {
      throw new Error('Invalid recovery record')
    }
    return saved
  } catch {
    throw new Error('无法读取上次操作的重试信息，请检查浏览器存储后重试；可先查看重置记录核对结果。')
  }
}

export function saveResetRecovery(context, saved) {
  try {
    const existing = readResetRecovery(context)
    if (existing && existing.operation.key !== saved.operation.key) throw new Error('Pending operation exists')
    sessionStorage.setItem(storageKey(context), JSON.stringify({ version: 1, ...saved }))
  } catch {
    throw new Error('无法保存重试信息，本次尚未提交。请检查浏览器存储后重试。')
  }
}

export function clearResetRecovery(context, operation) {
  try {
    const saved = readResetRecovery(context)
    if (saved?.operation.key === operation.key) sessionStorage.removeItem(storageKey(context))
  } catch {
    // Retaining an old receipt is safe: its original request remains idempotent on the server.
  }
}
