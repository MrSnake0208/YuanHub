import { expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import RecruitmentTimeline from '../src/pages/recruitment/RecruitmentTimeline.vue'

vi.mock('../src/utils/businessDay.js', () => ({ dateInZone: () => '2026-10-01' }))

const pool = (id, start, end, extra = {}) => ({ pool_id: id, snapshot: { catalog_pool_id: id, name: id, start_date: start, end_date: end, enabled: true, ...extra }, progress: null })
const render = props => mount(RecruitmentTimeline, { props })
const names = wrapper => wrapper.findAll('.pool-name').map(item => item.text())
const button = (wrapper, text) => wrapper.findAll('button').find(item => item.text() === text)

it('新池在上、未知日期置后；年份与正反排序不修改原数据，整卡可选择', async () => {
  const pools = [pool('未注明日期'), pool('2025旧池', '2025-12-01'), pool('2026秋池', '2026-09-01'), pool('2026春池', '2026-03-01')]
  const original = structuredClone(pools), wrapper = render({ pools })
  expect(names(wrapper)).toEqual(['2026秋池', '2026春池', '2025旧池', '未注明日期'])
  await button(wrapper, '2026').trigger('click')
  expect(names(wrapper)).toEqual(['2026秋池', '2026春池']); expect(button(wrapper, '2026').attributes('aria-pressed')).toBe('true')
  await button(wrapper, '按时间从新到旧').trigger('click'); expect(names(wrapper)).toEqual(['2026春池', '2026秋池'])
  await button(wrapper, '全部').trigger('click'); expect(names(wrapper)).toEqual(['2025旧池', '2026春池', '2026秋池', '未注明日期'])
  await wrapper.get('.pool-card').trigger('click'); expect(wrapper.emitted('select')).toEqual([['2025旧池']])
  await button(wrapper, '日期未知').trigger('click'); expect(names(wrapper)).toEqual(['未注明日期'])
  expect(pools).toEqual(original)
})

it('只展示真实统计、抽卡进度和目录状态，不猜日期或收集率；停用卡可查看', async () => {
  const pools = [pool('当日池', '2026-10-01', '2026-10-01'), pool('已结束池', '2026-01-01', '2026-09-30'), pool('未开始池', '2026-10-02', '2026-11-01'), pool('停用池', '2026-09-01', '2026-10-30', { enabled: false }), pool('不完整日期', '2026-01-01')]
  pools[0].progress = 0
  const wrapper = render({ pools, currentPoolId: '当日池', poolSummaries: { '当日池': { known_total_pulls: 1234, event_count: 9, has_unknown: true } } })
  const cards = wrapper.findAll('.pool-card'), find = name => cards.find(card => card.get('.pool-name').text() === name)
  expect(find('当日池').get('.pool-status').text()).toBe('进行中'); expect(find('当日池').text()).toContain('当前卡池')
  expect(find('当日池').findAll('.pool-metrics b').map(item => item.text())).toEqual(['1,234', '9', '40'])
  expect(find('当日池').text()).toContain('部分出货间隔或进度未知')
  expect(find('已结束池').get('.pool-status').text()).toBe('已结束'); expect(find('未开始池').get('.pool-status').text()).toBe('未开始')
  expect(find('停用池').get('.pool-status').text()).toBe('已停用'); expect(find('停用池').attributes('disabled')).toBeUndefined()
  expect(find('不完整日期').get('.pool-status').text()).toBe('已启用')
  expect(find('不完整日期').findAll('.pool-metrics b').map(item => item.text())).toEqual(['未知', '未知', '未知'])
  expect(wrapper.text()).not.toContain('收集进度')
})

it('目录优先更新日期名字及头像，退役UP不展示；账号上下文改变重置年份排序', async () => {
  const wrapper = render({ pools: [pool('pool-a', '2025-01-01')], contextVersion: 1, agents: [{ id: 'formal', name: '正式密探', avatar: '/formal.png' }], catalog: [{ pool_id: 'pool-a', name: '目录新池', start_date: '2026-08-01', up_agents: [{ id: 'slot', operator_id: 'formal', active: true }, { id: 'retired', name: '退役', active: false }] }] })
  expect(names(wrapper)).toEqual(['目录新池']); expect(wrapper.get('.pool-dates').text()).toContain('2026-08-01')
  expect(wrapper.get('.cover-agents img').attributes('src')).toContain('/formal.png'); expect(wrapper.findAll('.cover-agents .operator-avatar')).toHaveLength(1)
  await button(wrapper, '2026').trigger('click'); await button(wrapper, '按时间从新到旧').trigger('click')
  await wrapper.setProps({ contextVersion: 2, catalog: [], pools: [pool('另一账号池', '2025-01-01')] })
  expect(names(wrapper)).toEqual(['另一账号池']); expect(button(wrapper, '全部').attributes('aria-pressed')).toBe('true'); expect(button(wrapper, '按时间从新到旧')).toBeDefined()
})

it('空目录仍提示维护历史，忙碌时禁止切换卡池', async () => {
  const wrapper = render({ pools: [] })
  expect(wrapper.text()).toContain('当前游戏暂无公共卡池')
  await wrapper.setProps({ pools: [pool('pool-a')], busy: true })
  expect(wrapper.get('.pool-card').attributes('disabled')).toBeDefined()
  await wrapper.get('.pool-card').trigger('click'); expect(wrapper.emitted('select')).toBeUndefined()
})

it('复用本地真实立绘，加载失败回退纸色封面', async () => {
  const wrapper = render({ pools: [pool('pool-a', null, null, { up_agents: [{ id: 'slot', operator_id: 'char_001_yangxiu', active: true, name: '杨修' }] })] })
  expect(wrapper.get('.cover-portrait').attributes('src')).toBe('/assets/operator-portraits/char_001_yangxiu.webp')
  await wrapper.get('.cover-portrait').trigger('error')
  expect(wrapper.find('.cover-portrait').exists()).toBe(false); expect(wrapper.get('.pool-cover').text()).toContain('pool-a')
})

it('目录刷新移除已筛选年份时恢复全部，避免有卡池却困在空筛选', async () => {
  const wrapper = render({ pools: [pool('pool-a', '2026-01-01')] })
  await button(wrapper, '2026').trigger('click')
  await wrapper.setProps({ pools: [pool('pool-a')] })
  expect(names(wrapper)).toEqual(['pool-a'])
})
