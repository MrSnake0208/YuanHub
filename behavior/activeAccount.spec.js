import { beforeEach, expect, it, vi } from 'vitest'
import { accountFixture } from '../test-support/factories.js'
beforeEach(() => vi.resetModules())
it('空用户初始化与读取默认游戏不写 storage、不创建账号或发请求', async () => {
  const write = vi.spyOn(Storage.prototype, 'setItem')
  const { activeAccount } = await import('../src/store/activeAccount.js')
  expect(activeAccount.id).toBe('')
  expect(activeAccount.gameFor()).toBe('代号鸢')
  expect(write).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})
it('不同子账号的游戏设置隔离，切回账号恢复对应版本', async () => {
  const { activeAccount } = await import('../src/store/activeAccount.js')
  activeAccount.syncAccounts([accountFixture({ id: 'a', game: '如鸢' }), accountFixture({ id: 'b', game: '代号鸢' })])
  activeAccount.set('a'); expect(activeAccount.gameFor()).toBe('如鸢')
  activeAccount.set('b'); expect(activeAccount.gameFor()).toBe('代号鸢')
  activeAccount.set('a'); expect(activeAccount.gameFor()).toBe('如鸢')
  expect(fetch).not.toHaveBeenCalled()
})
it('重复同步同一账号列表不产生额外 storage 写入', async () => {
  const { activeAccount } = await import('../src/store/activeAccount.js')
  const write = vi.spyOn(Storage.prototype, 'setItem')
  const rows = [accountFixture()]
  activeAccount.syncAccounts(rows)
  expect(write).toHaveBeenCalledTimes(1)
  activeAccount.syncAccounts(rows)
  expect(write).toHaveBeenCalledTimes(1)
})
it('损坏 JSON 不阻止初始化，隐私模式 storage 异常不破坏内存状态', async () => {
  localStorage.setItem('yh_account_games', '{bad json')
  const { activeAccount } = await import('../src/store/activeAccount.js')
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError') })
  expect(() => { activeAccount.set('a'); activeAccount.setGame('如鸢', 'a') }).not.toThrow()
  expect(activeAccount.id).toBe('a'); expect(activeAccount.gameFor('a')).toBe('如鸢')
})
