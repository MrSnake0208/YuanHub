import { beforeEach, expect, it, vi } from 'vitest'
import { request } from '../src/api/request.js'
import { auth } from '../src/store/auth.js'
import { listCalendarSubscriptions, calendarSubscriptionSummary, getCalendarSubscription, setCalendarSubscription, saveCalendarProgress, setCalendarCompletion } from '../src/api/activityCalendarSubscriptions.js'
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
  await saveCalendarProgress('event', { account_id: 'acc-a', expected_version: 4, completed: false, manual_completed: true, checklist: [{ id: 'old', title: '待办', completed: false }], memo_title: '本期目标', memo_note: '兑换提醒' }, 'user-a')
  expect(request.mock.lastCall[1].body).toMatchObject({ account_id: 'acc-a', expected_version: 4, manual_completed: true, memo_title: '本期目标', memo_note: '兑换提醒' })
  expect(request.mock.lastCall[1].expectedUserId).toBe('user-a')
  await calendarSubscriptionSummary('acc-a', 'user-a')
  expect(request.mock.lastCall[0]).toContain('/summary?account_id=acc-a')
  await setCalendarCompletion('recruitment:pool/one', { account_id: 'acc-a', expected_version: 5, completed: true }, 'user-a')
  expect(request).toHaveBeenLastCalledWith('/v1/activity-calendar/subscriptions/recruitment%3Apool%2Fone/completion', {
    auth: true, expectedUserId: 'user-a', method: 'PUT', body: { account_id: 'acc-a', expected_version: 5, completed: true },
  })
})
