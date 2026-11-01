import { beforeEach, expect, it, vi } from 'vitest'
import { request } from '../src/api/request.js'
import { createCalendarPrivateItem, deleteCalendarPrivateItem, getCalendarPrivateItem, listCalendarPrivateItems, updateCalendarPrivateItem } from '../src/api/calendarPrivateItems.js'
vi.mock('../src/api/request.js', () => ({ request: vi.fn() }))
vi.mock('../src/store/auth.js', () => ({ auth: { userInfo: { id: 'new-user' } } }))
beforeEach(() => vi.clearAllMocks())
it('every private request binds the original user and account; only update and delete carry CAS', async () => {
  const body = { account_id: 'a', title: '领取奖励', start_date: '2026-10-15', end_date: '2026-10-20', time: '09:00', note: '' }
  await listCalendarPrivateItems({ account_id: 'a', from: '2026-10-01', to: '2026-10-31' }, 'owner')
  expect(request.mock.lastCall).toEqual(['/v1/activity-calendar/private-items?account_id=a&from=2026-10-01&to=2026-10-31', { auth: true, expectedUserId: 'owner' }])
  await createCalendarPrivateItem(body, 'owner')
  expect(request.mock.lastCall).toEqual(['/v1/activity-calendar/private-items', { auth: true, expectedUserId: 'owner', method: 'POST', body }])
  await getCalendarPrivateItem('pci_a/b', 'a', 'owner')
  expect(request.mock.lastCall[0]).toBe('/v1/activity-calendar/private-items/pci_a%2Fb?account_id=a')
  await updateCalendarPrivateItem('pci_one', { ...body, expected_version: 2 }, 'owner')
  expect(request.mock.lastCall[1]).toMatchObject({ auth: true, expectedUserId: 'owner', method: 'PUT', body: { expected_version: 2 } })
  await deleteCalendarPrivateItem('pci_one', 'a', 3, 'owner')
  expect(request.mock.lastCall).toEqual(['/v1/activity-calendar/private-items/pci_one?account_id=a&expected_version=3', { auth: true, expectedUserId: 'owner', method: 'DELETE' }])
  expect(request.mock.calls.every(([url]) => !url.includes('/subscriptions'))).toBe(true)
})
it('one-period deletion binds the series id, date, original user and CAS', async () => {
  await deleteCalendarPrivateItem('pci_series', 'a', 4, 'owner', '2026-11-01')
  expect(request.mock.lastCall).toEqual(['/v1/activity-calendar/private-items/pci_series?account_id=a&expected_version=4&occurrence_date=2026-11-01', { auth: true, expectedUserId: 'owner', method: 'DELETE' }])
})
