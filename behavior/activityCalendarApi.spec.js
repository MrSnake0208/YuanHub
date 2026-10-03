import { expect, it, vi } from 'vitest'
import { request } from '../src/api/request.js'
import { createActivityCalendar, listActivityCalendar, listAdminActivityCalendar, updateActivityCalendar } from '../src/api/activityCalendar.js'
vi.mock('../src/api/request.js', () => ({ request: vi.fn().mockResolvedValue({ items: [] }) }))
vi.mock('../src/store/auth.js', () => ({ auth: { accessToken: 'synthetic', userInfo: { id: 'admin-a' } } }))

it('公共API不带认证，管理筛选保留false，PUT编码id并传完整body，无DELETE', async () => {
  await listActivityCalendar({ game: '如鸢', from: '2026-10-03', to: '2027-01-01', category: 'SHOP' })
  let [path, options] = request.mock.lastCall
  expect(path.split('?')[0]).toBe('/v1/activity-calendar')
  expect(Object.fromEntries(new URLSearchParams(path.split('?')[1]))).toEqual({ game: '如鸢', from: '2026-10-03', to: '2027-01-01', category: 'SHOP' })
  expect(options.auth).toBe(false)
  await listAdminActivityCalendar({ enabled: false, search: '活动 & 招募' })
  ;[path, options] = request.mock.lastCall
  expect(Object.fromEntries(new URLSearchParams(path.split('?')[1]))).toEqual({ enabled: 'false', search: '活动 & 招募' })
  expect(options.auth).toBe(true)
  expect(options.expectedUserId).toBe('admin-a')
  const body = { title: '活动', expected_version: 0 }
  await updateActivityCalendar('evt/1', body)
  expect(request).toHaveBeenLastCalledWith('/v1/admin/activity-calendar/evt%2F1', { auth: true, expectedUserId: 'admin-a', method: 'PUT', body })
  await createActivityCalendar({ title: '新活动' })
  expect(request).toHaveBeenLastCalledWith('/v1/admin/activity-calendar', { auth: true, expectedUserId: 'admin-a', method: 'POST', body: { title: '新活动' } })
})
