const clone = value => JSON.parse(JSON.stringify(value))
export const CUSTOM_DAILY_SPENDS_FEATURE = 'custom-daily-spends-v1'
const validId = id => typeof id === 'string' && /^custom-spend-[A-Za-z0-9-]{1,100}$/.test(id)
const validDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date || '') && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date
const nonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0

export function canonicalPlannerYield(resources = {}) {
  const result = {}
  for (const [id, value] of Object.entries(resources || {})) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 0) continue
    const amount = Math.min(Number.MAX_SAFE_INTEGER, parsed)
    const key = BOOK_VALUES[id] ? '__xp__' : id
    result[key] = (result[key] || 0) + amount * (BOOK_VALUES[id] || 1)
  }
  return result
}

export function customSpendTemplate(spend) {
  const label = Object.hasOwn(spend, 'name') ? spend.name : spend.label
  if (typeof label !== 'string' || !spend.yield || Array.isArray(spend.yield) || typeof spend.yield !== 'object') throw new Error('常用支出名称或产出格式无效')
  const item = { id: spend.id, label: label.trim(), costPer: spend.costPer, yield: clone(spend.yield) }
  if (!validId(item.id) || !item.label || item.label.length > 32 || !nonnegative(item.costPer) ||
      Object.values(item.yield).some(value => !nonnegative(value))) throw new Error('请填写1至32字名称、非负体力和产出')
  item.yield = canonicalPlannerYield(item.yield)
  return item
}

export function validateCustomSpendTemplates(templates) {
  if (!Array.isArray(templates) || templates.length > 32 || new Set(templates.map(item => item.id)).size !== templates.length) throw new Error('常用支出最多32项，项目不能重复')
  return templates.map(customSpendTemplate)
}

export function normalizeCustomSpendRules(rules = []) {
  if (!Array.isArray(rules) || rules.length > 32 || new Set(rules.map(rule => rule.id)).size !== rules.length) throw new Error('每日安排最多32项，项目不能重复')
  return rules.map(rule => {
    if (!validId(rule.id) || !Array.isArray(rule.versions) || !rule.versions.length || rule.versions.length > 366) throw new Error('每日安排格式无效')
    let previous = ''
    return { id: rule.id, versions: rule.versions.map(version => {
      if (!validDate(version.fromDate) || version.fromDate <= previous || typeof version.enabled !== 'boolean') throw new Error('每日安排生效日期必须有序且不重复')
      previous = version.fromDate
      if (!version.enabled && !version.item) return { fromDate: version.fromDate, enabled: false }
      if (!Number.isSafeInteger(version.count) || version.count < 0 || version.count > 9999) throw new Error('每天次数须为0至9999的整数')
      const { id, ...item } = customSpendTemplate({ ...version.item, id: rule.id })
      return { fromDate: version.fromDate, enabled: version.enabled, count: version.count, item }
    }) }
  })
}

export function customSpendRuleAt(rule, date) {
  return rule?.versions?.findLast(version => version.fromDate <= date) || null
}

export function customSpendFromTemplate(item, count = 1) {
  const template = customSpendTemplate(item)
  return { ...template, name: template.label, value: count, rec: count, kind: 'custom', custom: true, colorKey: 'custom', fixed: true }
}

// A missing overridden row means skip; unrelated manual rows are retained.
export function mergeCustomSpendRules(plan, rules = [], date) {
  if (!rules.length) return clone(plan)
  const next = clone(plan), overrides = new Set(next.customSpendOverrides || [])
  for (const rule of rules) {
    if (overrides.has(rule.id)) continue
    const version = customSpendRuleAt(rule, date)
    if (!version) continue
    next.spends = next.spends.filter(spend => spend.id !== rule.id)
    if (version?.enabled) next.spends.push(customSpendFromTemplate({ id: rule.id, ...version.item }, version.count))
  }
  return next
}

export function markCustomSpendOverride(plan, rules, id) {
  if (rules?.some(rule => rule.id === id)) plan.customSpendOverrides = [...new Set([...(plan.customSpendOverrides || []), id])]
  return plan
}

export function replaceCustomSpendRule(rules, id, version) {
  const next = clone(rules || []), rule = next.find(item => item.id === id)
  const earlier = (rule?.versions || []).filter(item => item.fromDate < version.fromDate)
  const updated = clone(version)
  // Cancelling before the first effective day must retain enough data to restore.
  if (!updated.enabled && !earlier.some(item => item.item)) {
    const snapshot = [...(rule?.versions || [])].reverse().find(item => item.item && item.fromDate <= version.fromDate)
      || rule?.versions.find(item => item.item)
    if (snapshot) Object.assign(updated, { item: snapshot.item, count: snapshot.count })
  }
  const versions = [...earlier, updated]
  if (rule) rule.versions = versions
  else next.push({ id, versions })
  return normalizeCustomSpendRules(next)
}
import { BOOK_VALUES } from './operatorTraining.js'
