function normalizedAccountId(accountId) {
  return String(accountId || '').trim()
}

export function bindStarExchangePreview(preview, accountId) {
  const boundAccountId = normalizedAccountId(accountId)
  return preview && boundAccountId ? { accountId: boundAccountId, preview } : null
}

export function isStarExchangePreviewCurrent(boundPreview, accountId) {
  return Boolean(boundPreview && boundPreview.accountId === normalizedAccountId(accountId))
}
