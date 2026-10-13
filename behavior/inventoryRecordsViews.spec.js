import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import InventoryRecordsView from '../src/components/inventory/InventoryRecordsView.vue'
import { installViewport } from '../test-support/viewport.js'

const row = {
  record_id: 'synthetic:' + 'long-id'.repeat(30), record_type: 'stock_snapshot', entity_type: 'item',
  effective_at: '2026-10-13T08:00:00Z', stock_effect: 'applied', entries: [],
  acquisition_channel: '长来源'.repeat(30), stamina_cost: 20,
}
let viewport
const props = () => ({ recordsList: [row], accountId: 'synthetic-a', deleteRecord: vi.fn(),
  fmtTime: value => value, entrySummary: () => '长摘要'.repeat(30),
  stockEffectLabel: () => '已生效', staminaCostOf: record => record.stamina_cost,
})
const render = options => mount(InventoryRecordsView, { props: props(), attachTo: document.body, ...options })
beforeEach(() => { viewport = installViewport(390); window.scrollBy = vi.fn() })

it.each([320, 390, 430, 640, 641, 768, 1024, 1440])('%ipx 初始即只挂载对应视图，详情保留完整字段', async width => {
  viewport.resize(width)
  const wrapper = render()
  expect(wrapper.find('.records-mobile').exists()).toBe(width <= 640)
  expect(wrapper.findAll('.record-list')).toHaveLength(1)
  expect(wrapper.text()).toContain('库存更新')
  expect(wrapper.text()).toContain(row.record_id)
  expect(wrapper.text()).toContain(row.acquisition_channel)
  expect(wrapper.text()).toContain('消耗体力 20')
  expect(wrapper.text()).toContain('已生效')
  expect(wrapper.text()).not.toContain('未知类型')
  if (width <= 640) {
    const details = wrapper.get('details')
    expect(details.element.open).toBe(false)
    details.element.open = true
    await details.trigger('toggle')
    expect(wrapper.get('.record-del').element.closest('details').open).toBe(true)
  }
  await wrapper.get('.record-del').trigger('click')
  expect(wrapper.props('deleteRecord')).toHaveBeenCalledOnce()
  expect(wrapper.props('deleteRecord')).toHaveBeenCalledWith(row)
})

it('跨断点保留展开状态和语义焦点，同一模式 resize 保留节点，卸载清除监听', async () => {
  const wrapper = render()
  const media = viewport.queries.find(({ media }) => media.media === '(max-width: 640px)')
  const details = wrapper.get('details')
  details.element.open = true
  await details.trigger('toggle')
  wrapper.get('.record-del').element.focus()
  viewport.resize(430)
  await flushPromises()
  expect(wrapper.get('details').element).toBe(details.element)
  for (const width of [641, 1024, 390, 768, 640]) {
    viewport.resize(width)
    await flushPromises()
    expect(wrapper.findAll('.record-list')).toHaveLength(1)
    expect(document.activeElement).toBe(wrapper.get('.record-del').element)
    if (width <= 640) expect(wrapper.get('details').element.open).toBe(true)
  }
  expect(wrapper.props('deleteRecord')).not.toHaveBeenCalled()
  wrapper.unmount()
  expect(media.listeners.size).toBe(0)
  expect(media.media.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
})

it('挂载时再次同步 matches，缺少 matchMedia 时安全采用桌面视图', async () => {
  const original = window.matchMedia
  vi.stubGlobal('matchMedia', query => {
    const media = original(query)
    media.addEventListener.mockImplementation(() => { media.matches = false })
    return media
  })
  const wrapper = render()
  await flushPromises()
  expect(wrapper.find('.records-desktop').exists()).toBe(true)
  wrapper.unmount()
  vi.stubGlobal('matchMedia', undefined)
  expect(render().find('.records-desktop').exists()).toBe(true)
})

it.each([390, 1440])('%ipx 未知类型/缺字段安全显示；忙碌与消耗记录禁止删除', async width => {
  viewport.resize(width)
  const wrapper = render({ props: { ...props(), recordsList: [{ record_id: 'unknown', record_type: 'future', entity_type: 'future' }],
    fmtTime: () => '', entrySummary: () => '', stockEffectLabel: () => '未知', disabled: true } })
  for (const value of ['未知类型（future）', '未知对象（future）', '时间未提供', '暂无项目明细', 'unknown']) expect(wrapper.text()).toContain(value)
  expect(wrapper.get('.record-del').element.disabled).toBe(true)
  await wrapper.get('.record-del').trigger('click')
  expect(wrapper.props('deleteRecord')).not.toHaveBeenCalled()
  await wrapper.setProps({ disabled: false, recordsList: [{ ...row, record_type: 'consumption_delta' }] })
  expect(wrapper.text()).toContain('升级消耗')
  expect(wrapper.find('.record-del').exists()).toBe(false)
})

it('确认期间切换视图不抢弹窗焦点，取消后恢复到新删除入口', async () => {
  let resolve
  const confirmation = new Promise(done => { resolve = done })
  const wrapper = render({ props: { ...props(), deleteRecord: vi.fn(() => confirmation) } })
  wrapper.get('details').element.open = true
  await wrapper.get('details').trigger('toggle')
  wrapper.get('.record-del').element.focus()
  await wrapper.get('.record-del').trigger('click')
  const modalButton = document.createElement('button')
  document.body.append(modalButton)
  modalButton.focus()
  viewport.resize(1440)
  await flushPromises()
  expect(document.activeElement).toBe(modalButton)
  modalButton.remove()
  resolve()
  await flushPromises()
  expect(document.activeElement).toBe(wrapper.get('.record-del').element)
  expect(wrapper.props('deleteRecord')).toHaveBeenCalledOnce()
})

it.each(['busy', 'consumption'])('%s 记录旋转后焦点留在同一记录，不落到禁用按钮或页面外', async mode => {
  const wrapper = render({ props: { ...props(), disabled: mode === 'busy',
    recordsList: [{ ...row, record_type: mode === 'consumption' ? 'consumption_delta' : row.record_type }] } })
  wrapper.get('summary').element.focus()
  viewport.resize(1440)
  await flushPromises()
  expect(document.activeElement).toBe(wrapper.get('.record').element)
  expect(wrapper.props('deleteRecord')).not.toHaveBeenCalled()
})
