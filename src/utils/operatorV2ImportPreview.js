export function buildOperatorV2BrowserPreview(source, targetAccountId, currentEntries, targetGame) {
  if (source?.format !== 'myshare-operator-exchange' || Number(source.version) !== 2)
    throw new Error('请选择密探养成数据交换协议 v2 文档')
  if (!targetAccountId) throw new Error('请先选择导入目标账号')
  if (!Array.isArray(source.accounts)) throw new Error('档案中缺少来源账号')
  const sourceIds = [...new Set(source.accounts.map(account => String(account?.id || '').trim()).filter(Boolean))]
  if (sourceIds.length !== 1) throw new Error('当前导入面板一次只支持一个来源账号')
  if (!Array.isArray(source.records) || !source.records.length) throw new Error('档案中没有可导入的记录')
  const entries = new Map()
  let fullCount = 0
  for (const record of source.records) {
    if (record?.account_id !== sourceIds[0]) throw new Error('记录与来源账号不一致')
    if (targetGame && record.game !== targetGame) throw new Error('档案游戏版本与当前目标账号不一致')
    if (!Array.isArray(record.entries)) throw new Error('档案记录缺少密探列表')
    if (record.snapshot_scope === 'full') fullCount++
    for (const entry of record.entries) {
      if (!entry?.id) throw new Error('档案中存在缺少编号的密探')
      entries.set(entry.id, { id: entry.id, name: entry.name || entry.id })
    }
  }
  const existingIds = Object.keys(currentEntries || {})
  const document = {
    ...source,
    accounts: source.accounts.map(account => ({ ...account, id: targetAccountId })),
    records: source.records.map(record => ({ ...record, account_id: targetAccountId })),
  }
  return {
    document,
    recordCount: source.records.length,
    fullCount,
    entries: [...entries.values()],
    overlapCount: existingIds.filter(id => entries.has(id)).length,
    possibleRemovedCount: fullCount ? existingIds.filter(id => !entries.has(id)).length : 0,
  }
}
