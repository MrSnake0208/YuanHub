import { beforeEach, expect, it, vi } from 'vitest'
import { request } from '../src/api/request.js'
import { listRecords } from '../src/api/inventory.js'
import { loadMailboxResourceReport } from '../src/api/mailboxReserve.js'
vi.mock('../src/api/request.js', () => ({ request: vi.fn() }))
vi.mock('../src/api/inventory.js', () => ({ listRecords: vi.fn() }))
const state = (version = 1, count = 1) => ({ account_id: 'a', version, inventory_revision: 2, inventory_record_count: count })
const from = '2026-10-01T00:00:00Z', to = '2026-11-01T00:00:00Z'
beforeEach(() => {
  vi.resetAllMocks()
  listRecords.mockResolvedValue({ items: [{ record_id: 'r' }], next_cursor: null })
})
it('分页获取两份完整历史，带登录身份并禁止库存缓存', async () => {
  request.mockImplementation(async (path, options) => {
    expect(options.expectedUserId).toBe('owner')
    if (!path.includes('/history?')) return state()
    return { ...state(), entries: [{ version: path.includes('cursor=') ? 2 : 1 }], next_cursor: path.includes('cursor=') ? null : 'next' }
  })
  const data = await loadMailboxResourceReport('a', 'owner', from, to)
  expect(data.history.map(e => e.version)).toEqual([1, 2])
  expect(data.records).toEqual([{ record_id: 'r' }])
  expect(listRecords.mock.lastCall[1]).toEqual({ expectedUserId: 'owner', fresh: true })
})
it('仅历史入账改变条数也会重读，最多尝试两轮', async () => {
  let reads = 0
  request.mockImplementation(async path => path.includes('/sync?') ? state() : path.includes('/history?') ? { ...state(1, reads < 3 ? 1 : 2), entries: [], next_cursor: null } : state(1, ++reads === 1 ? 1 : 2))
  await loadMailboxResourceReport('a', 'owner', from, to)
  expect(reads).toBe(4)
  expect(listRecords).toHaveBeenCalledTimes(2)
})
it('持续并发变化或旧服务缺标记都不返回混合报告', async () => {
  let reads = 0
  request.mockImplementation(async path => path.includes('/sync?') ? state() : path.includes('/history?') ? { ...state(reads), entries: [], next_cursor: null } : state(++reads))
  await expect(loadMailboxResourceReport('a', 'owner', from, to)).rejects.toThrow('资源正在更新')
  expect(reads).toBe(4)
  request.mockResolvedValue({ account_id: 'a', version: 1 })
  await expect(loadMailboxResourceReport('a', 'owner', from, to)).rejects.toThrow('尚未就绪')
})
it('分页失败、重复游标与其他账号响应不能作为完整数据', async () => {
  request.mockImplementation(async path => path.includes('/sync?') ? state() : path.includes('/history?') ? { ...state(), entries: [], next_cursor: 'same' } : state())
  await expect(loadMailboxResourceReport('a', 'owner', from, to)).rejects.toThrow('未完整加载')
  request.mockResolvedValue({ ...state(), account_id: 'b' })
  await expect(loadMailboxResourceReport('a', 'owner', from, to)).rejects.toThrow('尚未就绪')
  request.mockImplementation(async path => { if (path.includes('/history?')) throw new Error('分页失败'); return state() })
  await expect(loadMailboxResourceReport('a', 'owner', from, to)).rejects.toThrow('分页失败')
})
