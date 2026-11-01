export const CALENDAR_SUBSCRIPTIONS = Symbol('calendar-subscriptions')
export const DEFAULT_MEMO_TITLE = '本期备忘'
export function subscriptionCompleted(record) {
  return record?.manual_completed === true
}
export function subscriptionHasPending(record) {
  return record?.subscribed === true && !subscriptionCompleted(record)
}
export function subscriptionProgress(record) {
  const entries = record?.checklist || []
  if (!entries.length) return '暂无待办'
  if (entries.every(entry => entry.completed)) return '待办全部完成'
  return `待办事项 · 已完成 ${entries.filter(entry => entry.completed).length}/${entries.length} 项`
}
export function progressDraft(record) {
  return { checklist: (record?.checklist || []).map(entry => ({ ...entry })) }
}
export function subscriptionScope(query) { return (Array.isArray(query.scope) ? query.scope[0] : query.scope) === 'mine' }
export function subscriptionPending(query) { return (Array.isArray(query.pending) ? query.pending[0] : query.pending) === '1' }
export function subscriptionTask(query) {
  const task = Array.isArray(query.task) ? query.task[0] : query.task
  if (['todo', 'completed', 'all'].includes(task)) return task
  return (Array.isArray(query.pending) ? query.pending[0] : query.pending) === '0' ? 'all' : 'todo'
}
export function subscriptionMatchesTask(record, task) {
  return record?.subscribed === true && (task === 'all' || subscriptionCompleted(record) === (task === 'completed'))
}
export function subscriptionScopeQuery(query, mine) {
  const next = { ...query }
  if (mine) next.scope = 'mine'
  else {
    if (!next.task && subscriptionTask(query) === 'all') next.task = 'all'
    delete next.scope; delete next.pending
  }
  return next
}
