import { beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import QuickPage from '../src/pages/operator/quick.vue'
import { dialog } from '../src/utils/dialog.js'
import { getOperatorCatalog, listOperatorAccounts, getOperatorCurrent, importOperator } from '../src/api/operator.js'
import { useRouter } from 'vue-router'

const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', () => ({
  useRouter: () => router,
  useRoute: () => ({ query: {} }),
  onBeforeRouteLeave: () => {}, onBeforeRouteUpdate: () => {},
}))
vi.mock('../src/api/operator.js', () => ({
  getOperatorCatalog: vi.fn(), listOperatorAccounts: vi.fn(), getOperatorCurrent: vi.fn(), importOperator: vi.fn(),
}))
vi.mock('../src/api/request.js', () => ({ avatarUrl: value => value || '' }))
vi.mock('../src/store/auth.js', () => ({ auth: { isLoggedIn: true } }))
vi.mock('../src/store/activeAccount.js', () => ({ activeAccount: { id: 'acc', gameFor: () => '如鸢', set: vi.fn(), syncAccounts: vi.fn() } }))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn() } }))

beforeEach(() => {
  vi.clearAllMocks()
  getOperatorCatalog.mockResolvedValue({ operators: [{ id: 'op', name: '测试密探', rarity: 3, games: ['如鸢'] }] })
  listOperatorAccounts.mockResolvedValue([{ id: 'acc', name: '测试账号', game: '如鸢' }])
  getOperatorCurrent.mockResolvedValue([])
  importOperator.mockResolvedValue({ accepted: 1 })
  dialog.confirm.mockResolvedValue(true)
})

const render = () => mount(QuickPage, { global: {
  stubs: { IslandSidebar: true, SiteFooter: true, DataAccountContextBar: true, RouterLink: true },
  directives: { reveal: () => {} },
} })

it('锁定说明可见；清空选择可取消；完成后停在摘要直到用户返回', async () => {
  const wrapper = render()
  await flushPromises()
  expect(wrapper.get('.step-help').text()).toContain('保存本页并下一步')
  await wrapper.get('.op-check').setValue(true)
  dialog.confirm.mockResolvedValueOnce(false)
  await wrapper.findAll('.mini').find(button => button.text() === '清空本页').trigger('click')
  await flushPromises()
  expect(wrapper.get('.op-check').element.checked).toBe(true)
  await wrapper.findAll('.mini').find(button => button.text() === '清空本页').trigger('click')
  await flushPromises()
  expect(wrapper.get('.op-check').element.checked).toBe(false)
  for (let index = 0; index < 6; index++) {
    await wrapper.get('.wiz-actions .primary').trigger('click')
    await flushPromises()
  }
  expect(wrapper.get('.quick-complete').text()).toContain('快捷录入已完成')
  expect(useRouter().push).not.toHaveBeenCalled()
  await wrapper.get('.quick-complete button').trigger('click')
  expect(useRouter().push).toHaveBeenCalledWith('/operator')
  wrapper.unmount()
})
