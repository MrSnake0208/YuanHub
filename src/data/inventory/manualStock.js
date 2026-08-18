export function nextManualSnapshotTime(fullBaselineAt, listedBaselineTimes, now) {
  let timestamp = now == null ? Date.now() : Number(now)
  const baselines = [fullBaselineAt].concat(listedBaselineTimes || [])
  baselines.forEach(function (value) {
    const baseline = Date.parse(value || '')
    if (!isNaN(baseline)) timestamp = Math.max(timestamp, baseline + 1)
  })
  return new Date(timestamp).toISOString()
}

export function buildManualStockSnapshot({ accountId, catalogVersion, effectiveAt, recordId, entries }) {
  return {
    format: 'myshare-inventory-exchange',
    version: 2,
    exported_at: effectiveAt,
    catalog_version: catalogVersion,
    producer: { platform: 'yuanhub', version: '1' },
    records: [{
      account_id: accountId,
      record_id: recordId,
      record_type: 'stock_snapshot',
      entity_type: 'item',
      acquisition_channel: '手动调整',
      effective_at: effectiveAt,
      snapshot_scope: 'full',
      entries: entries.filter(function (entry) { return entry.count > 0 })
    }]
  }
}

export function preserveHiddenStockEntries(draftEntries, currentEntries, hiddenItemIds) {
  const hiddenIds = new Set(hiddenItemIds || [])
  const visibleDraft = draftEntries.filter(function (entry) { return !hiddenIds.has(entry.id) })
  const hiddenCurrent = currentEntries.filter(function (entry) {
    return hiddenIds.has(entry.id) && Number(entry.count) > 0
  }).map(function (entry) {
    return { id: entry.id, name: entry.name || entry.id, count: Number(entry.count) }
  })
  return visibleDraft.concat(hiddenCurrent)
}
