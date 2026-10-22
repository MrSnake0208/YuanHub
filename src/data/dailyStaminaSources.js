import { monthlyCardTier } from './monthlyCard.js'

export const MONTHLY_STAMINA_IDS = ['monthly-card-daily', 'monthly-card-shop']
export function emptyStaminaSources() {
  return { monthlyCard: { tier: 'none', dailyEnabled: false, shopEnabled: false, dailyAmount: 0, shopAmount: 20, startDate: '', endDate: '' }, fixedSources: [] }
}
const amount = value => Math.max(0, Math.min(99999, Math.trunc(Number(value)) || 0))
export function normalizeStaminaSources(raw) {
  const base = emptyStaminaSources(), card = raw?.monthlyCard || {}
  return { monthlyCard: { ...base.monthlyCard, ...card, tier: monthlyCardTier(card.tier).id,
    dailyEnabled: card.dailyEnabled === true, shopEnabled: card.shopEnabled === true,
    dailyAmount: amount(card.dailyAmount), shopAmount: card.shopAmount == null ? 20 : amount(card.shopAmount) },
  fixedSources: (raw?.fixedSources || []).map(source => ({ id: String(source.id), label: String(source.label).slice(0, 32),
    value: amount(source.value), enabled: source.enabled === true })) }
}
export function validateStaminaSources(raw) {
  const card = raw.monthlyCard
  if (monthlyCardTier(card.tier).id !== card.tier) throw new Error('请选择有效的月卡档位')
  for (const value of [card.dailyAmount, card.shopAmount, ...raw.fixedSources.map(source => source.value)]) {
    if (!Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 99999 || value === '') throw new Error('每日体力请输入 0–99999 的整数')
  }
  const validDate = date => !date || /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date + 'T00:00:00Z')) && new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date
  if (!validDate(card.startDate) || !validDate(card.endDate) || card.startDate && card.endDate && card.startDate > card.endDate) throw new Error('请填写正确的月卡生效日期范围')
  const ids = new Set()
  if (raw.fixedSources.length > 32) throw new Error('最多设置32个每日固定来源')
  for (const source of raw.fixedSources) {
    if (!source.label.trim() || source.label.trim().length > 32 || !source.id || ['buy', 'reserve', 'required-extra', 'diagnostic-budget', ...MONTHLY_STAMINA_IDS].includes(source.id) || source.id.startsWith('planner-reserve-') || ids.has(source.id)) throw new Error('固定来源名称不能为空，且同一来源只能设置一次；购买和一次性储备请使用原有设置')
    ids.add(source.id)
  }
  return normalizeStaminaSources({ ...raw, fixedSources: raw.fixedSources.map(source => ({ ...source, label: source.label.trim() })) })
}

export function withSourcePeriod(preferences, sources, fromDate) {
  return { ...preferences, sourcePeriods: [...(preferences.sourcePeriods || []).filter(period => period.fromDate < fromDate),
    { fromDate, sources: validateStaminaSources(sources) }] }
}

export function sourcesForDate(preferences, date) {
  return (preferences?.sourcePeriods || []).filter(period => period.fromDate <= date).at(-1)?.sources
}

export function withMonthlyCardPeriod(preferences, monthlyCard, fromDate) {
  const card = validateStaminaSources({ monthlyCard, fixedSources: [] }).monthlyCard
  const periods = preferences.sourcePeriods || []
  const update = sources => ({ ...(sources || emptyStaminaSources()), monthlyCard: { ...card } })
  return { ...preferences, sourcePeriods: [
    ...periods.filter(period => period.fromDate < fromDate),
    { fromDate, sources: update(sourcesForDate(preferences, fromDate)) },
    ...periods.filter(period => period.fromDate > fromDate).map(period => ({ ...period, sources: update(period.sources) })),
  ] }
}

// 规则按ID替换推荐来源；整日手工覆盖由调用方优先处理。
export function resolveDailyStaminaGains(gains, preferences, date) {
  const sources = sourcesForDate(preferences, date)
  if (!sources) return gains
  const replacements = new Map()
  const gain = (id, label, value, colorKey = 'custom') => ({ id, label, kind: 'energy', value, rec: value, colorKey,
    custom: !['natural', 'meal', 'mail', 'event', 'gift', ...MONTHLY_STAMINA_IDS].includes(id), name: label })
  for (const source of sources.fixedSources) replacements.set(source.id, gain(source.id, source.label, source.enabled ? source.value : 0))
  const card = sources.monthlyCard
  const active = card.tier !== 'none' && (!card.startDate || date >= card.startDate) && (!card.endDate || date <= card.endDate)
  replacements.set(MONTHLY_STAMINA_IDS[0], gain(MONTHLY_STAMINA_IDS[0], '月卡每日奖励', active && card.dailyEnabled ? card.dailyAmount : 0))
  replacements.set(MONTHLY_STAMINA_IDS[1], gain(MONTHLY_STAMINA_IDS[1], '月卡商店免费体力', active && card.shopEnabled ? card.shopAmount : 0))
  return [...gains.filter(entry => !replacements.has(entry.id)), ...[...replacements.values()].filter(entry => entry.value > 0)]
}
