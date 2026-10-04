import { beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import AccountWorkspace from '../src/components/AccountWorkspace.vue'
import GameAccountManager from '../src/components/GameAccountManager.vue'
import AccountIdDetails from '../src/components/AccountIdDetails.vue'
import { activeAccount } from '../src/store/activeAccount.js'
import { dialog } from '../src/utils/dialog.js'
import { createAccount, renameAccount, deleteAccount } from '../src/api/accounts.js'

vi.mock('../src/utils/dialog.js', () => ({ dialog: { prompt: vi.fn(), confirm: vi.fn() } }))
vi.mock('../src/api/accounts.js', () => ({ createAccount: vi.fn(), renameAccount: vi.fn(), deleteAccount: vi.fn(), updateAccountGame: vi.fn() }))
vi.mock('../src/store/activeAccount.js', () => ({
  ACCOUNT_GAMES: ['代号鸢', '如鸢'], DEFAULT_ACCOUNT_GAME: '代号鸢',
  isAccountGame: value => ['代号鸢', '如鸢'].includes(value), normalizeAccountGame: value => value || '代号鸢',
  activeAccount: { id: 'acc-a', gameFor: () => '代号鸢', set: vi.fn(), setGame: vi.fn(), forgetGame: vi.fn() }
}))

const accounts = [{ id: 'acc-a', name: '大号', game: '代号鸢' }, { id: 'acc-b', name: '小号', game: '如鸢' }]
const global = { stubs: { RouterLink: RouterLinkStub }, directives: { reveal: () => {} } }

beforeEach(() => { vi.clearAllMocks(); dialog.confirm.mockResolvedValue(true) })

it('账号技术编号默认折叠，展开后可复制', async () => {
  const writeText = vi.fn().mockResolvedValue()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  const wrapper = mount(AccountIdDetails, { props: { value: 'acc-a' } })
  expect(wrapper.get('details').element.open).toBe(false)
  await wrapper.get('summary').trigger('click')
  expect(wrapper.get('details').element.open).toBe(true)
  await wrapper.get('button').trigger('click')
  await flushPromises()
  expect(writeText).toHaveBeenCalledWith('acc-a')
  expect(wrapper.get('button').text()).toBe('已复制')
})

it('柔和账号下拉关联标签，方向键导航并在选中或 Escape 后归还焦点', async () => {
  const wrapper = mount(AccountWorkspace, { props: { softDropdown: true, manageEnabled: false, accountId: 'acc-a', accounts }, global, attachTo: document.body })
  const trigger = wrapper.get('.account-soft-trigger')
  expect(wrapper.get('.ac-label').attributes('for')).toBe(trigger.attributes('id'))
  trigger.element.focus()
  await trigger.trigger('keydown', { key: 'ArrowDown' })
  await flushPromises()
  const options = wrapper.findAll('.account-soft-option')
  expect(document.activeElement).toBe(options[0].element)
  await options[0].trigger('keydown', { key: 'ArrowDown' })
  expect(document.activeElement).toBe(options[1].element)
  await options[1].trigger('click')
  await flushPromises()
  expect(wrapper.emitted('update:accountId').at(-1)).toEqual(['acc-b'])
  expect(document.activeElement).toBe(trigger.element)
  await trigger.trigger('keydown', { key: 'ArrowUp' })
  await flushPromises()
  await wrapper.get('.account-soft-option').trigger('keydown', { key: 'Escape' })
  await flushPromises()
  expect(wrapper.find('.account-soft-listbox').exists()).toBe(false)
  expect(document.activeElement).toBe(trigger.element)
  wrapper.unmount()
})

it('改名与删除后给出明确成功状态，账号编号不再直接显示在按钮里', async () => {
  dialog.prompt.mockResolvedValue('新名字')
  renameAccount.mockResolvedValue({ id: 'acc-a', name: '新名字' })
  deleteAccount.mockResolvedValue()
  const wrapper = mount(GameAccountManager, { props: { accounts, accountId: 'acc-a' }, global })
  expect(wrapper.get('.account-main').text()).not.toContain('acc-a')
  expect(wrapper.get('.account-identity details').element.open).toBe(false)
  await wrapper.get('.icon-action:not(.danger)').trigger('click')
  await flushPromises()
  expect(wrapper.get('[role="status"]').text()).toContain('已将游戏账号改名为“新名字”')
  await wrapper.get('.icon-action.danger').trigger('click')
  await flushPromises()
  expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({ type: 'danger', confirmText: '确认删除' }))
  expect(wrapper.get('[role="status"]').text()).toContain('已删除游戏账号“大号”')
  wrapper.unmount()
})

it('个人中心选择账号会更新各数据页共用的当前账号', async () => {
  const wrapper = mount(GameAccountManager, { props: { accounts, accountId: 'acc-a' }, global })
  expect(wrapper.findAll('.account-main')[1].text()).toContain('设为当前')
  await wrapper.findAll('.account-main')[1].trigger('click')
  expect(activeAccount.set).toHaveBeenCalledWith('acc-b')
  expect(wrapper.emitted('update:accountId').at(-1)).toEqual(['acc-b'])
  wrapper.unmount()
})

it('创建失败保留游戏和名称，重试时禁止重复创建', async () => {
  createAccount.mockRejectedValueOnce(new Error('synthetic create failure'))
  const wrapper = mount(GameAccountManager, { props: { accounts, accountId: 'acc-a' }, global })
  await wrapper.get('input[value="如鸢"]').setValue()
  await wrapper.get('#new-game-account-name').setValue('创建测试账号')
  await wrapper.get('.create-card').trigger('submit'); await flushPromises()
  expect(wrapper.get('#new-game-account-name').element.value).toBe('创建测试账号')
  expect(wrapper.get('input[value="如鸢"]').element.checked).toBe(true)
  expect(wrapper.get('[role="alert"]').text()).toContain('synthetic create failure')
  let finish
  createAccount.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  await wrapper.get('.create-card').trigger('submit')
  await wrapper.get('.create-card').trigger('submit')
  expect(createAccount).toHaveBeenCalledTimes(2)
  expect(createAccount).toHaveBeenLastCalledWith('创建测试账号', '如鸢')
  expect(wrapper.get('.create-card button').attributes()).toHaveProperty('disabled')
  finish({ id: 'acc-new', name: '创建测试账号', game: '如鸢' }); await flushPromises()
  expect(wrapper.emitted('update:accountId').at(-1)).toEqual(['acc-new'])
  expect(wrapper.get('#new-game-account-name').element.value).toBe('')
  wrapper.unmount()
})
