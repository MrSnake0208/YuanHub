import { eventTypeStyle } from './eventTypeColors.js'
import { recruitmentPoolType } from './recruitmentPoolTypes.js'

export const CALENDAR_DISPLAY_GROUPS = Object.freeze({ ACTIVITY: '活动', RECRUITMENT: '卡池', FURNITURE: '家具', OTHER: '其他' })
export const CALENDAR_SUBTYPES = Object.freeze({
  LARGE_EVENT: { label: '大型/周年', group: 'ACTIVITY', categories: ['ACTIVITY'], color: 'rouge' },
  MEDIUM_EVENT: { legacy: true, label: '中型活动', group: 'ACTIVITY', categories: ['ACTIVITY'], color: 'rouge' },
  UNDERGROUND: { label: '地宫', group: 'ACTIVITY', categories: ['ACTIVITY'], color: 'purple', association: '关联类型：地宫 / 泰山府 · 档期以各条记录为准' },
  TAISHAN_FU: { legacy: true, label: '泰山府', group: 'ACTIVITY', categories: ['ACTIVITY'], color: 'purple', association: '关联类型：地宫 / 泰山府 · 档期以各条记录为准' },
  SIGN_IN: { label: '签到/楼主查岗', group: 'ACTIVITY', categories: ['ACTIVITY', 'LOGIN'], color: 'blue' },
  FURNITURE: { legacy: true, label: '家具', group: 'FURNITURE', categories: ['ACTIVITY'], color: 'yellow', association: '关联内容：家具 / 神秘洞窟 · 同档日期由资料维护者核对' },
  RECRUITMENT_SHOP: { legacy: true, label: '卡池商店', group: 'OTHER', categories: ['SHOP'], color: 'gray' },
  ACTIVITY_SHOP: { legacy: true, label: '活动商店', group: 'OTHER', categories: ['SHOP'], color: 'gray' },
  FIRST_MEETING_ROULETTE: { label: '初见日/转盘', group: 'ACTIVITY', categories: ['ACTIVITY'], color: 'blue' },
  FURNITURE_TRIAL: { label: '历练', group: 'FURNITURE', categories: ['ACTIVITY'], color: 'yellow' },
  MYSTERIOUS_CAVE: { label: '神秘洞窟', group: 'FURNITURE', categories: ['ACTIVITY'], color: 'yellow' },
  MAINTENANCE: { label: '维护', group: 'OTHER', categories: ['OTHER', 'MAINTENANCE'], color: 'gray' },
  SHOP: { label: '商店', group: 'OTHER', categories: ['SHOP'], color: 'gray' },
  STAR_POOL: { label: '星池', group: 'OTHER', categories: ['OTHER'], color: 'orange' },
})
export const CALENDAR_SUBTYPE_DETAILS = Object.freeze({ MYSTERIOUS_CAVE: { label: '神秘洞窟', subtype: 'FURNITURE' } })

export function calendarUpAgentDisplay(item) {
  if (item.source_type !== 'RECRUITMENT_POOL' || item.category !== 'RECRUITMENT' || !item.up_agent_names?.length) return null
  const names = item.up_agent_names
  const summary = count => names.slice(0, count).join(' / ') + (names.length > count ? ` +${names.length - count}` : '')
  return { full: `UP 密探：${names.join('、')}`, summary: summary(2), narrow: summary(1) }
}

export function calendarDisplay(item) {
  if (item.source_type === 'PRIVATE_ITEM') return { group: 'PRIVATE_ITEM', groupLabel: '私人事项', label: '私人事项', path: '私人事项', color: 'tea', style: eventTypeStyle('tea') }
  let group = ({ LOGIN: 'ACTIVITY', MAINTENANCE: 'OTHER', SHOP: 'OTHER' })[item.category] || (Object.hasOwn(CALENDAR_DISPLAY_GROUPS, item.category) ? item.category : 'OTHER')
  let type, key = ''
  if (item.category === 'RECRUITMENT') {
    type = recruitmentPoolType(item.pool_type)
    if (!['限定', '复刻', '照影', '自选'].includes(type.label)) type = { ...type, label: type.label + '（待归类）' }
  } else {
    let subtype = item.subtype || ({ LOGIN: 'SIGN_IN', MAINTENANCE: 'MAINTENANCE', SHOP: 'SHOP' })[item.category]
    if (item.category === 'SHOP' && ['RECRUITMENT_SHOP', 'ACTIVITY_SHOP'].includes(subtype)) subtype = 'SHOP'
    if (item.category === 'ACTIVITY' && subtype === 'FURNITURE' && item.subtype_detail === 'MYSTERIOUS_CAVE') subtype = 'MYSTERIOUS_CAVE'
    const known = Object.hasOwn(CALENDAR_SUBTYPES, subtype) ? CALENDAR_SUBTYPES[subtype] : null
    type = known?.categories.includes(item.category) ? known : { label: '类型未标注', color: 'neutral' }
    if (known?.categories.includes(item.category)) {
      group = known.group
      if (!known.legacy) key = subtype
      else type = { ...type, label: type.label + '（待归类）' }
    }
  }
  return { ...type, key, group, groupLabel: CALENDAR_DISPLAY_GROUPS[group], path: `${CALENDAR_DISPLAY_GROUPS[group]} · ${type.label}`, style: eventTypeStyle(type.color) }
}

export function validateCalendarClassification(form) {
  const errors = {}
  if (form.subtype && (!Object.hasOwn(CALENDAR_SUBTYPES, form.subtype) || !CALENDAR_SUBTYPES[form.subtype].categories.includes(form.category))) errors.subtype = '请选择与活动类别匹配的细分类别。'
  if (form.subtype_detail && (!Object.hasOwn(CALENDAR_SUBTYPE_DETAILS, form.subtype_detail) || CALENDAR_SUBTYPE_DETAILS[form.subtype_detail].subtype !== form.subtype)) errors.subtype_detail = '神秘洞窟必须属于活动下的家具。'
  return errors
}
