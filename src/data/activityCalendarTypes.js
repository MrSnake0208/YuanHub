import { eventTypeStyle } from './eventTypeColors.js'
import { recruitmentPoolType } from './recruitmentPoolTypes.js'

export const CALENDAR_DISPLAY_GROUPS = Object.freeze({ ACTIVITY: '活动', RECRUITMENT: '卡池', SHOP: '商店', OTHER: '其他' })
export const CALENDAR_SUBTYPES = Object.freeze({
  LARGE_EVENT: { label: '大型活动', group: 'ACTIVITY', categories: ['ACTIVITY'], color: 'rouge' },
  MEDIUM_EVENT: { label: '中型活动', group: 'ACTIVITY', categories: ['ACTIVITY'], color: 'rouge' },
  UNDERGROUND: { label: '地宫', group: 'ACTIVITY', categories: ['ACTIVITY'], color: 'purple', association: '关联类型：地宫 / 泰山府 · 档期以各条记录为准' },
  TAISHAN_FU: { label: '泰山府', group: 'ACTIVITY', categories: ['ACTIVITY'], color: 'purple', association: '关联类型：地宫 / 泰山府 · 档期以各条记录为准' },
  SIGN_IN: { label: '签到', group: 'ACTIVITY', categories: ['ACTIVITY', 'LOGIN'], color: 'blue' },
  FURNITURE: { label: '家具', group: 'ACTIVITY', categories: ['ACTIVITY'], color: 'yellow', association: '关联内容：家具 / 神秘洞窟 · 同档日期由资料维护者核对' },
  RECRUITMENT_SHOP: { label: '卡池商店', group: 'SHOP', categories: ['SHOP'], color: 'gray' },
  ACTIVITY_SHOP: { label: '活动商店', group: 'SHOP', categories: ['SHOP'], color: 'gray' },
  MAINTENANCE: { label: '维护', group: 'OTHER', categories: ['OTHER', 'MAINTENANCE'], color: 'gray' },
  STAR_POOL: { label: '星池', group: 'OTHER', categories: ['OTHER'], color: 'orange' },
})
export const CALENDAR_SUBTYPE_DETAILS = Object.freeze({ MYSTERIOUS_CAVE: { label: '神秘洞窟', subtype: 'FURNITURE' } })

export function calendarDisplay(item) {
  if (item.source_type === 'PRIVATE_ITEM') return { group: 'PRIVATE_ITEM', groupLabel: '私人事项', label: '私人事项', path: '私人事项', color: 'tea', style: eventTypeStyle('tea') }
  const group = ({ LOGIN: 'ACTIVITY', MAINTENANCE: 'OTHER' })[item.category] || (Object.hasOwn(CALENDAR_DISPLAY_GROUPS, item.category) ? item.category : 'OTHER')
  let type
  if (item.category === 'RECRUITMENT') type = recruitmentPoolType(item.pool_type)
  else {
    const subtype = item.subtype || ({ LOGIN: 'SIGN_IN', MAINTENANCE: 'MAINTENANCE' })[item.category]
    const known = Object.hasOwn(CALENDAR_SUBTYPES, subtype) ? CALENDAR_SUBTYPES[subtype] : null
    type = known?.categories.includes(item.category) ? known : { label: '类型未标注', color: item.category === 'SHOP' && !item.subtype ? 'gray' : 'neutral' }
  }
  const detail = Object.hasOwn(CALENDAR_SUBTYPE_DETAILS, item.subtype_detail) ? CALENDAR_SUBTYPE_DETAILS[item.subtype_detail] : null
  const label = type.label + (detail && detail.subtype === item.subtype ? ` · ${detail.label}` : '')
  return { ...type, group, groupLabel: CALENDAR_DISPLAY_GROUPS[group], label, path: `${CALENDAR_DISPLAY_GROUPS[group]} · ${label}`, style: eventTypeStyle(type.color) }
}

export function validateCalendarClassification(form) {
  const errors = {}
  if (form.subtype && (!Object.hasOwn(CALENDAR_SUBTYPES, form.subtype) || !CALENDAR_SUBTYPES[form.subtype].categories.includes(form.category))) errors.subtype = '请选择与活动类别匹配的细分类别。'
  if (form.subtype_detail && (!Object.hasOwn(CALENDAR_SUBTYPE_DETAILS, form.subtype_detail) || CALENDAR_SUBTYPE_DETAILS[form.subtype_detail].subtype !== form.subtype)) errors.subtype_detail = '神秘洞窟必须属于活动下的家具。'
  return errors
}
