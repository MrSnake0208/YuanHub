import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { auth } from '../src/store/auth.js'
import { acceptActivityCalendarSuggestion, createActivityCalendar, listAdminActivityCalendar, rejectActivityCalendarSuggestion, submitActivityCalendarSuggestion, updateActivityCalendar } from '../src/api/activityCalendar.js'

vi.mock('../src/store/auth.js', () => ({ auth: { accessToken: 'token-a', refreshToken: 'refresh-a', userInfo: { id: 'admin-a' }, refresh: vi.fn(), logout: vi.fn(), refreshAdminAccess: vi.fn() } }))
function deferred() { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
const response = status => ({ status, ok: status === 200, statusText: '', json: async () => ({ status_code: status, data: { items: [] } }) })
beforeEach(() => {
  vi.clearAllMocks()
  auth.userInfo = { id: 'admin-a' }; auth.accessToken = 'token-a'; auth.refreshToken = 'refresh-a'
})

it.each(['POST', 'PUT'])('A的迟到401不能用B token重放日历%s，也不能刷新或登出B', async method => {
  const late = deferred()
  fetch.mockReturnValueOnce(late.promise)
  const pending = method === 'POST' ? createActivityCalendar({ title: 'A草稿' }) : updateActivityCalendar('evt-a', { title: 'A草稿', expected_version: 0 })
  const outcome = pending.catch(error => error)
  await flushPromises()
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer token-a')
  auth.userInfo = { id: 'admin-b' }; auth.accessToken = 'token-b'
  late.resolve(response(401))
  expect(await outcome).toMatchObject({ code: 'request_identity_changed' })
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(auth.refresh).not.toHaveBeenCalled()
  expect(auth.logout).not.toHaveBeenCalled()
})
it('动态加载auth之前切换身份，旧写入连首次fetch都不发送', async () => {
  const outcome = createActivityCalendar({ title: 'A草稿' }).catch(error => error)
  auth.userInfo = { id: 'admin-b' }; auth.accessToken = 'token-b'
  expect(await outcome).toMatchObject({ code: 'request_identity_changed' })
  expect(fetch).not.toHaveBeenCalled()
})
it('同身份token刷新仍可重放一次，但刷新期间切换身份不得继续', async () => {
  fetch.mockResolvedValueOnce(response(401)).mockResolvedValueOnce(response(200))
  auth.refresh.mockImplementationOnce(async () => { auth.accessToken = 'renewed-a'; return true })
  await createActivityCalendar({ title: 'A草稿' })
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer renewed-a')

  fetch.mockClear(); auth.accessToken = 'token-a'
  fetch.mockResolvedValueOnce(response(401))
  const refresh = deferred(); auth.refresh.mockReturnValueOnce(refresh.promise)
  const outcome = createActivityCalendar({ title: 'A草稿' }).catch(error => error)
  await flushPromises()
  auth.userInfo = { id: 'admin-b' }; auth.accessToken = 'token-b'
  refresh.resolve(true)
  expect(await outcome).toMatchObject({ code: 'request_identity_changed' })
  expect(fetch).toHaveBeenCalledTimes(1)
})
it('退出后的旧请求不触发logout，迟到403不刷新新身份权限', async () => {
  const late = deferred(); fetch.mockReturnValueOnce(late.promise)
  const outcome = listAdminActivityCalendar({}).catch(error => error)
  await flushPromises()
  auth.userInfo = null; auth.accessToken = ''
  late.resolve(response(401))
  expect(await outcome).toMatchObject({ code: 'request_identity_changed' })
  expect(auth.logout).not.toHaveBeenCalled()

  auth.userInfo = { id: 'admin-a' }; auth.accessToken = 'token-a'
  const forbidden = deferred(); fetch.mockReturnValueOnce(forbidden.promise)
  const nextOutcome = listAdminActivityCalendar({}).catch(error => error)
  await flushPromises()
  auth.userInfo = { id: 'admin-b' }; auth.accessToken = 'token-b'
  forbidden.resolve(response(403))
  expect(await nextOutcome).toMatchObject({ code: 'request_identity_changed' })
  expect(auth.refreshAdminAccess).not.toHaveBeenCalled()
})

it.each(['submit', 'accept', 'reject'])('迟到401不能用B token重放建议%s，也不能刷新B身份', async action => {
  const late = deferred(); fetch.mockReturnValueOnce(late.promise)
  const operations = {
    submit: () => submitActivityCalendarSuggestion({ title: 'A资料', client_request_id: 'synthetic-id' }),
    accept: () => acceptActivityCalendarSuggestion('suggestion-a', { expected_version: 0, event: { title: 'A修正' } }),
    reject: () => rejectActivityCalendarSuggestion('suggestion-a', { expected_version: 0, review_note: 'A原因' })
  }
  const outcome = operations[action]().catch(error => error)
  await flushPromises()
  auth.userInfo = { id: 'user-b' }; auth.accessToken = 'token-b'
  late.resolve(response(401))
  expect(await outcome).toMatchObject({ code: 'request_identity_changed' })
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(auth.refresh).not.toHaveBeenCalled()
  expect(auth.logout).not.toHaveBeenCalled()
})
