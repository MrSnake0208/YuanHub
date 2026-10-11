import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { auth } from '../src/store/auth.js'
import { getCurrent, importInventory } from '../src/api/inventory.js'
vi.mock('../src/store/auth.js', () => ({ auth: { accessToken: 'token-a', refreshToken: 'refresh-a', userInfo: { id: 'user-a' }, refresh: vi.fn(), logout: vi.fn() } }))
vi.mock('../src/store/beta.js', () => ({ beta: { setIdentity: vi.fn(), requireAccess: vi.fn().mockResolvedValue(true), invalidate: vi.fn() } }))
const response = (status, data = { accepted: 1 }) => ({ status, ok: status === 200, statusText: '', json: async () => ({ status_code: status, data }) })
const doc = { records: [{ account_id: 'game-a', record_id: 'yuanhub:manual:fixed', record_type: 'stock_snapshot', entity_type: 'item', snapshot_scope: 'listed', effective_at: '2026-10-08T00:00:00Z', entries: [{ id: 'jiezhuping', count: 0 }] }] }
beforeEach(() => { vi.clearAllMocks(); auth.userInfo = { id: 'user-a' }; auth.accessToken = 'token-a'; auth.refreshToken = 'refresh-a' })
it.each(['save', 'read'])('库存%s迟到401不使用另一身份重放，不刷新或登出新用户', async kind => {
  let resolve
  fetch.mockReturnValueOnce(new Promise(done => { resolve = done }))
  const outcome = (kind === 'save' ? importInventory(doc, { expectedUserId: 'user-a' }) : getCurrent({ accountId: 'game-a', entityType: 'item' }, { expectedUserId: 'user-a', fresh: true })).catch(error => error)
  await flushPromises()
  auth.userInfo = { id: 'user-b' }; auth.accessToken = 'token-b'
  resolve(response(401))
  expect(await outcome).toMatchObject({ code: 'request_identity_changed' })
  expect(fetch).toHaveBeenCalledTimes(1); expect(auth.refresh).not.toHaveBeenCalled(); expect(auth.logout).not.toHaveBeenCalled()
})
it('库存POST身份在动态加载auth之前改变时不发请求', async () => {
  const outcome = importInventory(doc, { expectedUserId: 'user-a' }).catch(error => error)
  auth.userInfo = { id: 'user-b' }; auth.accessToken = 'token-b'
  expect(await outcome).toMatchObject({ code: 'request_identity_changed' }); expect(fetch).not.toHaveBeenCalled()
})
it('同身份401恢复重放库存记录时保留完全相同的序列化正文', async () => {
  fetch.mockResolvedValueOnce(response(401)).mockResolvedValueOnce(response(200, { duplicates: 1 }))
  auth.refresh.mockImplementationOnce(async () => { auth.accessToken = 'renewed-a'; return true })
  expect(await importInventory(doc, { expectedUserId: 'user-a' })).toEqual({ duplicates: 1 })
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body)
  expect(JSON.parse(fetch.mock.calls[1][1].body).records[0].entries[0].count).toBe(0)
  expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer renewed-a')
})
it('恢复读回实际fetch携带同账号item筛选和no-cache重新验证头', async () => {
  fetch.mockResolvedValueOnce(response(200, [{ account_id: 'game-a', entity_type: 'item', entries: {} }]))
  await getCurrent({ accountId: 'game-a', entityType: 'item' }, { expectedUserId: 'user-a', fresh: true })
  expect(fetch.mock.calls[0][0]).toBe('/v1/inventory/current?account_id=game-a&entity_type=item')
  expect(fetch.mock.calls[0][1].headers['Cache-Control']).toBe('no-cache')
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer token-a')
})
