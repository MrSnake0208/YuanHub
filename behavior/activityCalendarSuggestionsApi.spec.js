import { beforeEach, expect, it, vi } from 'vitest'
import { request } from '../src/api/request.js'
import { auth } from '../src/store/auth.js'
import { acceptActivityCalendarSuggestion, getActivityCalendarSuggestion, listAdminActivityCalendarSuggestions, listMyActivityCalendarSuggestions, rejectActivityCalendarSuggestion, submitActivityCalendarSuggestion } from '../src/api/activityCalendar.js'
vi.mock('../src/api/request.js', () => ({ request: vi.fn().mockResolvedValue({ items: [] }) }))
vi.mock('../src/store/auth.js', () => ({ auth: { accessToken: 'synthetic', userInfo: { id: 'user-a' } } }))
beforeEach(() => vi.clearAllMocks())
it('建议API编码路径、明确认证和身份预期、限制查询字段并完整传写入body', async () => {
  const original = { title: '资料', client_request_id: 'synthetic-id' }
  await submitActivityCalendarSuggestion(original)
  expect(request).toHaveBeenLastCalledWith('/v1/activity-calendar/suggestions', { auth: true, expectedUserId: 'user-a', method: 'POST', body: original })
  await listMyActivityCalendarSuggestions({ status: 'PENDING', page: 2, page_size: 20, submitter_id: 'forged' })
  const [path, options] = request.mock.lastCall
  expect(Object.fromEntries(new URLSearchParams(path.split('?')[1]))).toEqual({ status: 'PENDING', page: '2', page_size: '20' })
  expect(options).toEqual({ auth: true, expectedUserId: 'user-a' })
  await getActivityCalendarSuggestion('suggestion/1')
  expect(request.mock.lastCall[0]).toBe('/v1/activity-calendar/suggestions/suggestion%2F1')
  await listAdminActivityCalendarSuggestions({ game: '如鸢', status: 'PENDING', page: 1, page_size: 20 })
  expect(request.mock.lastCall[0]).toContain('/v1/admin/activity-calendar/suggestions?')
  const accepted = { expected_version: 0, event: { title: '修正资料', enabled: true }, review_note: null }
  await acceptActivityCalendarSuggestion('suggestion/1', accepted)
  expect(request).toHaveBeenLastCalledWith('/v1/admin/activity-calendar/suggestions/suggestion%2F1/accept', { auth: true, expectedUserId: 'user-a', method: 'POST', body: accepted })
  const rejected = { expected_version: 0, review_note: '请补来源' }
  await rejectActivityCalendarSuggestion('suggestion/1', rejected)
  expect(request).toHaveBeenLastCalledWith('/v1/admin/activity-calendar/suggestions/suggestion%2F1/reject', { auth: true, expectedUserId: 'user-a', method: 'POST', body: rejected })
  expect(auth.userInfo.id).toBe('user-a')
})
