export const STATUS_LABELS = Object.freeze({ incomplete: '未完成', completed: '已完成' })
export const completionStatus = record => record?.status === 'completed' ? 'completed' : 'incomplete'
export const PAGE_SIZE = 50
export const MAX_IMPORT_BYTES = 16 * 1024 * 1024
export const MAX_IMPORT_RECORDS = 5000
export const emptyRecord = id => ({ achievement_id: id, status: 'pending', favorite: false, note: '', progress: null, completed_on: null })

export function summarizeAchievements(entries, records) {
  const byId = new Map(records.map(record => [record.achievement_id, record]))
  const result = { total: entries.length, incomplete: 0, completed: 0, favorite: 0 }
  for (const entry of entries) {
    const record = byId.get(entry.achievement_id)
    result[completionStatus(record)]++
    if (record?.favorite) result.favorite++
  }
  return result
}

export function filterAchievements(entries, records, filters, categories = [], legacyRewards = {}) {
  const byId = new Map(records.map(record => [record.achievement_id, record]))
  const query = filters.query.trim().toLocaleLowerCase()
  const reward = (filters.reward || '').trim().toLocaleLowerCase()
  return entries.filter(entry => {
    const record = byId.get(entry.achievement_id) || emptyRecord(entry.achievement_id)
    return (!filters.category || entry.category_id === filters.category) &&
      (!filters.status || completionStatus(record) === filters.status) &&
      (!filters.favorite || record.favorite) &&
      (!filters.hidden || entry.is_hidden === true) &&
      (!reward || rewardText(entry, legacyRewards[entry.achievement_id]).toLocaleLowerCase().includes(reward)) &&
      (!query || [entry.name, entry.condition]
        .join(' ').toLocaleLowerCase().includes(query))
  }).sort((a, b) => (categories.findIndex(c => c.category_id === a.category_id) - categories.findIndex(c => c.category_id === b.category_id)) || a.sort - b.sort || a.achievement_id.localeCompare(b.achievement_id))
}

export function hasQuantifiedProgress(entry) {
  return Number.isSafeInteger(entry?.target) && entry.target > 0 && entry.target <= 1e12
}

export function progressValidationError(entry, value) {
  if (!hasQuantifiedProgress(entry)) return '此成就不支持数值进度。'
  if (value === '') return ''
  if (!/^\d+$/.test(String(value))) return '此成就的进度必须为整数。'
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0 || number > Number.MAX_SAFE_INTEGER) return '请输入 0 到 9007199254740991 之间的有效数值。'
  if (!Number.isSafeInteger(number)) return '此成就的进度必须为整数。'
  return ''
}

export function readAchievementBackup(text) {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) throw new Error('文件最多16MiB。')
  let document
  try { document = JSON.parse(text) } catch { throw new Error('JSON 损坏，请选择完整的成就备份文件。') }
  if (!document || document.format !== 'yuanhub-achievement' || document.schema_version !== 1) throw new Error('不支持的成就备份格式或版本。')
  if (!Array.isArray(document.records) || document.records.length > MAX_IMPORT_RECORDS) throw new Error('备份最多包含5000条记录。')
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

export function rewardText(entry, legacyReward) {
  if (entry.rewards == null) return legacyReward ? legacyReward + '（旧文本，未结构化）' : '奖励资料未补齐'
  return entry.rewards.length ? entry.rewards.map(item => `${item.name} × ${item.quantity}`).join('、') : '无奖励'
}

export function rewardValidationError(reward, index, rewards, items, game) {
  const item = items.find(item => item.item_key === reward.item_key && item.games.includes(game))
  if (!item || item.name !== reward.name) return '请选择当前游戏的奖励物品。'
  if (rewards.findIndex(item => item.item_key === reward.item_key) !== index) return '同一成就不能重复填写相同物品。'
  if (!Number.isSafeInteger(reward.quantity) || reward.quantity <= 0) return '奖励数量须为正安全整数。'
  if (rewards.reduce((total, item) => total + BigInt(Number.isSafeInteger(item.quantity) && item.quantity > 0 ? item.quantity : 0), 0n) > BigInt(Number.MAX_SAFE_INTEGER)) return '奖励数量合计超过安全整数。'
  return ''
}
