import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import CartPage from '../src/pages/tools/cart.vue'
import CustomPackageModal from '../src/components/cart/CustomPackageModal.vue'
import PlanSaveDialog from '../src/components/cart/PlanSaveDialog.vue'
import { dialog } from '../src/utils/dialog.js'
import html2canvas from 'html2canvas'

vi.mock('../src/store/auth.js', () => ({ auth: { isLoggedIn: false } }))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn() } }))
vi.mock('html2canvas', () => ({ default: vi.fn() }))

const render = () => mount(CartPage, { attachTo: document.body, global: {
  stubs: { IslandSidebar: true, SiteFooter: true },
  directives: { reveal: () => {} },
} })
const addFirst = async (wrapper) => {
  await wrapper.get('.pkg-card .stepper button:last-child').trigger('click')
}

beforeEach(() => {
  vi.clearAllMocks()
  dialog.confirm.mockResolvedValue(true)
  vi.stubGlobal('requestAnimationFrame', callback => callback())
})

it('清空须确认；切换版本仍能看到另一版本的数量', async () => {
  const wrapper = render()
  await addFirst(wrapper)
  expect(wrapper.get('.cart-version-hint').text()).toContain('0 件')
  await wrapper.get('.cart-version-selector').setValue('ru')
  await addFirst(wrapper)
  expect(wrapper.get('.cart-version-hint').text()).toContain('代号鸢」购物车有 1 件')
  dialog.confirm.mockResolvedValueOnce(false)
  await wrapper.get('.cart-actions button').trigger('click')
  await flushPromises()
  expect(wrapper.get('.receipt').text()).toContain('¥')
  expect(wrapper.get('.cart-version-selector option[value="ru"]').text()).toContain('1 件')
  await wrapper.get('.cart-actions button').trigger('click')
  await flushPromises()
  expect(wrapper.get('.receipt-empty').exists()).toBe(true)
  expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({ type: 'danger', message: expect.stringContaining('如鸢') }))
  await wrapper.get('.cart-version-selector').setValue('daihao')
  expect(wrapper.get('.cart-version-selector option[value="daihao"]').text()).toContain('1 件')
})

it('自定义礼包删除入口始终有名称，取消保留礼包和购物车', async () => {
  const wrapper = render()
  wrapper.getComponent(CustomPackageModal).vm.$emit('submit', { name: '测试礼包', price: 5, points: 10, draws: 0, limit: 3 })
  await flushPromises()
  const deleteButton = wrapper.get('.pkg-del')
  expect(deleteButton.attributes('aria-label')).toContain('测试礼包')
  await wrapper.findAll('.pkg-card').at(-1).get('.stepper button:last-child').trigger('click')
  dialog.confirm.mockResolvedValueOnce(false)
  await deleteButton.trigger('click')
  await flushPromises()
  expect(wrapper.get('.pkg-del').exists()).toBe(true)
  expect(wrapper.get('.receipt').text()).toContain('测试礼包')
  await wrapper.get('.pkg-del').trigger('click')
  await flushPromises()
  expect(wrapper.find('.pkg-del').exists()).toBe(false)
  expect(wrapper.get('.receipt').text()).not.toContain('测试礼包')
  expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('购物车中的 1 件') }))
})

it('游客保存成功和本地存储失败均有页内反馈', async () => {
  const wrapper = render()
  await wrapper.get('.cart-plan-save').trigger('click')
  wrapper.getComponent(PlanSaveDialog).vm.$emit('save', { name: '测试方案', overwrite: false })
  await flushPromises()
  expect(wrapper.get('[role="status"]').text()).toContain('已暂存在本机浏览器')
  expect(JSON.parse(localStorage.getItem('yh_ledger_plans'))[0].name).toBe('测试方案')
  await wrapper.get('.cart-plan-save').trigger('click')
  vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('quota') })
  wrapper.getComponent(PlanSaveDialog).vm.$emit('save', { name: '第二方案', overwrite: false })
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('保存失败')
})

it('桌面和手机导出共用流程，完成和失败均反馈', async () => {
  const wrapper = render()
  await addFirst(wrapper)
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  html2canvas.mockResolvedValueOnce({ toDataURL: () => 'data:image/png;base64,AA' })
  await wrapper.findAll('.cart-actions button')[1].trigger('click')
  await flushPromises()
  expect(html2canvas).toHaveBeenCalledTimes(1)
  expect(click).toHaveBeenCalledTimes(1)
  expect(wrapper.get('[role="status"]').text()).toContain('浏览器将开始下载')
  html2canvas.mockRejectedValueOnce(new Error('screenshot'))
  await wrapper.get('.cart-mbar .mbtn.accent').trigger('click')
  await flushPromises()
  expect(html2canvas).toHaveBeenCalledTimes(2)
  expect(wrapper.get('[role="alert"]').text()).toContain('导出图片失败')
})


it('紧凑分类选择与搜索组合，清除条件不修改已选礼包', async () => {
  const wrapper = render()
  await addFirst(wrapper)
  const total = wrapper.get('.receipt .grand-total .v').text()
  const category = wrapper.get('.cart-category select')
  const choice = category.findAll('option')[1].element.value
  await category.setValue(choice)
  expect(wrapper.findAll('.pkg-card').length).toBeGreaterThan(0)
  await wrapper.get('.cart-search input').setValue('不匹配任何礼包的预览文本')
  expect(wrapper.findAll('.pkg-card')).toHaveLength(0)
  await wrapper.get('.cart-filter-empty button').trigger('click')
  expect(category.element.value).toBe('全部')
  expect(wrapper.get('.cart-search input').element.value).toBe('')
  expect(wrapper.get('.receipt .grand-total .v').text()).toBe(total)
})


it('修正汇率时保持设置展开，不打断连续输入', async () => {
  const wrapper = render()
  const settings = wrapper.get('.cart-rate-settings')
  settings.element.open = true
  const input = wrapper.get('[aria-label="美元兑人民币汇率"]')
  await input.setValue('')
  expect(input.attributes('aria-invalid')).toBe('true')
  await input.setValue('7')
  expect(settings.element.open).toBe(true)
  await input.setValue('7.2')
  expect(settings.element.open).toBe(true)
  expect(wrapper.find('#cart-rate-error').exists()).toBe(false)
})
