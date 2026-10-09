export const CALENDAR_SUBSCRIPTIONS = Symbol('calendar-subscriptions')
export const DEFAULT_MEMO_TITLE = '本期备忘'
export function subscriptionCompleted(record) {
  if (typeof record?.manual_completed === 'boolean') return record.manual_completed
  return record?.checklist?.length ? record.checklist.every(entry => entry.completed) : record?.completed === true
}
export function progressDraft(record) {
  return {
    completed: record?.checklist?.length ? false : record?.completed === true,
    ...(typeof record?.manual_completed === 'boolean' ? { manual_completed: record.manual_completed } : {}),
    checklist: (record?.checklist || []).map(entry => ({ ...entry })),
    memo_title: record?.memo_title ?? DEFAULT_MEMO_TITLE,
    memo_note: record?.memo_note ?? '',
  }
}
export function subscriptionScope(query) { return (Array.isArray(query.scope) ? query.scope[0] : query.scope) === 'mine' }
export function subscriptionPending(query) { return (Array.isArray(query.pending) ? query.pending[0] : query.pending) === '1' }
export function subscriptionScopeQuery(query, mine) {
  const next = { ...query }
  if (mine) next.scope = 'mine'
  else { delete next.scope; delete next.pending }
  return next
}
