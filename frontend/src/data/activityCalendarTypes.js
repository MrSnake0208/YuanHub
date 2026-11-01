import { eventTypeStyle } from './eventTypeColors.js'
import { recruitmentPoolType } from './recruitmentPoolTypes.js'

export const CALENDAR_DISPLAY_GROUPS = Object.freeze({ ACTIVITY: '活动', PERMANENT: '常驻', RECRUITMENT: '卡池', OTHER: '其他' })
export const CALENDAR_SUBTYPES = Object.freeze({
  LARGE_EVENT: { label: '活动/周年', group: 'ACTIVITY', categories: ['ACTIVITY'], color: 'rouge' },
  UNDERGROUND: { label: '地宫/鸢会', group: 'ACTIVITY', categories: ['ACTIVITY'], color: 'purple' },
  SIGN_IN: { label: '签到/查岗', group: 'ACTIVITY', categories: ['ACTIVITY', 'LOGIN'], color: 'blue' },
  SEASONAL_STAR_CHART: { label: '当季星图', group: 'PERMANENT', categories: ['ACTIVITY'], color: 'orange' },
  WHITE_PIGEON: { label: '白鸽', group: 'PERMANENT', categories: ['ACTIVITY'], color: 'blue' },
  AGENT_TRAINING: { label: '密探特训', group: 'PERMANENT', categories: ['ACTIVITY'], color: 'rouge' },
  TRIAL_CAVE: { label: '历练/洞窟', group: 'PERMANENT', categories: ['ACTIVITY'], color: 'yellow' },
  OTHER: { label: '其他', group: 'OTHER', categories: ['OTHER'], color: 'gray' },
  FURNITURE_TRIAL: { legacy: true, target: 'TRIAL_CAVE', label: '历练', categories: ['ACTIVITY'], color: 'yellow' },
  MYSTERIOUS_CAVE: { legacy: true, target: 'TRIAL_CAVE', label: '神秘洞窟', categories: ['ACTIVITY'], color: 'yellow' },
  MEDIUM_EVENT: { legacy: true, label: '中型活动', categories: ['ACTIVITY'], color: 'rouge' },
  TAISHAN_FU: { legacy: true, label: '泰山府', categories: ['ACTIVITY'], color: 'purple' },
  FURNITURE: { legacy: true, label: '家具', categories: ['ACTIVITY'], color: 'yellow' },
  FIRST_MEETING_ROULETTE: { legacy: true, label: '初见日/转盘', categories: ['ACTIVITY'], color: 'blue' },
  RECRUITMENT_SHOP: { legacy: true, label: '卡池商店', categories: ['SHOP'], color: 'gray' },
  ACTIVITY_SHOP: { legacy: true, label: '活动商店', categories: ['SHOP'], color: 'gray' },
  MAINTENANCE: { legacy: true, label: '维护', categories: ['OTHER', 'MAINTENANCE'], color: 'gray' },
  SHOP: { legacy: true, label: '商店', categories: ['SHOP'], color: 'gray' },
  STAR_POOL: { legacy: true, label: '星池', categories: ['OTHER'], color: 'orange' },
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
  if (item.category === 'RECRUITMENT') {
    let type = recruitmentPoolType(item.pool_type)
    if (!['限定', '复刻', '照影', '自选'].includes(type.label)) type = { ...type, label: type.label + '（待归类）' }
    return { ...type, key: '', group: 'RECRUITMENT', groupLabel: '卡池', path: `卡池 · ${type.label}`, style: eventTypeStyle(type.color) }
  }
  let subtype = item.subtype || ({ LOGIN: 'SIGN_IN', MAINTENANCE: 'MAINTENANCE', SHOP: 'SHOP' })[item.category]
  if (item.category === 'ACTIVITY' && subtype === 'FURNITURE' && item.subtype_detail === 'MYSTERIOUS_CAVE') subtype = 'MYSTERIOUS_CAVE'
  const known = Object.hasOwn(CALENDAR_SUBTYPES, subtype) ? CALENDAR_SUBTYPES[subtype] : null
  const valid = known?.categories.includes(item.category) && (!item.subtype_detail || (item.subtype === 'FURNITURE' && item.subtype_detail === 'MYSTERIOUS_CAVE'))
  const original = [item.category, item.subtype, item.subtype_detail].filter(Boolean).join(' / ')
  if (valid && (!known.legacy || known.target)) {
    const type = known.target ? CALENDAR_SUBTYPES[known.target] : known
    const key = known.legacy ? '' : subtype
    return { ...type, key, original, preserved: known.legacy || item.category !== type.categories[0] || !item.subtype, groupLabel: CALENDAR_DISPLAY_GROUPS[type.group], path: `${CALENDAR_DISPLAY_GROUPS[type.group]} · ${type.label}`, style: eventTypeStyle(type.color) }
  }
  const type = valid ? known : { label: '类型未标注', color: 'neutral' }
  return { ...type, key: '', original, group: 'UNCLASSIFIED', groupLabel: '待归类', path: `待归类 · ${type.label}`, style: eventTypeStyle(type.color) }
}

export function validateCalendarClassification(form) {
  const errors = {}
  if (form.subtype && (form.subtype === 'SHOP' || !Object.hasOwn(CALENDAR_SUBTYPES, form.subtype) || !CALENDAR_SUBTYPES[form.subtype].categories.includes(form.category))) errors.subtype = '请选择与活动类别匹配的细分类别。'
  if (form.subtype_detail && (!Object.hasOwn(CALENDAR_SUBTYPE_DETAILS, form.subtype_detail) || CALENDAR_SUBTYPE_DETAILS[form.subtype_detail].subtype !== form.subtype)) errors.subtype_detail = '神秘洞窟必须属于活动下的家具。'
  return errors
}
