export const CALENDAR_SUBSCRIPTIONS = Symbol('calendar-subscriptions')
export const DEFAULT_MEMO_TITLE = '本期备忘'
export function subscriptionCompleted(record) {
  return !!record?.checklist?.length && record.checklist.every(entry => entry.completed)
}
export function subscriptionHasPending(record) {
  return !!record?.checklist?.some(entry => !entry.completed)
}
export function subscriptionProgress(record) {
  const entries = record?.checklist || []
  if (!entries.length) return '暂无待办'
  if (subscriptionCompleted(record)) return '待办全部完成'
  return `待办事项 · 已完成 ${entries.filter(entry => entry.completed).length}/${entries.length} 项`
}
export function progressDraft(record) {
  return { checklist: (record?.checklist || []).map(entry => ({ ...entry })) }
}
export function subscriptionScope(query) { return (Array.isArray(query.scope) ? query.scope[0] : query.scope) === 'mine' }
export function subscriptionPending(query) { return (Array.isArray(query.pending) ? query.pending[0] : query.pending) === '1' }
export function subscriptionScopeQuery(query, mine) {
  const next = { ...query }
  if (mine) next.scope = 'mine'
  else { delete next.scope; delete next.pending }
  return next
}
