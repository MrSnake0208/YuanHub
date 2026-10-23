import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import InventoryRecordsView from '../src/components/inventory/InventoryRecordsView.vue'
import { installViewport } from '../test-support/viewport.js'
import { resourceEntrySummary } from '../src/data/inventory/drawResources.js'

const row = {
  record_id: 'synthetic:' + 'long-id'.repeat(30), record_type: 'stock_snapshot', entity_type: 'item',
  effective_at: '2026-10-13T08:00:00Z', stock_effect: 'applied', entries: [],
  acquisition_channel: '长来源'.repeat(30), stamina_cost: 20,
}
let viewport
const props = () => ({ recordsList: [row], accountId: 'synthetic-a', deleteRecord: vi.fn(),
  fmtTime: value => value, entrySummary: () => '长摘要'.repeat(30),
  iconSrc: entry => '/inventory-icons/' + (entry.entity_type === 'agent' ? 'agents' : 'items') + '/' + entry.id + '.png',
  stockEffectLabel: () => '已生效', staminaCostOf: record => record.stamina_cost,
})
const render = options => mount(InventoryRecordsView, { props: props(), attachTo: document.body, ...options })
beforeEach(() => { viewport = installViewport(390); window.scrollBy = vi.fn() })

it.each([390, 1024])('符传兑换在 %ipx 组件中显示有符号两边变动并整笔删除', async width => {
  viewport.resize(width)
  const exchange = { ...row, record_id: 'draw:exchange', record_type: 'resource_delta', acquisition_channel: '白金币兑换',
    entries: [{ id: 'baijinbi', name: '白金币', count: -2000 }, { id: 'tianjifuchuan', name: '天机符传', count: 10 }] }
  const options = { ...props(), recordsList: [exchange], entrySummary: resourceEntrySummary }
  const wrapper = mount(InventoryRecordsView, { props: options })
  expect(wrapper.text()).toContain('符传使用 / 兑换')
  expect(wrapper.text()).toContain('白金币−2000')
  expect(wrapper.text()).toContain('天机符传+10')
  await wrapper.get('.record-del').trigger('click')
  expect(options.deleteRecord).toHaveBeenCalledWith(exchange)
  wrapper.unmount()
})

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
    const details = wrapper.get('.record-details')
    expect(details.isVisible()).toBe(false)
    expect(wrapper.get('.record-del').isVisible()).toBe(true)
    expect(wrapper.get('.record-del').element.closest('.record-details')).toBeNull()
    const toggle = wrapper.get('[data-record-action="details"]')
    expect(toggle.attributes('aria-controls')).toBe(details.attributes('id'))
    expect(toggle.attributes('aria-label')).toBe('显示详情')
    await toggle.trigger('click')
    expect(details.isVisible()).toBe(true)
    expect(toggle.attributes('aria-expanded')).toBe('true')
    await toggle.trigger('click')
    expect(details.isVisible()).toBe(false)
  }
  await wrapper.get('.record-del').trigger('click')
  expect(wrapper.props('deleteRecord')).toHaveBeenCalledOnce()
  expect(wrapper.props('deleteRecord')).toHaveBeenCalledWith(row)
  await flushPromises()
  expect(wrapper.get('.record-details').isVisible()).toBe(false)
})

it('跨断点保留展开状态和语义焦点，同一模式 resize 保留节点，卸载清除监听', async () => {
  const wrapper = render()
  const media = viewport.queries.find(({ media }) => media.media === '(max-width: 640px)')
  const details = wrapper.get('.record-details')
  await wrapper.get('[data-record-action="details"]').trigger('click')
  wrapper.get('.record-del').element.focus()
  viewport.resize(430)
  await flushPromises()
  expect(wrapper.get('.record-details').element).toBe(details.element)
  for (const width of [641, 1024, 390, 768, 640]) {
    viewport.resize(width)
    await flushPromises()
    expect(wrapper.findAll('.record-list')).toHaveLength(1)
    expect(document.activeElement).toBe(wrapper.get('.record-del').element)
    expect(wrapper.get('.record-details').isVisible()).toBe(true)
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
  wrapper.get('[data-record-action="details"]').element.focus()
  viewport.resize(1440)
  await flushPromises()
  expect(document.activeElement).toBe(wrapper.get('[data-record-action="details"]').element)
  expect(wrapper.props('deleteRecord')).not.toHaveBeenCalled()
})

it('移动时间线区分快照项目数和真实增量，不把盘点显示为收益', async () => {
  const wrapper = render({ props: { ...props(), entrySummary: (entries, type) =>
    entries.map(entry => entry.id + (type === 'reward_delta' ? '+' : '=') + entry.count).join('、'),
    recordsList: [{ ...row, entries: [{ id: 'fuchuan', count: 80 }] },
      { ...row, record_id: 'reward:test', record_type: 'reward_delta', entries: [{ id: 'fuchuan', count: 7 }] }] } })
  expect(wrapper.findAll('.record-change').map(node => node.text())).toEqual(['1 项盘点', 'fuchuan+7'])
  expect(wrapper.get('.record-change').text()).not.toContain('+80')
  expect(wrapper.findAll('.record-marker')).toHaveLength(2)
  await wrapper.setProps({ recordsList: [{ ...row, record_type: 'reward_delta', entries: [{ id: 'fuchuan', count: 7 }, { id: 'baijinbi', count: 30 }] }] })
  expect(wrapper.get('.record-change').text()).toBe('2 项奖励')
  expect(wrapper.get('.record-details').isVisible()).toBe(false)
  expect(wrapper.findAll('.record-copy .record-entry').map(node => node.text())).toEqual(['fuchuan+7', 'baijinbi+30'])
  expect(wrapper.get('.record-copy .record-entries').isVisible()).toBe(true)
  expect(wrapper.get('.record-copy .record-source').text()).toBe('来源：' + row.acquisition_channel)
  expect(wrapper.get('.record-copy .record-source').isVisible()).toBe(true)
  await wrapper.setProps({ recordsList: [{ ...row, acquisition_channel: undefined }] })
  expect(wrapper.get('.record-copy .record-source').text()).toBe('来源：未标注来源')
})

it.each([[390, 'item'], [390, 'agent'], [768, 'item'], [768, 'agent'], [1440, 'item'], [1440, 'agent']])('%ipx 记录使用 %s 对应资源图标，加载失败仍保留名称数量', async (width, entityType) => {
  viewport.resize(width)
  const entry = { id: 'synthetic-icon', name: '测试物品', count: 3 }
  const iconSrc = vi.fn(props().iconSrc)
  const wrapper = render({ props: { ...props(), iconSrc, recordsList: [{ ...row, entity_type: entityType, entries: [entry] }],
    entrySummary: entries => entries.map(value => value.name + '=' + value.count).join('、') } })
  const image = wrapper.get('.record-entry img')
  expect(image.isVisible()).toBe(true)
  expect(image.attributes('src')).toBe('/inventory-icons/' + (entityType === 'agent' ? 'agents' : 'items') + '/synthetic-icon.png')
  expect(iconSrc).toHaveBeenCalledWith({ ...entry, entity_type: entityType })
  expect(entry).not.toHaveProperty('entity_type')
  await image.trigger('error')
  expect(image.isVisible()).toBe(false)
  expect(wrapper.get('.record-entry').text()).toBe('测试物品=3')
  expect(wrapper.get('.record-details').isVisible()).toBe(false)
  await image.trigger('load')
  expect(image.isVisible()).toBe(true)
})

it.each([641, 768, 900, 901, 1440])('%ipx 桌面记录常驻物品与来源，记录 ID 可展开收起', async width => {
  viewport.resize(width)
  const wrapper = render({ props: { ...props(), recordsList: [{ ...row, entries: [{ id: 'fuchuan', count: 4 }] }],
    entrySummary: entries => entries.map(entry => entry.id + '=' + entry.count).join('、') } })
  expect(wrapper.get('.records-desktop-panel h2').text()).toBe('库存变更记录')
  expect(wrapper.get('.record-entry').text()).toBe('fuchuan=4')
  expect(wrapper.get('.record-entry').isVisible()).toBe(true)
  expect(wrapper.get('.record-source').text()).toBe('来源：' + row.acquisition_channel)
  expect(wrapper.get('.record-source').isVisible()).toBe(true)
  expect(wrapper.get('.record-time').attributes('datetime')).toBe(row.effective_at)
  expect(wrapper.get('.record-id').isVisible()).toBe(false)
  const toggle = wrapper.get('[data-record-action="details"]')
  expect(toggle.attributes('aria-controls')).toBe(wrapper.get('.record-details').attributes('id'))
  await toggle.trigger('click')
  expect(toggle.attributes('aria-expanded')).toBe('true')
  expect(wrapper.get('.record-id').isVisible()).toBe(true)
  await toggle.trigger('click')
  expect(wrapper.get('.record-id').isVisible()).toBe(false)
  expect(wrapper.props('deleteRecord')).not.toHaveBeenCalled()
})
