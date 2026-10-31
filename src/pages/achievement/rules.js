export const STATUS_LABELS = Object.freeze({ incomplete: '未完成', completed: '已完成' })
export const completionStatus = record => record?.status === 'completed' ? 'completed' : 'incomplete'
export const PAGE_SIZE = 50
export const MAX_IMPORT_BYTES = 16 * 1024 * 1024
export const MAX_IMPORT_RECORDS = 5000
export const emptyRecord = id => ({ achievement_id: id, status: 'pending', favorite: false, note: '', progress: null, completed_on: null })

function rewardType(reward) {
  if (reward.icon === 'title') return '称号'
  if (reward.icon === 'frame') return '头像框'
  // shortcut: 单条奖励暂按名称前缀识别类型，奖励字典支持类型字段后改用明确类型。
  return ['头像框', '头像', '称号'].find(type => reward.name.trim().startsWith(type)) || ''
}

function matchesReward(reward, value) {
  return ['称号', '头像框', '头像'].includes(value) ? rewardType(reward) === value : reward.name.trim().toLocaleLowerCase() === value.toLocaleLowerCase()
}

export function achievementRewardOptions(catalog) {
  return catalog ? ['白金币', '称号', '功过格', '符传'] : []
}

export function pointRewardSources(catalog, filters) {
  const query = (filters.query || '').trim().toLocaleLowerCase()
  const reward = (filters.reward || '').trim()
  if (!query && !reward) return []
  return (catalog?.point_tracks || []).flatMap(track => {
    const category = catalog.categories.find(item => item.category_id === track.category_id)
    if (!category || (filters.category && filters.category !== category.category_id)) return []
    return track.tiers.filter(tier => (!query || tier.name.toLocaleLowerCase().includes(query)) && (!reward || matchesReward(tier, reward)))
      .map(tier => ({ ...tier, category_id: category.category_id, category_name: category.name }))
  })
}

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
    const legacyReward = entry.rewards == null ? legacyRewards[entry.achievement_id] || '' : ''
    const rewardMatches = entry.rewards == null
      ? (['称号', '头像框', '头像'].includes(reward) ? rewardType({ name: legacyReward }) === reward : legacyReward.toLocaleLowerCase().includes(reward))
      : entry.rewards.some(item => matchesReward(item, reward))
    return (!filters.category || entry.category_id === filters.category) &&
      (!filters.metric || entry.linked_metric === filters.metric) &&
      (!filters.status || completionStatus(record) === filters.status) &&
      (!filters.favorite || record.favorite) &&
      (!filters.hidden || entry.is_hidden === true) &&
      (!reward || rewardMatches) &&
      (!query || [entry.name, entry.condition, ...(entry.rewards?.map(item => item.name) || []), legacyReward]
        .join(' ').toLocaleLowerCase().includes(query))
  }).sort((a, b) =>
    (categories.findIndex(c => c.category_id === a.category_id) - categories.findIndex(c => c.category_id === b.category_id)) ||
    (filters.completedLast ? Number(completionStatus(byId.get(a.achievement_id)) === 'completed') - Number(completionStatus(byId.get(b.achievement_id)) === 'completed') : 0) ||
    a.sort - b.sort || a.achievement_id.localeCompare(b.achievement_id))
}

export function hasQuantifiedProgress(entry) {
  return Number.isSafeInteger(entry?.target) && entry.target > 0 && entry.target <= 1e12
}

export function linkedProgress(entry, metrics = []) {
  if (!entry.linked_metric || !hasQuantifiedProgress(entry)) return null
  const source = metrics.find(item => item.metric === entry.linked_metric)
  if (!source || !Number.isSafeInteger(source.value) || source.value < 0) return null
  return { value: source.value, displayed: Math.min(source.value, entry.target), reached: source.value >= entry.target }
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
