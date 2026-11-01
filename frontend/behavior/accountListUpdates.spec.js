import { beforeEach, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { auth } from '../src/store/auth.js'
import { request } from '../src/api/request.js'
import { createAccount, deleteAccount, listAccounts, updateAccount } from '../src/api/accounts.js'
import { accountListChange, publishAccountList, useAccountListUpdates } from '../src/store/accountList.js'

vi.mock('../src/api/request.js', () => ({ request: vi.fn(), API_BASE: '' }))
vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  return { auth: reactive({ userInfo: { id: 'owner-a' }, accessToken: 'synthetic' }) }
})
const rows = [{ id: 'a', name: '大号', game: '代号鸢' }, { id: 'b', name: '小号', game: '如鸢' }]
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
beforeEach(() => { vi.resetAllMocks(); auth.userInfo = { id: 'owner-a' }; accountListChange.value = null })

it.each([[], [rows[1]], [...rows, { id: 'c', name: '新号', game: '如鸢' }]])('CRUD 前的晚到 GET 使用最新列表，不能恢复已删除账号或丢掉新账号', async latest => {
  const pending = deferred(); request.mockReturnValue(pending.promise)
  const reading = listAccounts()
  publishAccountList(latest); pending.resolve(rows)
  expect(await reading).toEqual(latest)
})

it('CRUD 后开始的 GET 仍读取服务端，不永久缓存账号列表', async () => {
  publishAccountList(rows); request.mockResolvedValue([rows[1]])
  expect(await listAccounts()).toEqual([rows[1]])
})

it.each(['change', 'roundtrip'])('GET 期间身份 %s 后不发布旧结果', async kind => {
  const pending = deferred(); request.mockReturnValue(pending.promise)
  const reading = listAccounts()
  auth.userInfo = { id: 'owner-b' }; if (kind === 'roundtrip') auth.userInfo = { id: 'owner-a' }
  pending.resolve(rows)
  await expect(reading).rejects.toThrow('登录身份已变化')
  expect(accountListChange.value).toBeNull()
})

it('所有读写绑定调用时身份，保持原有 endpoint/body', async () => {
  request.mockResolvedValue([])
  await listAccounts(); await createAccount('新号', '如鸢'); await updateAccount('a', { name: '改名', game: '如鸢' }); await deleteAccount('a')
  expect(request.mock.calls).toEqual([
    ['/v1/accounts', { auth: true, expectedUserId: 'owner-a' }],
    ['/v1/accounts', { method: 'POST', auth: true, expectedUserId: 'owner-a', body: { name: '新号', game: '如鸢' } }],
    ['/v1/accounts/a', { method: 'PATCH', auth: true, expectedUserId: 'owner-a', body: { name: '改名', game: '如鸢' } }],
    ['/v1/accounts/a', { method: 'DELETE', auth: true, expectedUserId: 'owner-a' }],
  ])
})

it('Workspace 在切换前同步列表，卸载自动停止；身份切换清空通知', () => {
  const list = ref(rows), apply = vi.fn(next => { list.value = next })
  const wrapper = mount(defineComponent({ setup() { useAccountListUpdates(apply); return () => h('div', list.value.map(row => row.name).join()) } }))
  publishAccountList([rows[1]])
  expect(list.value).toEqual([rows[1]])
  wrapper.unmount(); publishAccountList([])
  expect(apply).toHaveBeenCalledTimes(1)
  auth.userInfo = { id: 'owner-b' }; expect(accountListChange.value).toBeNull()
})
