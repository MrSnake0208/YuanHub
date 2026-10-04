import { beforeEach, expect, it, vi } from 'vitest'
import { request } from '../src/api/request.js'
import { auth } from '../src/store/auth.js'
import { listCalendarSubscriptions, calendarSubscriptionSummary, getCalendarSubscription, setCalendarSubscription, saveCalendarProgress } from '../src/api/activityCalendarSubscriptions.js'
vi.mock('../src/api/request.js', () => ({ request: vi.fn() }))
vi.mock('../src/store/auth.js', () => ({ auth: { userInfo: { id: 'user-a' } } }))
beforeEach(() => vi.clearAllMocks())
it('private calls encode event identity and bind original user plus account for retry', async () => {
  await listCalendarSubscriptions({ account_id: 'acc-a', from: '2026-10-01', category: '' }, 'user-a')
  expect(request).toHaveBeenLastCalledWith('/v1/activity-calendar/subscriptions?account_id=acc-a&from=2026-10-01', { auth: true, expectedUserId: 'user-a' })
  await getCalendarSubscription('recruitment:pool/one', 'acc-a', 'user-a')
  expect(request).toHaveBeenLastCalledWith('/v1/activity-calendar/subscriptions/recruitment%3Apool%2Fone?account_id=acc-a', { auth: true, expectedUserId: 'user-a' })
  auth.userInfo = { id: 'user-b' }
  const body = { account_id: 'acc-a', expected_version: 3, subscribed: false }
  await setCalendarSubscription('event', body, 'user-a')
  expect(request).toHaveBeenLastCalledWith('/v1/activity-calendar/subscriptions/event', { auth: true, expectedUserId: 'user-a', method: 'PUT', body })
  await saveCalendarProgress('event', { account_id: 'acc-a', expected_version: 4, completed: true, checklist: [] }, 'user-a')
  expect(request.mock.lastCall[1].body.account_id).toBe('acc-a')
  expect(request.mock.lastCall[1].expectedUserId).toBe('user-a')
  await calendarSubscriptionSummary('acc-a', 'user-a')
  expect(request.mock.lastCall[0]).toContain('/summary?account_id=acc-a')
})
