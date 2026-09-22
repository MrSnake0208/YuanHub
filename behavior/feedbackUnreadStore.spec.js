import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { auth } from '../src/store/auth.js'
import { listManagedFeedback } from '../src/api/feedback.js'
import { feedbackUnreadState, refreshFeedbackUnread, subscribeFeedbackUnread } from '../src/store/feedbackUnread.js'

vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  return { auth: reactive({ accessToken: '', userInfo: null, adminAccessLoaded: true, adminAccessLoading: false, adminAccess: null }) }
})
vi.mock('../src/api/feedback.js', () => ({ listManagedFeedback: vi.fn() }))
let unsubscribe
function deferred() {
  let resolve
  return { promise: new Promise(done => { resolve = done }), resolve: value => resolve(value) }
}
function login(id, area = 'OPERATOR') {
  auth.accessToken = `synthetic-${id}`
  auth.userInfo = { id }
  auth.adminAccess = { superAdmin: false, manageAreas: [area] }
}
const report = id => ({
  id, type: 'BUG', category: 'OPERATOR', status: 'OPEN',
  lastReporterMessageId: `${id}-message`, lastReporterMessageIndex: 0,
  lastReporterMessageCreatedAt: '2026-09-01T00:00:00Z'
})
beforeEach(() => {
  vi.useFakeTimers()
  login('manager-a')
  listManagedFeedback.mockReset().mockResolvedValue({ items: [], total: 0 })
})
afterEach(() => { unsubscribe?.(); unsubscribe = null })

it('switching active managers invalidates in-flight results and immediately loads the new identity', async () => {
  const first = deferred(), second = deferred()
  listManagedFeedback.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  unsubscribe = subscribeFeedbackUnread(); await flushPromises()
  login('manager-b'); await flushPromises()
  expect(listManagedFeedback).toHaveBeenCalledTimes(2)
  second.resolve({ items: [report('rpt_b')], total: 1 }); await flushPromises()
  first.resolve({ items: [report('rpt_a')], total: 1 }); await flushPromises()
  expect(feedbackUnreadState.ids).toEqual(['rpt_b'])
})

it('board permission changes clear old markers and cannot reuse the previous request', async () => {
  listManagedFeedback.mockResolvedValueOnce({ items: [report('rpt_operator')], total: 1 })
  unsubscribe = subscribeFeedbackUnread(); await flushPromises()
  expect(feedbackUnreadState.ids).toEqual(['rpt_operator'])
  const pending = deferred()
  listManagedFeedback.mockReturnValue(pending.promise)
  refreshFeedbackUnread(); await flushPromises()
  auth.adminAccess = { superAdmin: false, manageAreas: ['INVENTORY'] }; await flushPromises()
  expect(listManagedFeedback).toHaveBeenCalledTimes(3)
  expect(feedbackUnreadState.ids).toEqual([])
  pending.resolve({ items: [], total: 0 }); await flushPromises()
})

it('a revoked scope stops obsolete pagination and never restores its unread markers', async () => {
  const pending = deferred()
  listManagedFeedback.mockReturnValueOnce(pending.promise)
  unsubscribe = subscribeFeedbackUnread(); await flushPromises()
  auth.adminAccess = { superAdmin: false, manageAreas: [] }; await flushPromises()
  pending.resolve({ items: [report('rpt_a')], total: 200, pageSize: 1 }); await flushPromises()
  expect(listManagedFeedback).toHaveBeenCalledTimes(1)
  expect(feedbackUnreadState.ids).toEqual([])
})

it('unchanged identity still deduplicates polling and cleans up the final subscription', async () => {
  const pending = deferred()
  listManagedFeedback.mockReturnValue(pending.promise)
  unsubscribe = subscribeFeedbackUnread()
  const secondUnsubscribe = subscribeFeedbackUnread()
  try {
    refreshFeedbackUnread(); await flushPromises()
    expect(listManagedFeedback).toHaveBeenCalledTimes(1)
    pending.resolve({ items: [], total: 0 }); await flushPromises()
  } finally { secondUnsubscribe() }
  unsubscribe(); unsubscribe = null
  expect(vi.getTimerCount()).toBe(0)
})
