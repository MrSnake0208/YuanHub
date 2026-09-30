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

it('所有星级步骤默认1级1修为，未勾选不产生导入', async () => {
  const wrapper = render()
  await flushPromises()
  for (let index = 0; index < 6; index++) {
    const inputs = wrapper.findAll('.batch-bar input[type="number"]')
    expect(inputs.map(input => input.element.value)).toEqual(['1', '1'])
    await wrapper.get('.wiz-actions .primary').trigger('click')
    await flushPromises()
  }
  expect(importOperator).not.toHaveBeenCalled()
})

it('勾选后直接保存使用1级1修为和当前星级，保留已有命盘星石', async () => {
  getOperatorCurrent.mockResolvedValue([{ entries: {
    op: { level: 0, elite: 0, starLevel: 0, discs: [{ otName: '测试命盘' }], starStones: [] },
  } }])
  const wrapper = render()
  await flushPromises()
  expect(importOperator).not.toHaveBeenCalled()
  await wrapper.get('.op-check').setValue(true)
  await flushPromises()
  await wrapper.get('.wiz-actions .primary').trigger('click')
  await flushPromises()
  expect(importOperator).toHaveBeenCalledTimes(1)
  expect(importOperator.mock.calls[0][0].records[0].entries).toEqual([
    expect.objectContaining({ id: 'op', level: 1, elite: 1, starLevel: 1, discs: [{ otName: '测试命盘' }], starStones: [] }),
  ])
})

it.each([[100, 17], [90, 15]])('练度预设 %i+%i 只填当前页草稿，保存时仅提交勾选密探', async (level, elite) => {
  getOperatorCatalog.mockResolvedValue({ operators: ['op', 'op2', 'op3'].map(id => ({
    id, name: id, rarity: 3, games: ['如鸢'],
  })) })
  const wrapper = render()
  await flushPromises()
  const checks = wrapper.findAll('.op-check')
  await checks[0].setValue(true)
  await checks[1].setValue(true)
  const selectedIds = wrapper.findAll('.op-card.on .op-name').map(name => name.text())
  await wrapper.findAll('.batch-fields button').find(button => button.text() === `${level}级 / 修为${elite}`).trigger('click')
  await flushPromises()
  expect(wrapper.findAll('.batch-bar input[type="number"]').map(input => input.element.value)).toEqual([String(level), String(elite)])
  expect(checks.map(input => input.element.checked)).toEqual([true, true, false])
  expect(importOperator).not.toHaveBeenCalled()
  await wrapper.get('.wiz-actions .primary').trigger('click')
  await flushPromises()
  const entries = importOperator.mock.calls[0][0].records[0].entries
  expect(entries).toHaveLength(2)
  expect(entries.map(entry => entry.id)).toEqual(selectedIds)
  expect(entries).toEqual(selectedIds.map(id => expect.objectContaining({ id, level, elite, starLevel: 1 })))
  expect(wrapper.findAll('.batch-bar input[type="number"]').map(input => input.element.value)).toEqual(['1', '1'])
  wrapper.unmount()
})

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
