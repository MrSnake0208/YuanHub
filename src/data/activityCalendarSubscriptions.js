export const CALENDAR_SUBSCRIPTIONS = Symbol('calendar-subscriptions')
export function subscriptionCompleted(record) {
  return record?.checklist?.length ? record.checklist.every(entry => entry.completed) : record?.completed === true
}
export function progressDraft(record) {
  return { completed: record?.checklist?.length ? false : record?.completed === true, checklist: (record?.checklist || []).map(entry => ({ ...entry })) }
}
export function subscriptionScope(query) { return (Array.isArray(query.scope) ? query.scope[0] : query.scope) === 'mine' }
export function subscriptionPending(query) { return (Array.isArray(query.pending) ? query.pending[0] : query.pending) === '1' }
export function subscriptionScopeQuery(query, mine) {
  const next = { ...query }
  if (mine) next.scope = 'mine'
  else { delete next.scope; delete next.pending }
  return next
}
