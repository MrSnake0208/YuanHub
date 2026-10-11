import { beforeEach, expect, it, vi } from 'vitest'
import { request } from '../src/api/request.js'
import { importInventory, getCurrent } from '../src/api/inventory.js'
import { createGrowthPlanInventoryWriter } from '../src/pages/star/growthPlanInventory.js'
vi.mock('../src/api/request.js', () => ({ request: vi.fn() }))
beforeEach(() => vi.resetAllMocks())
it('瓶子writer经实际API/serializer保留listed单项0和幂等正文，绑定身份并重新验证缓存', async () => {
  let writes = 0
  request.mockImplementation(async (path, options) => {
    expect(options.auth).toBe(true); expect(options.expectedUserId).toBe('user-a')
    if (options.method === 'POST') { if (++writes === 1) throw new TypeError('lost response'); return { duplicates: 1 } }
    expect(path).toBe('/v1/inventory/current?account_id=game-a&entity_type=item')
    expect(options.headers).toEqual({ 'Cache-Control': 'no-cache' })
    return [{ account_id: 'game-a', entity_type: 'item', entries: { jiezheping: { count: 0 }, baijinbi: { count: 999 } } }]
  })
  const writer = createGrowthPlanInventoryWriter({ isCurrent: () => true, createId: () => 'api-fixture', now: () => 0,
    getCurrent: args => getCurrent(args, { expectedUserId: 'user-a', fresh: true }),
    importInventory: doc => importInventory(doc, { expectedUserId: 'user-a' }) })
  await expect(writer.save('game-a', 'jiezheping', 0)).rejects.toThrow('lost response')
  await writer.save('game-a', 'jiezheping', 0)
  const posts = request.mock.calls.filter(([, options]) => options.method === 'POST')
  expect(posts).toHaveLength(2); expect(posts[0][1].body).toEqual(posts[1][1].body)
  expect(posts[0][0]).toBe('/v1/inventory/import')
  expect(posts[0][1].body.records).toEqual([{ account_id: 'game-a', record_id: 'yuanhub:manual:api-fixture', record_type: 'stock_snapshot', entity_type: 'item', acquisition_channel: '手动调整', effective_at: '1970-01-01T00:00:00.000Z', snapshot_scope: 'listed', entries: [{ id: 'jiezheping', count: 0, name: '解谪瓶' }] }])
})
it('既有inventory调用保留默认选项，普通快照仍经过原serializer', async () => {
  request.mockResolvedValue({ accepted: 1 })
  const doc = { records: [{ record_type: 'stock_snapshot', snapshot_scope: 'full', entries: [] }] }
  await importInventory(doc)
  expect(request).toHaveBeenLastCalledWith('/v1/inventory/import', { method: 'POST', auth: true, body: doc })
  await getCurrent({ accountId: 'a & b', entityType: 'agent' })
  expect(request).toHaveBeenLastCalledWith('/v1/inventory/current?account_id=a+%26+b&entity_type=agent', { auth: true })
})
