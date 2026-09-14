const OPERATOR_UPDATE_EVENTS = new Set([
  'operator_scan_import',
  'operator_catalog_update',
  'operator_catalog_updated'
])

export function operatorUpdateFromEvent(message) {
  if (!message || !OPERATOR_UPDATE_EVENTS.has(message.event)) return null
  const data = message.data && typeof message.data === 'object' ? message.data : {}
  const status = data.status
  if (message.event === 'operator_scan_import' && status !== 'accepted' && status !== 'partial') return null

  return {
    operatorId: data.operator_id || data.operatorId || '',
    effect: Number(data.revision) === 1 ? 'new' : 'updated',
    preview: data.preview === true,
    accountId: data.account_id || data.accountId || ''
  }
}

