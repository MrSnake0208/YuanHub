export const STATUS_LABELS = Object.freeze({ pending: '待核对', incomplete: '未完成', completed: '已完成' })
export const PAGE_SIZE = 50
export const MAX_IMPORT_BYTES = 1048576
export const emptyRecord = id => ({ achievement_id: id, status: 'pending', favorite: false, note: '', progress: null, completed_on: null })

export function summarizeAchievements(entries, records) {
  const byId = new Map(records.map(record => [record.achievement_id, record]))
  const result = { total: entries.length, pending: 0, incomplete: 0, completed: 0, favorite: 0 }
  for (const entry of entries) {
    const record = byId.get(entry.achievement_id)
    result[record?.status || 'pending']++
    if (record?.favorite) result.favorite++
  }
  return result
}

export function filterAchievements(entries, records, filters) {
  const byId = new Map(records.map(record => [record.achievement_id, record]))
  const query = filters.query.trim().toLocaleLowerCase()
  const reward = (filters.reward || '').trim().toLocaleLowerCase()
  return entries.filter(entry => {
    const record = byId.get(entry.achievement_id) || emptyRecord(entry.achievement_id)
    return (!filters.category || entry.category_id === filters.category) &&
      (!filters.status || record.status === filters.status) &&
      (!filters.favorite || record.favorite) &&
      (!filters.hidden || entry.is_hidden === true) &&
      (!reward || (entry.reward || '').toLocaleLowerCase().includes(reward)) &&
      (!query || [entry.name, entry.condition, ...(entry.aliases || []), ...(entry.operators || []).map(operator => operator.name)]
        .join(' ').toLocaleLowerCase().includes(query))
  }).sort((a, b) => a.sort - b.sort || a.achievement_id.localeCompare(b.achievement_id))
}

export function hasQuantifiedProgress(entry) {
  return ['integer', 'number'].includes(entry?.progress_kind) && Number.isFinite(entry.target) && entry.target > 0
}

export function readAchievementBackup(text) {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) throw new Error('文件最多1MiB。')
  let document
  try { document = JSON.parse(text) } catch { throw new Error('JSON 损坏，请选择完整的成就备份文件。') }
  if (!document || document.format !== 'yuanhub-achievement' || document.schema_version !== 1) throw new Error('不支持的成就备份格式或版本。')
  if (!Array.isArray(document.records) || document.records.length > 1000) throw new Error('备份最多包含1000条记录。')
  return document
}

export function downloadAchievementBackup(document) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(document)], { type: 'application/json' }))
  const link = window.document.createElement('a')
  link.href = url
  link.download = 'YuanHub-成就档案-' + document.game + '-' + new Date().toISOString().slice(0, 10) + '.json'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
