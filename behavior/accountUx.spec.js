import { beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import AccountWorkspace from '../src/components/AccountWorkspace.vue'
import AccountIdDetails from '../src/components/AccountIdDetails.vue'
import { dialog } from '../src/utils/dialog.js'

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
