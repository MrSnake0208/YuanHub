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

const period = { from: '2026-09-28', to: '2026-10-02' }
const datedSnapshot = (id, day, entries, scope = 'listed') => ({
  ...snapshot(entries), record_id: id, effective_at: `${day}T12:00:00+08:00`, snapshot_scope: scope,
})
const calendarDay = (wrapper, day) => wrapper.findAll('button.day').find(node => node.attributes('aria-label').startsWith(day))

it('首次零库存显示基准，重复零盘点显示0，缺测和未更新保留不同含义', async () => {
  const wrapper = mount(ResourceBalanceReport, { props: { ...period, records: [
    datedSnapshot('first', '2026-09-29', [{ id: 'baijinbi', count: 0 }]),
    datedSnapshot('same', '2026-10-01', [{ id: 'baijinbi', count: 0 }]),
  ] } })
  expect(wrapper.get('.summary-values strong').text()).toBe('0')
  expect(wrapper.findAll('.summary-values strong')[1].text()).toBe('—')
  expect(calendarDay(wrapper, '2026-09-29').get('.resource-row b').text()).toBe('基准')
  expect(calendarDay(wrapper, '2026-09-29').attributes('aria-label')).toContain('库存 0 · 实际盘点')
  expect(calendarDay(wrapper, '2026-10-01').get('.resource-row b').text()).toBe('0')
  expect(calendarDay(wrapper, '2026-09-28').text()).toContain('无基准')
  expect(calendarDay(wrapper, '2026-09-30').text()).toContain('未更新')
  await calendarDay(wrapper, '2026-09-29').trigger('click')
  expect(wrapper.get('.day-detail').text()).toContain('库存 0 · 实际盘点 · 起始基准，变化不可比较')
  await calendarDay(wrapper, '2026-09-30').trigger('click')
  expect(wrapper.get('.day-detail').text()).toContain('记录于 2026-09-29，当日未更新')
  expect(wrapper.get('.day-detail').text()).toContain('实际盘点')
  expect(wrapper.get('.day-detail').text()).toContain('本期截至当日无库存基准')
  expect(wrapper.text()).not.toContain('空格子表示当日库存无变化')
})

it('盘点后推算与跨日比较明确，沿用日仍指向原记录，不虚构当日变化', async () => {
  const wrapper = mount(ResourceBalanceReport, { props: { ...period, records: [
    datedSnapshot('first', '2026-09-29', [{ id: 'baijinbi', count: 100 }]),
    { record_id: 'reward', entity_type: 'item', record_type: 'reward_delta', effective_at: '2026-10-01T12:00:00+08:00', entries: [{ id: 'baijinbi', count: 20 }] },
  ] } })
  expect(wrapper.get('.summary-meta').text()).toContain('盘点后推算')
  expect(calendarDay(wrapper, '2026-10-01').get('.resource-row').attributes('aria-label')).toContain('较 2026-09-29 变化 +20')
  await calendarDay(wrapper, '2026-10-01').trigger('click')
  expect(wrapper.get('.day-detail').text()).toContain('盘点后推算 · +20（较 2026-09-29）')
  await calendarDay(wrapper, '2026-10-02').trigger('click')
  expect(wrapper.get('.day-detail').text()).toContain('盘点后推算，记录于 2026-10-01，当日未更新')
  expect(wrapper.text()).toContain('可能跨越多日')
  expect(wrapper.text()).toContain('本期首末有效库存记录之差')
  await button(wrapper, '趋势').trigger('click')
  expect(wrapper.get('.legend').text()).toContain('跨未记录日期连线')
  expect(wrapper.get('.legend').text()).not.toContain('预测值')
})

it.each(['无流水', '仅奖励', '周期外基准'])('%s显示本期空态和行动入口，不冒充从未盘点', variant => {
  const records = variant === '无流水' ? [] : variant === '仅奖励'
    ? [{ record_id: 'reward', entity_type: 'item', record_type: 'reward_delta', effective_at: '2026-09-30T12:00:00+08:00', entries: [{ id: 'baijinbi', count: 20 }] }]
    : [datedSnapshot('outside', '2026-09-27', [{ id: 'baijinbi', count: 100 }])]
  const wrapper = mount(ResourceBalanceReport, {
    props: { ...period, records },
    slots: { 'empty-actions': '<button type="button">调整日期范围</button><button type="button">盘点库存</button>' },
  })
  expect(wrapper.get('.report-empty').text()).toContain('本期暂无可计算的库存基准')
  expect(wrapper.get('.report-empty').text()).toContain('不代表从未盘点')
  expect(wrapper.find('.calendar').exists()).toBe(false)
  expect(wrapper.get('.summary-values strong').text()).toBe('—')
  expect(wrapper.findAll('.report-empty-actions button')).toHaveLength(2)
})

it('错误与截断不显示无基准录入入口，恢复成功后才显示已知零库存', async () => {
  const wrapper = mount(ResourceBalanceReport, {
    props: { ...period, records: [], error: '接口不可用' },
    slots: { 'error-actions': '<button type="button">重试读取</button>', 'empty-actions': '<button>盘点库存</button>' },
  })
  expect(wrapper.get('[role="alert"]').text()).toContain('读取失败不代表没有盘点')
  expect(wrapper.find('.report-empty').exists()).toBe(false)
  expect(wrapper.find('.resource-summary').exists()).toBe(false)
  expect(wrapper.find('.calendar').exists()).toBe(false)
  await wrapper.setProps({ error: '', truncated: true })
  expect(wrapper.text()).toContain('库存与净变化可能不完整')
  expect(wrapper.find('.report-empty').exists()).toBe(false)
  expect(wrapper.get('.summary-meta').text()).toContain('已加载记录中暂无基准')
  await wrapper.setProps({ truncated: false, records: [datedSnapshot('zero', '2026-09-29', [], 'full')] })
  expect(wrapper.get('.summary-values strong').text()).toBe('0')
  expect(wrapper.find('.report-empty').exists()).toBe(false)
  await calendarDay(wrapper, '2026-09-29').trigger('click')
  await wrapper.setProps({ error: '再次读取失败' })
  await wrapper.setProps({ error: '' })
  expect(wrapper.find('.day-detail').exists()).toBe(false)
})

it('部分资源缺测不遮掉已知资源，切换缺测口径的空态后可切回', async () => {
  const wrapper = mount(ResourceBalanceReport, { props: { ...period, records: [
    datedSnapshot('coin-only', '2026-09-29', [{ id: 'baijinbi', count: 100 }]),
  ] } })
  expect(wrapper.find('.report-empty').exists()).toBe(false)
  expect(wrapper.find('.calendar').exists()).toBe(true)
  await button(wrapper, '含茱萸等价值').trigger('click')
  expect(wrapper.get('.summary-values strong').text()).toBe('—')
  expect(wrapper.text()).toContain('缺测不按零处理')
  expect(wrapper.find('.report-empty').exists()).toBe(true)
  await button(wrapper, '实际白金币').trigger('click')
  expect(wrapper.get('.summary-values strong').text()).toBe('100')
  expect(wrapper.find('.report-empty').exists()).toBe(false)
})

it('手机也保留日期与来源，选中详情在换数据后清除', async () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  const wrapper = mount(ResourceBalanceReport, { props: { ...period, records: [
    datedSnapshot('first', '2026-09-29', [{ id: 'baijinbi', count: 0 }]),
  ] } })
  expect(wrapper.get('.summary-meta time').attributes('datetime')).toBe('2026-09-29')
  expect(wrapper.get('.summary-meta').text()).toContain('实际盘点')
  await calendarDay(wrapper, '2026-09-30').trigger('click')
  expect(wrapper.find('.day-detail').exists()).toBe(true)
  await wrapper.setProps({ records: [datedSnapshot('next-account', '2026-10-01', [], 'full')] })
  expect(wrapper.find('.day-detail').exists()).toBe(false)
  expect(wrapper.get('.summary-values strong').text()).toBe('0')
})
