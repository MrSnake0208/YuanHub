import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { auth } from '../src/store/auth.js'
import { listWorkflowFeedback, markManagedFeedbackRead } from '../src/api/feedback.js'
import { feedbackUnreadState, markAllManagedFeedbackRead, refreshFeedbackUnread, subscribeFeedbackUnread } from '../src/store/feedbackUnread.js'

vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  return { auth: reactive({ accessToken: '', userInfo: null, adminAccessLoaded: true, adminAccessLoading: false, adminAccess: null }) }
})
vi.mock('../src/api/feedback.js', () => ({ listWorkflowFeedback: vi.fn(), markManagedFeedbackRead: vi.fn() }))
let unsubscribe
function deferred() {
  let resolve
  return { promise: new Promise(done => { resolve = done }), resolve: value => resolve(value) }
}
function login(id, area = 'OPERATOR') {
  auth.accessToken = `synthetic-${id}`
  auth.userInfo = { id }
  auth.adminAccess = { superAdmin: false, operatorAreas: [area], developerAreas: [] }
}
const report = id => ({
  id, type: 'BUG', category: 'OPERATOR', status: 'OPEN',
  lastReporterMessageId: `${id}-message`, lastReporterMessageIndex: 0,
  lastReporterMessageCreatedAt: '2026-09-01T00:00:00Z', teamUnread: true
})
beforeEach(() => {
  vi.useFakeTimers()
  login('manager-a')
  listWorkflowFeedback.mockReset().mockResolvedValue({ items: [], total: 0 })
  markManagedFeedbackRead.mockReset().mockResolvedValue(undefined)
})
afterEach(() => { unsubscribe?.(); unsubscribe = null })

it('switching active managers invalidates in-flight results and immediately loads the new identity', async () => {
  const first = deferred(), second = deferred()
  listWorkflowFeedback.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  unsubscribe = subscribeFeedbackUnread(); await flushPromises()
  login('manager-b'); await flushPromises()
  expect(listWorkflowFeedback).toHaveBeenCalledTimes(2)
  second.resolve({ items: [report('rpt_b')], total: 1 }); await flushPromises()
  first.resolve({ items: [report('rpt_a')], total: 1 }); await flushPromises()
  expect(feedbackUnreadState.ids).toEqual(['rpt_b'])
})

it('uses server shared unread state after another manager reads the message', async () => {
  listWorkflowFeedback.mockResolvedValueOnce({ items: [report('rpt_shared')], total: 1 })
    .mockResolvedValueOnce({ items: [{ ...report('rpt_shared'), teamUnread: false, needsReply: true }], total: 1 })
  unsubscribe = subscribeFeedbackUnread(); await flushPromises()
  expect(feedbackUnreadState.ids).toEqual(['rpt_shared'])
  login('manager-b'); await flushPromises()
  expect(feedbackUnreadState.ids).toEqual([])
})

it('bulk read only sends the message boundary returned by the server', async () => {
  listWorkflowFeedback.mockResolvedValueOnce({ items: [report('rpt_seen'), { ...report('rpt_missing'), lastReporterMessageId: null }], total: 2 })
    .mockResolvedValueOnce({ items: [], total: 0 })
  unsubscribe = subscribeFeedbackUnread(); await flushPromises()

  expect(await markAllManagedFeedbackRead()).toBe(1)
  expect(markManagedFeedbackRead).toHaveBeenCalledExactlyOnceWith('rpt_seen', 'rpt_seen-message')
})

it('board permission changes clear old markers and cannot reuse the previous request', async () => {
  listWorkflowFeedback.mockResolvedValueOnce({ items: [report('rpt_operator')], total: 1 })
  unsubscribe = subscribeFeedbackUnread(); await refreshFeedbackUnread({ force: true }); await flushPromises()
  expect(feedbackUnreadState.ids).toEqual(['rpt_operator'])
  const pending = deferred()
  listWorkflowFeedback.mockReturnValue(pending.promise)
  refreshFeedbackUnread({ force: true }); await flushPromises()
  auth.adminAccess = { superAdmin: false, operatorAreas: ['INVENTORY'], developerAreas: [] }; await flushPromises()
  expect(listWorkflowFeedback).toHaveBeenCalledTimes(3)
  expect(feedbackUnreadState.ids).toEqual([])
  pending.resolve({ items: [], total: 0 }); await flushPromises()
})

it('a revoked scope stops obsolete pagination and never restores its unread markers', async () => {
  const pending = deferred()
  listWorkflowFeedback.mockReturnValueOnce(pending.promise)
  unsubscribe = subscribeFeedbackUnread(); void refreshFeedbackUnread({ force: true }); await flushPromises()
  auth.adminAccess = { superAdmin: false, operatorAreas: [], developerAreas: [] }; await flushPromises()
  pending.resolve({ items: [report('rpt_a')], total: 200, pageSize: 1 }); await flushPromises()
  expect(listWorkflowFeedback).toHaveBeenCalledTimes(1)
  expect(feedbackUnreadState.ids).toEqual([])
})

it('unchanged identity still deduplicates polling and cleans up the final subscription', async () => {
  const pending = deferred()
  listWorkflowFeedback.mockReturnValue(pending.promise)
  unsubscribe = subscribeFeedbackUnread()
  const secondUnsubscribe = subscribeFeedbackUnread()
  try {
    refreshFeedbackUnread(); await flushPromises()
    expect(listWorkflowFeedback).toHaveBeenCalledTimes(1)
    pending.resolve({ items: [], total: 0 }); await flushPromises()
  } finally { secondUnsubscribe() }
  unsubscribe(); unsubscribe = null
  expect(vi.getTimerCount()).toBe(0)
})
