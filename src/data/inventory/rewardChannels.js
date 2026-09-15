import { ITEM_CATALOG, AGENT_CATALOG } from './catalog.js'
import { sortItemsByGameOrder } from './itemSections.js'
import { HIDDEN_AGENT_IDS } from './agentManifest.js'
import { isDispatchReward, staminaCostOf } from './exchange.js'

export const REWARD_CHANNELS = Object.freeze([
  { id: '派遣-洛阳', label: '派遣 · 洛阳', hint: '鸟食与白金币', entityType: 'item', icon: 'bird' },
  { id: '派遣-寿春', label: '派遣 · 寿春', hint: '密探心纸', entityType: 'agent', icon: 'flower' },
  { id: '据点情报', label: '据点情报', hint: '密探心纸', entityType: 'agent', icon: 'scroll' },
  { id: '历练', label: '历练', hint: '兵书与修为材料', entityType: 'item', icon: 'book' },
  { id: '手动补录', label: '其他奖励', hint: '自行选择类型', entityType: null, icon: 'pencil' },
])
const LUOYANG_IDS = new Set(['jizhi', 'sherou', 'mazi', 'zhuyu', 'baijinbi'])
const TRAINING_IDS = new Set([
  'liutaobingshu', 'bingshuquanjuan', 'bingshucanjuan',
  ...ITEM_CATALOG.filter(item => item.category === '修为进阶材料').map(item => item.id),
])
const METADATA = new Map([
  ...ITEM_CATALOG.map(item => [`item:${item.id}`, item]),
  ...AGENT_CATALOG.map(agent => [`agent:${agent.id}`, agent]),
])

function isSpAgent(entity) {
  return entity?.entity_type === 'agent' && (
    HIDDEN_AGENT_IDS.has(entity.id) ||
    entity.sp_of != null || entity.spOf != null || /sp$/i.test(entity.id)
  )
}

export function rewardOptionsForChannel(channel, entities, fallbackType = 'item') {
  const preset = REWARD_CHANNELS.find(item => item.id === channel)
  if (!preset) throw new TypeError('请选择获取渠道')
  const type = preset.entityType || fallbackType
  const options = entities.filter(entity => {
    if (entity.entity_type !== type) return false
    if (isSpAgent(entity)) return false
    if (channel === '派遣-洛阳') return LUOYANG_IDS.has(entity.id)
    if (channel === '历练') return TRAINING_IDS.has(entity.id)
    return true
  }).map(entity => ({ ...METADATA.get(`${type}:${entity.id}`), ...entity }))
  return type === 'item' ? sortItemsByGameOrder(options) : options.sort((a, b) => (b.rarity || 0) - (a.rarity || 0) || a.name.localeCompare(b.name, 'zh-CN'))
}

export function validateManualRewardChannel(record, entities, sourceChannel = record.acquisition_channel) {
  const options = rewardOptionsForChannel(sourceChannel, entities, record.entity_type)
  for (const entry of record.entries) {
    if (!options.some(option => option.id === entry.id && option.entity_type === record.entity_type)) {
      throw new TypeError(`「${entry.name || entry.id}」不属于此渠道的奖励范围`)
    }
    if (entry.id === 'baijinbi' && (!Number.isInteger(entry.count) || entry.count % 10 !== 0)) {
      throw new TypeError('白金币必须按 10 为单位添加')
    }
  }
  if (record.acquisition_channel !== sourceChannel && (!record.acquisition_channel || record.acquisition_channel.trim().length > 64)) {
    throw new TypeError('自定义获取渠道不能为空，且不能超过 64 个字符')
  }
  if (record.acquisition_channel !== sourceChannel && /[\r\n]/.test(record.acquisition_channel)) {
    throw new TypeError('自定义获取渠道不能包含换行')
  }
  if (isDispatchReward(record) && staminaCostOf(record) === undefined) {
    throw new TypeError('派遣奖励必须填写消耗体力数')
  }
  return record
}

export function manualRewardTimestamp(date, clock) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(clock)) {
    throw new TypeError('请填写有效的日期与时间，例如 2026-09-14、15:42:56')
  }
  const value = new Date(`${date}T${clock.length === 5 ? clock + ':00' : clock}`)
  const [year, month, day] = date.split('-').map(Number)
  const [hours, minutes] = clock.split(':').map(Number)
  if (!Number.isFinite(value.getTime()) || value.getFullYear() !== year || value.getMonth() + 1 !== month || value.getDate() !== day || value.getHours() !== hours || value.getMinutes() !== minutes) {
    throw new TypeError('该日期或时间不存在，请重新选择')
  }
  return value.toISOString()
}
