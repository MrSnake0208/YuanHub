import { beforeEach, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick, reactive } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import AccountSwitcher from '../src/components/AccountSwitcher.vue'
import { createAccount } from '../src/api/accounts.js'
import DataAccountContextBar from '../src/components/DataAccountContextBar.vue'
import { activeAccount } from '../src/store/activeAccount.js'
import { auth } from '../src/store/auth.js'

vi.mock('../src/api/accounts.js', () => ({ createAccount: vi.fn(), updateAccount: vi.fn(), deleteAccount: vi.fn() }))

const rows = [{ id: 'a', name: '大号', game: '如鸢' }, { id: 'b', name: '小号', game: '如鸢' }, { id: 'c', name: '主号', game: '代号鸢' }]
let media
beforeEach(() => {
  vi.resetAllMocks()
  auth.accessToken = ''; auth.userInfo = null
  activeAccount.set('a'); activeAccount.syncAccounts(rows)
  media = new EventTarget(); media.matches = true
  window.matchMedia = vi.fn(() => media)
  document.body.style.overflow = ''; document.documentElement.style.overflow = ''
})
async function render(props = {}, compact = true) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })
  await router.push('/operator?tab=current#ledger'); await router.isReady()
  const config = reactive({ ...props })
  const Host = defineComponent({ setup() {
    const accountId = computed(() => activeAccount.id)
    return () => h(DataAccountContextBar, { accounts: rows, accountId: accountId.value, compact, isLoggedIn: true, ...config })
  } })
  const wrapper = mount(Host, { attachTo: document.body, global: { plugins: [router] } })
  return { wrapper, router, config, switcher: wrapper.getComponent(AccountSwitcher) }
}
const option = id => document.querySelector(`[data-account-id="${id}"]`)
async function open(wrapper) { await wrapper.get('.context-selector').trigger('click'); await flushPromises() }

it('分组和当前行明确；点击整行原地更新唯一状态与持久化，关闭后恢复焦点', async () => {
  const { wrapper, router } = await render()
  await open(wrapper)
  expect([...document.querySelectorAll('.switch-list h3')].map(el => el.textContent)).toEqual(['如鸢', '代号鸢'])
  expect(option('a').getAttribute('aria-pressed')).toBe('true')
  expect(document.activeElement).toBe(option('a'))
  option('b').click(); await flushPromises()
  expect(activeAccount.id).toBe('b'); expect(localStorage.getItem('yh_active_account')).toBe('b')
  expect(router.currentRoute.value.fullPath).toBe('/operator?tab=current#ledger')
  expect(document.querySelector('[role=dialog]')).toBeNull()
  expect(wrapper.get('.context-selector').text().replace(/\s/g, '')).toContain('如鸢·小号')
  expect(document.activeElement).toBe(wrapper.get('.context-selector').element)
  await open(wrapper); expect(option('b').getAttribute('aria-pressed')).toBe('true')
  expect([...document.querySelectorAll('.account-switch-panel footer button')].map(el => el.textContent)).toEqual(['新建游戏账号', '管理游戏账号'])
  expect(document.querySelector('.account-switch-panel a')).toBeNull()
  expect(document.querySelector('.switch-list').textContent).not.toMatch(/删除|改名|acc_/)
})
it('Escape、箭头、Home/End 和 Tab 焦点约束；点外部关闭', async () => {
  const { wrapper } = await render(); await open(wrapper)
  option('a').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); expect(document.activeElement).toBe(option('b'))
  option('b').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })); expect(document.activeElement).toBe(option('c'))
  option('c').dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })); expect(document.activeElement).toBe(option('a'))
  document.querySelectorAll('.account-switch-panel footer button')[1].focus()
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })); expect(document.activeElement).toBe(document.querySelector('.switch-close'))
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flushPromises()
  expect(document.querySelector('[role=dialog]')).toBeNull(); expect(document.activeElement).toBe(wrapper.get('.context-selector').element)
  await open(wrapper); document.querySelector('.account-switch-mask').click(); await flushPromises()
  expect(document.querySelector('[role=dialog]')).toBeNull()
})
it('手机使用 Sheet，锁定滚动，实时断点变化和卸载恢复原滚动状态', async () => {
  media.matches = false; document.body.style.overflow = 'auto'
  const { wrapper } = await render(); await open(wrapper)
  expect(document.querySelector('.account-switch-mask').classList.contains('is-desktop')).toBe(false)
  expect(document.body.style.overflow).toBe('hidden')
  media.matches = true; media.dispatchEvent(new Event('change')); await flushPromises()
  expect(document.querySelector('[role=dialog]')).toBeNull(); expect(document.body.style.overflow).toBe('auto')
  media.matches = false; await open(wrapper); wrapper.unmount(); await flushPromises()
  expect(document.body.style.overflow).toBe('auto'); expect(document.documentElement.style.overflow).toBe('')
})
it('超过8个账号才搜索；完整名称保留在可访问标签，空结果仍可管理', async () => {
  const accounts = Array.from({ length: 9 }, (_, index) => ({ id: String(index), name: index === 8 ? '特别长的账号名称'.repeat(12) : '账号' + index, game: '如鸢' }))
  const { wrapper } = await render({ accounts }); await open(wrapper)
  expect(document.activeElement).toBe(document.querySelector('input[type=search]'))
  const input = document.querySelector('input[type=search]')
  input.value = '特别长'; input.dispatchEvent(new Event('input', { bubbles: true })); await nextTick()
  expect(document.querySelectorAll('.switch-option')).toHaveLength(1)
  expect(option('8').getAttribute('aria-label')).toContain(accounts[8].name)
  input.value = '不存在'; input.dispatchEvent(new Event('input', { bubbles: true })); await nextTick()
  expect(document.querySelector('.switch-list').textContent).toContain('没有匹配')
  expect(document.querySelectorAll('.account-switch-panel footer button')).toHaveLength(2)
})
it.each([[], [rows[0]]])('空账号或单账号仍能打开，当前项不触发确认或写入', async accounts => {
  const beforeSwitch = vi.fn()
  const { wrapper } = await render({ accounts, beforeSwitch }); await open(wrapper)
  expect(document.querySelector('.account-switch-panel h2').textContent).toBe('游戏账号')
  expect(document.querySelectorAll('.account-switch-panel footer button')).toHaveLength(2)
  if (accounts.length) { option('a').click(); await flushPromises(); expect(beforeSwitch).not.toHaveBeenCalled() }
  expect(activeAccount.id).toBe('a')
})
it('草稿取消和关键写入禁用不改变账号；不创建成功提示', async () => {
  const beforeSwitch = vi.fn().mockResolvedValue(false)
  const { wrapper, config } = await render({ beforeSwitch }); await open(wrapper)
  option('b').click(); await flushPromises(); expect(activeAccount.id).toBe('a')
  Object.assign(config, { switchDisabled: true, switchDisabledReason: '正在保存' }); await nextTick()
  expect(wrapper.get('.context-selector').attributes('disabled')).toBeDefined()
  expect(wrapper.text()).toContain('正在保存'); expect(wrapper.text()).not.toContain('切换成功')
})
it.each(['account', 'identity', 'deleted', 'unmount', 'roundtrip'])('异步确认期间 %s 变化后不能切到确认目标', async kind => {
  let resolve
  const gate = new Promise(done => { resolve = done })
  const { wrapper, config } = await render({ beforeSwitch: () => gate }); await open(wrapper)
  option('b').click(); await nextTick()
  if (kind === 'account') activeAccount.set('c')
  if (kind === 'identity') auth.accessToken = 'changed-synthetic'
  if (kind === 'deleted') { config.accounts = [rows[0]]; await nextTick() }
  if (kind === 'roundtrip') { activeAccount.set('c'); activeAccount.set('a') }
  if (kind === 'unmount') wrapper.unmount()
  resolve(true); await flushPromises()
  expect(activeAccount.id).toBe(kind === 'account' ? 'c' : 'a')
})
it('默认账号条也提供同一切换器；管理操作原地打开并恢复按钮焦点', async () => {
  const { wrapper } = await render({}, false); await open(wrapper)
  option('c').click(); await flushPromises()
  expect(wrapper.get('.context-selector').text().replace(/\s/g, '')).toContain('代号鸢·主号')
  await wrapper.get('.context-action').trigger('click'); await flushPromises()
  expect(document.querySelector('.account-panel').textContent).toContain('管理你的游戏账号')
  document.querySelector('.account-panel .panel-close').click(); await flushPromises()
  expect(document.activeElement).toBe(wrapper.get('.context-action').element)
})

it('清除当前账号立即关闭切换器，不保留旧账号身份', async () => {
  const { wrapper } = await render(); await open(wrapper)
  activeAccount.clear(); await flushPromises()
  expect(document.querySelector('[role=dialog]')).toBeNull()
  expect(wrapper.get('.context-selector').text()).toBe('选择游戏账号')
})


it.each(['create', 'list'])('Switcher 的 %s 原地打开唯一 Manager，关闭保持路由与触发焦点', async view => {
  const { wrapper, router } = await render(); await open(wrapper)
  document.querySelectorAll('.account-switch-panel footer button')[view === 'create' ? 0 : 1].click(); await flushPromises()
  expect(document.querySelector('.account-switch-panel')).toBeNull()
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
  expect(document.querySelector('.account-panel h3').textContent).toBe(view === 'create' ? '新建游戏账号' : '游戏账号')
  expect(router.currentRoute.value.fullPath).toBe('/operator?tab=current#ledger')
  document.querySelector('.account-panel .panel-close').click(); await flushPromises()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(document.activeElement).toBe(wrapper.get('.context-selector').element)
})

it('原地创建立即更新 Switcher 身份并成为当前账号，保留 Workspace 路由', async () => {
  auth.userInfo = { id: 'synthetic-owner' }; auth.accessToken = 'synthetic-token'
  createAccount.mockResolvedValue({ id: 'd', name: '新账号', game: '代号鸢' })
  const beforeSwitch = vi.fn().mockResolvedValue(true)
  const { wrapper, router } = await render({ beforeSwitch }); await open(wrapper)
  document.querySelector('.account-switch-panel footer button').click(); await flushPromises()
  const input = document.querySelector('.account-panel input'); input.value = '新账号'; input.dispatchEvent(new Event('input', { bubbles: true })); await nextTick()
  document.querySelector('.account-panel form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await flushPromises()
  expect(beforeSwitch).toHaveBeenCalledTimes(1)
  expect(createAccount).toHaveBeenCalledWith('新账号', '代号鸢')
  expect(activeAccount.id).toBe('d'); expect(wrapper.get('.context-selector').text()).toContain('新账号')
  expect(document.querySelector('.account-panel').textContent).toContain('新账号')
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
  expect(router.currentRoute.value.fullPath).toBe('/operator?tab=current#ledger')
})

it('加载失败的新建入口显示原错误，不打开无法提交的表单', async () => {
  const { wrapper } = await render({ error: '账号读取失败' }); await open(wrapper)
  document.querySelector('.account-switch-panel footer button').click(); await flushPromises()
  expect(document.querySelector('.account-panel [role="alert"]').textContent).toContain('账号读取失败')
  expect(document.querySelector('.account-panel form')).toBeNull()
  expect(createAccount).not.toHaveBeenCalled()
})
