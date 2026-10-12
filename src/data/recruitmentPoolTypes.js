import { EVENT_TYPE_COLORS } from './eventTypeColors.js'

export const RECRUITMENT_POOL_TYPES = Object.freeze({
  limited: { label: '限定', color: 'gold', coverTone: 'limited' },
  rerun: { label: '复刻', color: 'blue', coverTone: 'rerun' },
  zhaoying: { label: '照影', color: 'purple', coverTone: 'zhaoying' },
  choice: { label: '自选', color: 'rouge', coverTone: 'choice' },
  permanent: { label: '常驻', color: 'neutral', coverTone: 'neutral' },
  unknown: { label: '类型未标注', color: 'neutral', coverTone: 'neutral' },
})

const aliases = Object.freeze({
  limited: 'limited', rerun: 'rerun', zhaoying: 'zhaoying', choice: 'choice', select: 'choice',
  permanent: 'permanent', standard: 'permanent', '傅融地宫': 'limited', '重逢限定': 'limited',
})

// pool_type is catalog data, never an event title. Only reviewed aliases/combinations qualify.
export function normalizeRecruitmentPoolType(value) {
  if (typeof value !== 'string') return 'unknown'
  const type = value.trim().toLowerCase()
  if (Object.hasOwn(aliases, type)) return aliases[type]
  if (/^常驻(?:卡池|招募)?$/.test(type)) return 'permanent'
  if (!/^(?:自选|照影|复刻|限定)+(?:卡池|招募)?$/.test(type)) return 'unknown'
  if (type.includes('自选')) return 'choice'
  if (type.includes('照影')) return 'zhaoying'
  if (type.includes('复刻')) return 'rerun'
  return 'limited'
}

export function recruitmentPoolType(value) { return RECRUITMENT_POOL_TYPES[normalizeRecruitmentPoolType(value)] }
export function recruitmentCoverStyle(value) { return { '--cover-tone': EVENT_TYPE_COLORS[recruitmentPoolType(value).color].cover } }

export function isPermanentRecruitmentPool(pool) {
  return normalizeRecruitmentPoolType(pool?.pool_type) === 'permanent' && !pool?.end_date
}

export function recruitmentPoolDateLabel(pool) {
  if (isPermanentRecruitmentPool(pool)) return (pool?.start_date ? pool.start_date + ' — ' : '') + '常驻 · 无限期'
  return (pool?.start_date || '开始日期未知') + ' — ' + (pool?.end_date || '结束日期未知')
}
