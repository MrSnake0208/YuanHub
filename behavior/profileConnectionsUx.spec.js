import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import ProfilePage from '../src/pages/user/profile.vue'
import { auth } from '../src/store/auth.js'
import { beta } from '../src/store/beta.js'
import { listAccounts } from '../src/api/accounts.js'
import { dialog } from '../src/utils/dialog.js'
import { getOpenApiTokens, getOpenApiPermissions, updateOpenApiTokenScopes, deleteOpenApiToken, generateOpenApiToken } from '../src/api/openApi.js'

vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }) }))
vi.mock('../src/store/auth.js', async () => { const { reactive } = await import('vue'); return { auth: reactive({ userInfo: { id: 'user-a', user_name: '测试用户' }, isLoggedIn: true, adminAccess: null }) } })
vi.mock('../src/store/beta.js', () => ({ beta: { canUseBetaFeatures: true, loadMe: vi.fn().mockResolvedValue(null) } }))
vi.mock('../src/store/activeAccount.js', () => ({ activeAccount: { id: 'acc-a', syncAccounts: vi.fn(), set: vi.fn() } }))
vi.mock('../src/api/accounts.js', () => ({ listAccounts: vi.fn().mockResolvedValue([{ id: 'acc-a', name: '大号', game: '代号鸢' }]) }))
vi.mock('../src/api/openApi.js', () => ({
  deleteOpenApiToken: vi.fn(), generateOpenApiToken: vi.fn(), getOpenApiPermissions: vi.fn().mockResolvedValue([]),
  getOpenApiTokens: vi.fn(), updateOpenApiTokenScopes: vi.fn()
}))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn() } }))

const token = { token_id: 'tok-a', account_id: 'acc-a', account_name: '大号', remark: '旧连接', scopes: [] }
const render = () => mount(ProfilePage, { global: { stubs: { RouterLink: RouterLinkStub, IslandSidebar: true, SiteFooter: true, BetaNotice: true, GameAccountManager: true }, directives: { reveal: () => {} } } })

beforeEach(() => {
  vi.clearAllMocks()
  auth.userInfo = { id: 'user-a', user_name: '测试用户' }
  beta.loadMe.mockResolvedValue(null)
  listAccounts.mockResolvedValue([{ id: 'acc-a', name: '大号', game: '代号鸢' }])
  getOpenApiPermissions.mockResolvedValue([])
  getOpenApiTokens.mockResolvedValue([token])
  updateOpenApiTokenScopes.mockResolvedValue({})
  deleteOpenApiToken.mockResolvedValue({})
  dialog.confirm.mockResolvedValue(true)
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => vi.useRealTimers())

it('连接设置区分星石上传权限与尚未接入的自动采集任务', async () => {
  generateOpenApiToken.mockResolvedValue({ token: 'synthetic-secret', account_name: '大号', token_id: 'tok-new' })
  const wrapper = render()
  await flushPromises()
  await wrapper.get('.app-connect').trigger('click')
  expect(wrapper.get('.grant-review').text()).toContain('上传星石背包临时采集结果（MaaYuan 采集任务接入中）')
  await wrapper.get('#maayuan-connect-panel').trigger('submit')
  await flushPromises()
  expect(wrapper.get('.paste-steps').text()).toContain('星石 → YuanHub 网页端先导入截图；MaaYuan 自动采集接入中')
  wrapper.unmount()
})

it('补权限与停止连接使用站内危险确认；取消或账号切换后不提交', async () => {
  const wrapper = render()
  await flushPromises()
  dialog.confirm.mockResolvedValueOnce(false)
  await wrapper.get('.t-btn.update').trigger('click')
  await flushPromises()
  expect(updateOpenApiTokenScopes).not.toHaveBeenCalled()
  expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({ type: 'danger', confirmText: '补齐权限' }))

  let resolveConfirm
  dialog.confirm.mockImplementationOnce(() => new Promise(resolve => { resolveConfirm = resolve }))
  await wrapper.get('.t-btn.update').trigger('click')
  auth.userInfo = { id: 'user-b', user_name: '另一个用户' }
  resolveConfirm(true)
  await flushPromises()
  expect(updateOpenApiTokenScopes).not.toHaveBeenCalled()

  auth.userInfo = { id: 'user-a', user_name: '测试用户' }
  dialog.confirm.mockResolvedValueOnce(true)
  await wrapper.get('.t-btn.del').trigger('click')
  await flushPromises()
  expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({ type: 'danger', confirmText: '停止连接' }))
  expect(deleteOpenApiToken).toHaveBeenCalledWith('tok-a')
  wrapper.unmount()
})

it('失败提示不自动消失；关闭后仍可查看最近失败记录', async () => {
  vi.useFakeTimers()
  generateOpenApiToken.mockRejectedValueOnce(new Error('请求失败'))
  const wrapper = render()
  await flushPromises()
  await wrapper.get('.app-connect').trigger('click')
  await wrapper.get('#maayuan-connect-panel').trigger('submit')
  await flushPromises()
  expect(wrapper.get('.notice-line[role="alert"]').text()).toContain('请求失败')
  await vi.advanceTimersByTimeAsync(5000)
  expect(wrapper.get('.notice-line').text()).toContain('请求失败')
  await wrapper.get('.notice-line button').trigger('click')
  expect(wrapper.find('.notice-line').exists()).toBe(false)
  expect(wrapper.get('.failure-history').text()).toContain('请求失败')
  auth.userInfo = { id: 'user-b', user_name: '另一个用户' }
  await flushPromises()
  expect(wrapper.find('.failure-history').exists()).toBe(false)
  wrapper.unmount()
})

it('一次性连接码未复制时通过站内弹窗确认关闭', async () => {
  generateOpenApiToken.mockResolvedValue({ token: 'synthetic-secret', account_name: '大号', token_id: 'tok-new' })
  const wrapper = render()
  await flushPromises()
  await wrapper.get('.app-connect').trigger('click')
  await wrapper.get('#maayuan-connect-panel').trigger('submit')
  await flushPromises()
  expect(wrapper.get('.new-token').exists()).toBe(true)
  dialog.confirm.mockResolvedValueOnce(false)
  await wrapper.get('.nt-footer button').trigger('click')
  await flushPromises()
  expect(wrapper.get('.new-token').exists()).toBe(true)
  dialog.confirm.mockResolvedValueOnce(true)
  await wrapper.get('.nt-footer button').trigger('click')
  await flushPromises()
  expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({ type: 'danger', confirmText: '仍要关闭' }))
  expect(wrapper.find('.new-token').exists()).toBe(false)
  wrapper.unmount()
})
