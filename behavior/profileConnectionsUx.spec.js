import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { createPinia } from 'pinia'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import ProfilePage from '../src/pages/user/profile.vue'
import { auth } from '../src/store/auth.js'
import { beta } from '../src/store/beta.js'
import { activeAccount } from '../src/store/activeAccount.js'
import { publishAccountList } from '../src/store/accountList.js'
import { listAccounts } from '../src/api/accounts.js'
import { dialog } from '../src/utils/dialog.js'
import { getOpenApiTokens, getOpenApiTokenSecret, getOpenApiPermissions, updateOpenApiTokenScopes, deleteOpenApiToken, generateOpenApiToken } from '../src/api/openApi.js'

const routeState = vi.hoisted(() => ({ query: {} }))
vi.mock('vue-router', () => ({ useRoute: () => routeState }))
vi.mock('../src/store/auth.js', async () => { const { reactive } = await import('vue'); return { auth: reactive({ userInfo: { id: 'user-a', user_name: '测试用户' }, isLoggedIn: true, adminAccess: null }) } })
vi.mock('../src/store/beta.js', () => ({ beta: { canUseBetaFeatures: true, loadMe: vi.fn().mockResolvedValue(null) } }))
vi.mock('../src/store/activeAccount.js', async () => {
  const { reactive } = await import('vue')
  return { normalizeAccountGame: game => game === '如鸢' ? '如鸢' : '代号鸢', activeAccount: reactive({ id: 'acc-a', syncAccounts: vi.fn(), set: vi.fn() }) }
})
vi.mock('../src/api/accounts.js', () => ({ listAccounts: vi.fn().mockResolvedValue([{ id: 'acc-a', name: '大号', game: '代号鸢' }]) }))
vi.mock('../src/api/openApi.js', () => ({
  deleteOpenApiToken: vi.fn(), generateOpenApiToken: vi.fn(), getOpenApiPermissions: vi.fn().mockResolvedValue([]),
  getOpenApiTokens: vi.fn(), getOpenApiTokenSecret: vi.fn(), updateOpenApiTokenScopes: vi.fn()
}))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn() } }))

const token = { token_id: 'tok-a', account_id: 'acc-a', account_name: '大号', remark: '旧连接', scopes: [] }
const render = (options = {}) => mount(ProfilePage, { ...options, global: { plugins: [createPinia()], stubs: { RouterLink: RouterLinkStub, IslandSidebar: true, SiteFooter: true, BetaNotice: true, GameAccountManager: true }, directives: { reveal: () => {} } } })

beforeEach(() => {
  vi.clearAllMocks()
  routeState.query = {}
  routeState.hash = ''
  auth.userInfo = { id: 'user-a', user_name: '测试用户' }
  auth.adminAccess = null; auth.adminAccessLoaded = false
  activeAccount.id = 'acc-a'
  activeAccount.set.mockImplementation(id => { activeAccount.id = id || '' })
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

it('摘要仅展示真实当前账号与总数，管理按需打开共享 Dialog，关闭后不残留 CRUD', async () => {
  listAccounts.mockResolvedValue([{ id: 'acc-a', name: '大号', game: '代号鸢' }, { id: 'acc-b', name: '小号', game: '如鸢' }])
  const wrapper = render(); await flushPromises()
  const summary = wrapper.get('.game-account-summary')
  expect(summary.text()).toContain('当前账号：代号鸢 · 大号')
  expect(summary.text()).toContain('共 2 个游戏账号')
  expect(summary.text()).not.toContain('小号')
  expect(summary.findAll('ul, input, select, .more-trigger')).toHaveLength(0)
  expect(wrapper.findComponent({ name: 'GameAccountManager' }).exists()).toBe(false)
  activeAccount.id = 'acc-b'; await flushPromises()
  expect(summary.text()).toContain('当前账号：如鸢 · 小号')
  publishAccountList([{ id: 'acc-b', name: '已改名', game: '代号鸢' }]); await flushPromises()
  expect(summary.text()).toContain('当前账号：代号鸢 · 已改名')
  expect(summary.text()).toContain('共 1 个游戏账号')
  expect(summary.text()).not.toContain('小号')
  await summary.get('[data-tour="account-create"]').trigger('click')
  const manager = wrapper.findComponent({ name: 'GameAccountManager' })
  expect(manager.props()).toMatchObject({ presentation: 'dialog', initialView: 'list', accounts: expect.any(Array) })
  expect(summary.get('button').attributes('aria-expanded')).toBe('true')
  manager.vm.$emit('close'); await flushPromises()
  expect(wrapper.findComponent({ name: 'GameAccountManager' }).exists()).toBe(false)
  expect(summary.get('button').attributes('aria-expanded')).toBe('false')
  activeAccount.id = 'deleted'; await flushPromises()
  expect(summary.text()).toContain('尚未选择当前账号')
  expect(summary.text()).not.toContain('已改名')
  publishAccountList([]); activeAccount.id = ''; await flushPromises()
  expect(summary.text()).toContain('尚未创建游戏账号')
  expect(summary.text()).not.toContain('已改名')
  wrapper.unmount()
})

it('loading 不显示零账号；错误不伪装空态，重试后沿用现有当前账号回退', async () => {
  let fail
  listAccounts.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject }))
  const wrapper = render(); await flushPromises()
  const summary = wrapper.get('.game-account-summary')
  expect(summary.get('[role="status"]').text()).toContain('正在读取游戏账号')
  expect(summary.text()).not.toContain('0 个')
  expect(summary.text()).not.toContain('尚未创建')
  expect(summary.get('[data-tour="account-create"]').attributes()).toHaveProperty('disabled')
  fail(new Error('游戏账号读取失败')); await flushPromises()
  expect(summary.get('[role="alert"]').text()).toContain('游戏账号读取失败')
  expect(summary.text()).not.toContain('尚未创建')
  activeAccount.id = 'deleted'
  listAccounts.mockResolvedValueOnce([{ id: 'acc-b', name: '备用', game: '如鸢' }])
  await summary.get('.account-summary-error button').trigger('click'); await flushPromises()
  expect(activeAccount.id).toBe('acc-b')
  expect(summary.text()).toContain('当前账号：如鸢 · 备用')
  expect(summary.text()).toContain('共 1 个游戏账号')
  wrapper.unmount()
})

it('旧 hash 保留摘要目标但不自动打开 Dialog，空态入口直接打开 create', async () => {
  routeState.hash = '#game-accounts'
  listAccounts.mockResolvedValue([])
  const wrapper = render(); await flushPromises()
  expect(wrapper.get('.game-account-summary').text()).toContain('尚未创建游戏账号')
  expect(wrapper.get('#game-accounts').exists()).toBe(true)
  expect(wrapper.findComponent({ name: 'GameAccountManager' }).exists()).toBe(false)
  await wrapper.get('.game-account-summary button').trigger('click')
  expect(wrapper.findComponent({ name: 'GameAccountManager' }).props()).toMatchObject({ presentation: 'dialog', initialView: 'create' })
  wrapper.unmount()
})

it.each([
  ['普通用户', { permissions: [] }],
  ['管理员', { permissions: ['operator_catalog:write'] }],
  ['超级管理员', { superAdmin: true, permissions: ['admin:role:manage', 'admin:audit:read'] }],
])('%s 的个人工作区从游戏账号进入应用连接，不重复展示管理入口', async (_, access) => {
  auth.adminAccess = access; auth.adminAccessLoaded = true
  const wrapper = render()
  await flushPromises()
  expect(wrapper.get('h1').text()).toBe('账号与连接码')
  const accounts = wrapper.get('.game-account-summary').element
  const connections = wrapper.get('.connection-card').element
  expect(accounts.compareDocumentPosition(connections) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(wrapper.get('.connection-card h2').text()).toBe('应用与数据连接')
  expect(wrapper.find('.admin-tools').exists()).toBe(false)
  expect(wrapper.findAllComponents(RouterLinkStub).map(link => link.props('to'))).not.toContain('/manage')
  expect(wrapper.text()).not.toContain('当前可用的管理内容')
  wrapper.unmount()
})

it('连接设置区分星石上传权限与尚未接入的自动采集任务', async () => {
  generateOpenApiToken.mockResolvedValue({ token: 'synthetic-secret', account_name: '大号', token_id: 'tok-new' })
  const wrapper = render()
  await flushPromises()
  await wrapper.get('.app-connect').trigger('click')
  expect(wrapper.get('.grant-review').text()).toContain('上传星石背包临时采集结果（MaaYuan 采集任务接入中）')
  await wrapper.get('#maayuan-connect-panel').trigger('submit')
  await flushPromises()
  await wrapper.get('.nt-row button').trigger('click'); await flushPromises()
  expect(wrapper.get('details.paste-steps').text()).toContain('星石 → YuanHub 网页端先导入截图；MaaYuan 自动采集接入中')
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


it('顶部保留页面身份，连接区打开或收起既有表单且不提前创建连接', async () => {
  const wrapper = render(); await flushPromises()
  expect(wrapper.get('.page-header h1').text()).toBe('账号与连接码')
  expect(wrapper.get('.page-header').findAll('button, a')).toHaveLength(0)
  expect(wrapper.get('.app-copy').text()).toContain('星石自动采集仍在接入中')
  await wrapper.get('.app-connect').trigger('click'); await flushPromises()
  expect(wrapper.get('#maayuan-account').element.value).toBe('acc-a')
  expect(wrapper.get('.app-connect').attributes('aria-expanded')).toBe('true')
  expect(generateOpenApiToken).not.toHaveBeenCalled()
  await wrapper.get('.app-connect').trigger('click'); await flushPromises()
  expect(wrapper.find('#maayuan-connect-panel').exists()).toBe(false)
  expect(wrapper.get('.app-connect').attributes('aria-expanded')).toBe('false')
  wrapper.unmount()
})

it('连接区入口在没有游戏账号时引导创建，在无资格时保持关闭', async () => {
  listAccounts.mockResolvedValue([])
  const wrapper = render(); await flushPromises()
  await wrapper.get('.app-connect').trigger('click'); await flushPromises()
  await wrapper.get('.quick-account-manage-link').trigger('click')
  expect(wrapper.findComponent({ name: 'GameAccountManager' }).props()).toMatchObject({ presentation: 'dialog', initialView: 'create' })
  expect(generateOpenApiToken).not.toHaveBeenCalled()
  wrapper.unmount()
  beta.canUseBetaFeatures = false
  try {
    const locked = render(); await flushPromises()
    await locked.get('.app-connect').trigger('click'); await flushPromises()
    expect(locked.get('.notice-line[role="alert"]').text()).toContain('请先前往内测页面确认体验资格')
    expect(generateOpenApiToken).not.toHaveBeenCalled()
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

it('连接默认当前账号且区分同名账号；用户主动改选后保留目标', async () => {
  const accounts = [{ id: 'acc-a', name: '同名', game: '代号鸢' }, { id: 'acc-b', name: '同名', game: '如鸢' }]
  listAccounts.mockResolvedValue(accounts)
  activeAccount.id = 'acc-b'
  const wrapper = render(); await flushPromises()
  await wrapper.get('.app-connect').trigger('click'); await flushPromises()
  const select = wrapper.get('#maayuan-account')
  expect(select.element.value).toBe('acc-b')
  expect(select.findAll('option').map(option => option.text())).toEqual(['代号鸢 · 同名', '如鸢 · 同名'])
  expect(wrapper.get('#maayuan-account-help').text()).toContain('本次连接将绑定：如鸢 · 同名')
  expect(wrapper.get('#advanced-account').element.value).toBe('acc-b')
  activeAccount.id = 'acc-a'; await flushPromises()
  expect(select.element.value).toBe('acc-a')
  await select.setValue('acc-b')
  activeAccount.id = 'acc-b'; await flushPromises()
  activeAccount.id = 'acc-a'; await flushPromises()
  expect(select.element.value).toBe('acc-b')
  publishAccountList(accounts.slice())
  await flushPromises()
  expect(select.element.value).toBe('acc-b')
  publishAccountList([accounts[0]])
  await flushPromises()
  expect(select.element.value).toBe('acc-a')
  expect(generateOpenApiToken).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('无账号时创建目标后继续连接，取消说明不创建连接码', async () => {
  listAccounts.mockResolvedValue([])
  const wrapper = render(); await flushPromises()
  await wrapper.get('.app-connect').trigger('click'); await flushPromises()
  await wrapper.get('.quick-account-manage-link').trigger('click')
  expect(wrapper.findComponent({ name: 'GameAccountManager' }).props('initialView')).toBe('create')
  activeAccount.id = 'acc-new'
  publishAccountList([{ id: 'acc-new', name: '新账号', game: '如鸢' }])
  await flushPromises()
  expect(wrapper.get('#maayuan-account').element.value).toBe('acc-new')
  await wrapper.get('.panel-actions .ghost').trigger('click')
  expect(wrapper.find('#maayuan-connect-panel').exists()).toBe(false)
  expect(generateOpenApiToken).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('创建失败保留选定账号，重试和重复提交只生成一次在途请求', async () => {
  listAccounts.mockResolvedValue([{ id: 'acc-a', name: '大号', game: '代号鸢' }, { id: 'acc-b', name: '小号', game: '如鸢' }])
  generateOpenApiToken.mockRejectedValueOnce(new Error('synthetic failure'))
  const wrapper = render(); await flushPromises()
  await wrapper.get('.app-connect').trigger('click'); await flushPromises()
  await wrapper.get('#maayuan-account').setValue('acc-b')
  await wrapper.get('#maayuan-connect-panel').trigger('submit'); await flushPromises()
  expect(wrapper.get('#maayuan-account').element.value).toBe('acc-b')
  expect(wrapper.get('[role="alert"]').text()).toContain('synthetic failure')
  let finish
  generateOpenApiToken.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  await wrapper.get('#maayuan-connect-panel').trigger('submit')
  await wrapper.get('#maayuan-connect-panel').trigger('submit')
  expect(generateOpenApiToken).toHaveBeenCalledTimes(2)
  expect(generateOpenApiToken).toHaveBeenLastCalledWith(expect.objectContaining({ accountId: 'acc-b' }))
  expect(wrapper.get('#maayuan-account').attributes()).toHaveProperty('disabled')
  activeAccount.id = 'acc-a'; await flushPromises()
  expect(wrapper.get('#maayuan-account').element.value).toBe('acc-b')
  finish({ token: 'synthetic-secret', account_id: 'acc-b', account_name: '小号', token_id: 'tok-new' })
  await flushPromises()
  expect(wrapper.find('.new-token').exists()).toBe(true)
  wrapper.unmount()
})

it('生成连接码期间切换登录用户，不展示旧用户的晚到凭证', async () => {
  let finish
  generateOpenApiToken.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const wrapper = render(); await flushPromises()
  await wrapper.get('.app-connect').trigger('click'); await flushPromises()
  await wrapper.get('#maayuan-connect-panel').trigger('submit')
  auth.userInfo = { id: 'user-b', user_name: '另一测试用户' }
  finish({ token: 'previous-user-secret', token_id: 'tok-old' })
  await flushPromises()
  expect(wrapper.find('.new-token').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('previous-user-secret')
  expect(getOpenApiTokens).toHaveBeenCalledTimes(1)
  wrapper.unmount()
})

it.each(['maayuan', 'advanced'])('%s 默认目标在在途切换当前账号并失败后仍保留', async mode => {
  listAccounts.mockResolvedValue([{ id: 'acc-a', name: '大号', game: '代号鸢' }, { id: 'acc-b', name: '小号', game: '如鸢' }])
  getOpenApiPermissions.mockResolvedValue([{ scope: 'inventory:write', description: '上传库存' }])
  activeAccount.id = 'acc-b'
  let fail
  generateOpenApiToken.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject }))
  const wrapper = render(); await flushPromises()
  if (mode === 'maayuan') { await wrapper.get('.app-connect').trigger('click'); await flushPromises() }
  else await wrapper.get('.advanced-form input[type="checkbox"]').setValue(true)
  const form = wrapper.get(mode === 'maayuan' ? '#maayuan-connect-panel' : '.advanced-form')
  const select = wrapper.get(mode === 'maayuan' ? '#maayuan-account' : '#advanced-account')
  expect(select.element.value).toBe('acc-b')
  await form.trigger('submit')
  activeAccount.id = 'acc-a'; await flushPromises()
  fail(new Error('合成创建失败')); await flushPromises()
  expect(select.element.value).toBe('acc-b')
  generateOpenApiToken.mockResolvedValueOnce({ token: 'synthetic-secret', account_id: 'acc-b', token_id: 'tok-new' })
  await form.trigger('submit'); await flushPromises()
  expect(generateOpenApiToken).toHaveBeenLastCalledWith(expect.objectContaining({ accountId: 'acc-b' }))
  wrapper.unmount()
})

it('生成结果展示与焦点处理期间切换身份，移除明文且不继续旧请求刷新', async () => {
  generateOpenApiToken.mockResolvedValueOnce({ token: 'previous-user-secret', token_id: 'tok-old' })
  const wrapper = render(); await flushPromises()
  await wrapper.get('.app-connect').trigger('click'); await flushPromises()
  Element.prototype.scrollIntoView = vi.fn(() => { auth.userInfo = { id: 'user-b', user_name: '另一测试用户' } })
  await wrapper.get('#maayuan-connect-panel').trigger('submit'); await flushPromises()
  expect(wrapper.find('.new-token').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('previous-user-secret')
  expect(getOpenApiTokens).toHaveBeenCalledTimes(1)
  wrapper.unmount()
})

it('已生成凭证在切换身份后清除，旧身份的连接列表晚到也不展示', async () => {
  generateOpenApiToken.mockResolvedValueOnce({ token: 'previous-user-secret', token_id: 'tok-old' })
  getOpenApiTokens.mockResolvedValueOnce([])
  let finishList
  getOpenApiTokens.mockImplementationOnce(() => new Promise(resolve => { finishList = resolve }))
  const wrapper = render(); await flushPromises()
  await wrapper.get('.app-connect').trigger('click'); await flushPromises()
  await wrapper.get('#maayuan-connect-panel').trigger('submit'); await flushPromises()
  expect(wrapper.find('.new-token').exists()).toBe(true)
  auth.userInfo = { id: 'user-b', user_name: '另一测试用户' }; await flushPromises()
  expect(wrapper.find('.new-token').exists()).toBe(false)
  finishList([{ ...token, remark: '旧身份连接列表' }]); await flushPromises()
  expect(wrapper.text()).not.toContain('旧身份连接列表')
  expect(wrapper.text()).not.toContain('previous-user-secret')
  wrapper.unmount()
})

it('账号列表只接纳最新请求，旧请求不能覆盖更新结果或结束新请求的 loading', async () => {
  let resolveFirst, resolveSecond
  listAccounts.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve }))
  const wrapper = render(); await flushPromises()
  listAccounts.mockImplementationOnce(() => new Promise(resolve => { resolveSecond = resolve }))
  void wrapper.vm.loadAccounts(); await flushPromises()
  resolveFirst([{ id: 'old', name: '旧账号', game: '代号鸢' }]); await flushPromises()
  expect(wrapper.get('.game-account-summary').attributes('aria-busy')).toBe('true')
  expect(wrapper.get('.game-account-summary').text()).not.toContain('旧账号')
  resolveSecond([{ id: 'new', name: '新账号', game: '如鸢' }]); await flushPromises()
  expect(wrapper.get('.game-account-summary').text()).toContain('如鸢 · 新账号')
  expect(activeAccount.id).toBe('new')
  wrapper.unmount()
})

it('CRUD 发布的列表不被在途旧加载覆盖', async () => {
  let resolveList
  listAccounts.mockImplementationOnce(() => new Promise(resolve => { resolveList = resolve }))
  const wrapper = render(); await flushPromises()
  const latest = [{ id: 'created', name: '新创建', game: '如鸢' }]
  publishAccountList(latest); activeAccount.id = 'created'; await flushPromises()
  resolveList([{ id: 'old', name: '旧账号', game: '代号鸢' }]); await flushPromises()
  expect(wrapper.get('.game-account-summary').text()).toContain('如鸢 · 新创建')
  expect(wrapper.get('.game-account-summary').text()).not.toContain('旧账号')
  expect(wrapper.get('.game-account-summary').attributes('aria-busy')).toBe('false')
  wrapper.unmount()
})

it.each(['identity', 'roundtrip', 'unmount'])('列表请求期间 %s 变化，旧响应不修改当前账号', async change => {
  let resolveList
  listAccounts.mockImplementationOnce(() => new Promise(resolve => { resolveList = resolve }))
  const wrapper = render(); await flushPromises()
  if (change === 'unmount') wrapper.unmount()
  else {
    listAccounts.mockResolvedValue([])
    auth.userInfo = { id: 'user-b' }
    if (change === 'roundtrip') auth.userInfo = { id: 'user-a' }
    await flushPromises()
  }
  activeAccount.set('current-context'); activeAccount.set.mockClear(); activeAccount.syncAccounts.mockClear()
  resolveList([{ id: 'stale', name: '旧账号', game: '代号鸢' }]); await flushPromises()
  expect(activeAccount.set).not.toHaveBeenCalled()
  expect(activeAccount.syncAccounts).not.toHaveBeenCalled()
  expect(activeAccount.id).toBe('current-context')
})
