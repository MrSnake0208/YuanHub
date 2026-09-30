import { beforeEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ResourceBalanceReport from '../src/components/inventory/ResourceBalanceReport.vue'

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
})
const snapshot = entries => ({ record_id: 'snapshot', entity_type: 'item', record_type: 'stock_snapshot', snapshot_scope: 'listed', effective_at: '2026-09-30T12:00:00+08:00', entries })
const button = (wrapper, text) => wrapper.findAll('button').find(node => node.text() === text)

it('切换口径更新库存及趋势点，并清掉旧 tooltip，显示折算明细', async () => {
  const wrapper = mount(ResourceBalanceReport, { props: { from: '2026-09-30', to: '2026-09-30', records: [snapshot([{ id: 'baijinbi', count: 100 }, { id: 'zhuyu', count: 2 }])] } })
  expect(wrapper.get('.summary-values strong').text()).toBe('100')
  await button(wrapper, '趋势').trigger('click')
  await wrapper.get('circle[role="button"]').trigger('click')
  expect(wrapper.get('.point-stock strong').text()).toBe('100')
  await button(wrapper, '含茱萸等价值').trigger('click')
  expect(wrapper.find('.point-tooltip').exists()).toBe(false)
  expect(wrapper.get('.summary-values strong').text()).toBe('200')
  await wrapper.get('circle[role="button"]').trigger('click')
  expect(wrapper.get('.point-stock strong').text()).toBe('200')
  expect(wrapper.get('.point-tooltip').text()).toContain('白金币 100 + 茱萸 2 × 50')
  await button(wrapper, '实际白金币').trigger('click')
  expect(wrapper.get('.summary-values strong').text()).toBe('100')
  expect(wrapper.find('.point-tooltip').exists()).toBe(false)
})

it('只有白金币盘点时，含茱萸显示缺测而非补零，实际口径仍可查看', async () => {
  const wrapper = mount(ResourceBalanceReport, { props: { from: '2026-09-30', to: '2026-09-30', records: [snapshot([{ id: 'baijinbi', count: 100 }])] } })
  await button(wrapper, '含茱萸等价值').trigger('click')
  expect(wrapper.get('.summary-values strong').text()).toBe('—')
  expect(wrapper.text()).toContain('缺测不按零处理')
  await button(wrapper, '实际白金币').trigger('click')
  expect(wrapper.get('.summary-values strong').text()).toBe('100')
})
