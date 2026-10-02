import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import ProfilePage from '../src/pages/user/profile.vue'
import { auth } from '../src/store/auth.js'
import { beta } from '../src/store/beta.js'
import { listAccounts } from '../src/api/accounts.js'
import { dialog } from '../src/utils/dialog.js'
import { getOpenApiTokens, getOpenApiTokenSecret, getOpenApiPermissions, updateOpenApiTokenScopes, deleteOpenApiToken, generateOpenApiToken } from '../src/api/openApi.js'

const routeState = vi.hoisted(() => ({ query: {} }))
vi.mock('vue-router', () => ({ useRoute: () => routeState }))
vi.mock('../src/store/auth.js', async () => { const { reactive } = await import('vue'); return { auth: reactive({ userInfo: { id: 'user-a', user_name: '测试用户' }, isLoggedIn: true, adminAccess: null }) } })
vi.mock('../src/store/beta.js', () => ({ beta: { canUseBetaFeatures: true, loadMe: vi.fn().mockResolvedValue(null) } }))
vi.mock('../src/store/activeAccount.js', () => ({ activeAccount: { id: 'acc-a', syncAccounts: vi.fn(), set: vi.fn() } }))
vi.mock('../src/api/accounts.js', () => ({ listAccounts: vi.fn().mockResolvedValue([{ id: 'acc-a', name: '大号', game: '代号鸢' }]) }))
vi.mock('../src/api/openApi.js', () => ({
  deleteOpenApiToken: vi.fn(), generateOpenApiToken: vi.fn(), getOpenApiPermissions: vi.fn().mockResolvedValue([]),
  getOpenApiTokens: vi.fn(), getOpenApiTokenSecret: vi.fn(), updateOpenApiTokenScopes: vi.fn()
}))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn() } }))

const token = { token_id: 'tok-a', account_id: 'acc-a', account_name: '大号', remark: '旧连接', scopes: [] }
const render = (options = {}) => mount(ProfilePage, { ...options, global: { stubs: { RouterLink: RouterLinkStub, IslandSidebar: true, SiteFooter: true, BetaNotice: true, GameAccountManager: true }, directives: { reveal: () => {} } } })

beforeEach(() => {
  vi.clearAllMocks()
  routeState.query = {}
  auth.userInfo = { id: 'user-a', user_name: '测试用户' }
  beta.loadMe.mockResolvedValue(null)
  listAccounts.mockResolvedValue([{ id: 'acc-a', name: '大号', game: '代号鸢' }])
  getOpenApiPermissions.mockResolvedValue([])
  getOpenApiTokens.mockResolvedValue([token])
  getOpenApiTokenSecret.mockResolvedValue({ token: 'synthetic-secret' })
  updateOpenApiTokenScopes.mockResolvedValue({})
  deleteOpenApiToken.mockResolvedValue({})
  dialog.confirm.mockResolvedValue(true)
  Element.prototype.scrollIntoView = vi.fn()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } })
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
  expect(wrapper.get('.paste-steps').text()).toContain('仅创建连接码不表示同步成功')
  expect(wrapper.get('.nt-footer button').text()).toBe('收起填写说明')
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

it('创建时完整显示一次，关闭后仍可在现有连接中复制', async () => {
  generateOpenApiToken.mockResolvedValue({ token: 'synthetic-secret', account_name: '大号', token_id: 'tok-new' })
  getOpenApiTokens.mockResolvedValueOnce([]).mockResolvedValue([{ ...token, token_id: 'tok-new' }])
  const wrapper = render()
  await flushPromises()
  await wrapper.get('.app-connect').trigger('click')
  await wrapper.get('#maayuan-connect-panel').trigger('submit')
  await flushPromises()
  expect(wrapper.get('.new-token').exists()).toBe(true)
  await wrapper.get('.nt-footer button').trigger('click')
  expect(wrapper.find('.new-token').exists()).toBe(false)
  expect(dialog.confirm).not.toHaveBeenCalled()
  await wrapper.get('.connection-actions .t-btn.copy').trigger('click')
  await flushPromises()
  expect(getOpenApiTokenSecret).toHaveBeenCalledWith('tok-new')
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith('synthetic-secret')
  expect(wrapper.text()).not.toContain('synthetic-secret')
  wrapper.unmount()
})

it('iOS/WebKit 异步取码会在点击手势内先启动 clipboard.write', async () => {
  let resolveSecret
  getOpenApiTokenSecret.mockImplementationOnce(() => new Promise(resolve => { resolveSecret = resolve }))

  const originalClipboardItem = Object.getOwnPropertyDescriptor(globalThis, 'ClipboardItem')
  class ClipboardItemMock {
    constructor(data) { this.data = data }
  }
  const writeText = vi.fn()
  const write = vi.fn(items => items[0].data['text/plain'].then(() => undefined))
  Object.defineProperty(globalThis, 'ClipboardItem', { configurable: true, value: ClipboardItemMock })
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write, writeText } })

  let wrapper
  try {
    wrapper = render()
    await flushPromises()
    await wrapper.get('.connection-actions .t-btn.copy').trigger('click')

    expect(getOpenApiTokenSecret).toHaveBeenCalledWith('tok-a')
    expect(write).toHaveBeenCalledTimes(1)
    expect(writeText).not.toHaveBeenCalled()

    const clipboardItem = write.mock.calls[0][0][0]
    resolveSecret({ token: 'synthetic-secret' })
    await flushPromises()

    const blob = await clipboardItem.data['text/plain']
    expect(blob.type).toBe('text/plain')
    expect(blob.size).toBe('synthetic-secret'.length)
    expect(wrapper.get('.notice-line').text()).toContain('连接码已复制')
    expect(wrapper.text()).not.toContain('synthetic-secret')
  } finally {
    wrapper?.unmount()
    if (originalClipboardItem) Object.defineProperty(globalThis, 'ClipboardItem', originalClipboardItem)
    else delete globalThis.ClipboardItem
  }
})

it('现有连接取码失败或登录用户切换时不复制明文', async () => {
  const wrapper = render()
  await flushPromises()
  getOpenApiTokenSecret.mockRejectedValueOnce(new Error('请求失败'))
  await wrapper.get('.connection-actions .t-btn.copy').trigger('click')
  await flushPromises()
  expect(wrapper.get('.notice-line[role="alert"]').text()).toContain('请求失败')
  expect(navigator.clipboard.writeText).not.toHaveBeenCalled()

  let resolveSecret
  getOpenApiTokenSecret.mockImplementationOnce(() => new Promise(resolve => { resolveSecret = resolve }))
  await wrapper.get('.connection-actions .t-btn.copy').trigger('click')
  auth.userInfo = { id: 'user-b', user_name: '另一个用户' }
  resolveSecret({ token: 'other-secret' })
  await flushPromises()
  expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
  expect(wrapper.text()).not.toContain('other-secret')
  wrapper.unmount()
})

it('剪贴板拒绝复制时不误报成功，也不在页面显示连接码', async () => {
  navigator.clipboard.writeText.mockRejectedValueOnce(new Error('denied'))
  const oldExecCommand = Object.getOwnPropertyDescriptor(document, 'execCommand')
  Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(false) })
  try {
    const wrapper = render()
    await flushPromises()
    await wrapper.get('.connection-actions .t-btn.copy').trigger('click')
    await flushPromises()
    expect(wrapper.get('.notice-line[role="alert"]').text()).toContain('复制失败，请检查剪贴板权限')
    expect(wrapper.text()).not.toContain('synthetic-secret')
    wrapper.unmount()
  } finally {
    if (oldExecCommand) Object.defineProperty(document, 'execCommand', oldExecCommand)
    else delete document.execCommand
  }
})


it('首屏提供连接入口，打开既有账号绑定流程且不提前创建连接', async () => {
  const wrapper = render(); await flushPromises()
  expect(wrapper.get('h1').text()).toBe('账号与连接码')
  expect(wrapper.get('.app-copy').text()).toContain('星石自动采集仍在接入中')
  await wrapper.get('.hero-connect').trigger('click'); await flushPromises()
  expect(wrapper.get('#maayuan-account').element.value).toBe('acc-a')
  expect(wrapper.get('#maayuan-connect-panel').element.scrollIntoView).toHaveBeenCalled()
  expect(generateOpenApiToken).not.toHaveBeenCalled()
  await wrapper.get('.hero-connect').trigger('click'); await flushPromises()
  expect(wrapper.find('#maayuan-connect-panel').exists()).toBe(true)
  wrapper.unmount()
})

it('首屏连接入口在没有游戏账号时引导创建，在无资格时保持关闭', async () => {
  listAccounts.mockResolvedValue([])
  const wrapper = render(); await flushPromises()
  await wrapper.get('.hero-connect').trigger('click'); await flushPromises()
  expect(wrapper.get('.quick-account-manage-link').attributes('href')).toBe('#game-accounts')
  expect(generateOpenApiToken).not.toHaveBeenCalled()
  wrapper.unmount()
  beta.canUseBetaFeatures = false
  try {
    const locked = render(); await flushPromises()
    expect(locked.get('.hero-connect').attributes()).toHaveProperty('disabled')
    expect(locked.text()).toContain('先确认内测资格')
    expect(locked.find('#maayuan-connect-panel').exists()).toBe(false)
    locked.unmount()
  } finally { beta.canUseBetaFeatures = true }
})


it('今日一览的连接深链接自动展开、聚焦绑定表单且不创建凭证', async () => {
  routeState.query = { connect: 'maayuan' }
  const wrapper = render({ attachTo: document.body }); await flushPromises()
  expect(wrapper.find('#maayuan-connect-panel').exists()).toBe(true)
  expect(document.activeElement).toBe(wrapper.get('#maayuan-account').element)
  expect(wrapper.get('#maayuan-connect-panel').element.scrollIntoView).toHaveBeenCalled()
  expect(generateOpenApiToken).not.toHaveBeenCalled()
  wrapper.unmount()
})
