export function operatorIdSequence(id) {
  const match = String(id || '').match(/^char_(\d+)/i)
  return match ? Number(match[1]) : -1
}

export function adminCatalogEntries(data) {
  if (Array.isArray(data)) return data
  if (!data || typeof data !== 'object') return null
  if (Array.isArray(data.operators)) return data.operators
  if (Array.isArray(data.items)) return data.items
  if (Array.isArray(data.content)) return data.content
  return null
}

export function compareOperatorIdDesc(a, b) {
  const aId = a && a.id ? a.id : ''
  const bId = b && b.id ? b.id : ''
  const sequenceDiff = operatorIdSequence(bId) - operatorIdSequence(aId)
  if (sequenceDiff) return sequenceDiff
  return String(bId).localeCompare(String(aId), 'en', { numeric: true, sensitivity: 'base' })
}
