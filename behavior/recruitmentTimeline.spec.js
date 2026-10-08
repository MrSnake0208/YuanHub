import { expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import RecruitmentTimeline from '../src/pages/recruitment/RecruitmentTimeline.vue'

vi.mock('../src/utils/businessDay.js', () => ({ dateInZone: () => '2026-10-01' }))

const pool = (id, start, end, extra = {}) => ({ pool_id: id, snapshot: { catalog_pool_id: id, name: id, start_date: start, end_date: end, enabled: true, ...extra }, progress: null })
const render = props => mount(RecruitmentTimeline, { props })
const names = wrapper => wrapper.findAll('.pool-name').map(item => item.text())
const button = (wrapper, text) => wrapper.findAll('button').find(item => item.text() === text)
const card = (wrapper, name) => wrapper.findAll('.pool-card').find(item => item.get('.pool-name').text() === name)
const tone = (wrapper, name) => card(wrapper, name).get('.pool-cover').classes().find(item => item.startsWith('cover-tone-'))

it.each([
  ['限定', 'limited'], ['重逢限定', 'limited'], ['傅融地宫', 'limited'], [' 傅融地宫 ', 'limited'],
  ['复刻', 'rerun'], ['复刻限定', 'rerun'], ['照影', 'zhaoying'], ['照影复刻限定', 'zhaoying'],
  ['自选', 'choice'], ['自选限定', 'choice'], ['自选照影复刻限定', 'choice'],
  ['常驻', 'neutral'], ['示例', 'neutral'], ['未知地宫', 'neutral'], ['未知类型', 'neutral'],
  ['', 'neutral'], ['   ', 'neutral'], [null, 'neutral'], [undefined, 'neutral']
])('两游戏的类型 %s 都使用 %s 主题，保留类型文字', async (poolType, expected) => {
  const wrapper = render({ pools: [pool('p', null, null, { game: '代号鸢', pool_type: poolType })] })
  expect(tone(wrapper, 'p')).toBe('cover-tone-' + expected)
  expect(wrapper.get('.cover-caption').text()).toBe((poolType || '招募档案').trim())
  await wrapper.setProps({ contextVersion: 2, pools: [pool('p', null, null, { game: '如鸢', pool_type: poolType })] })
  expect(tone(wrapper, 'p')).toBe('cover-tone-' + expected)
})

it('封面按目录类型稳定配色；排序、年份、刷新、账号和状态改变不换色，类型修改才换色', async () => {
  const slots = [{ id: 'up', operator_id: 'char_001_yangxiu', name: '杨修' }]
  const pools = [pool('金池', '2026-09-01', '2026-10-31', { pool_type: '限定', up_agents: slots }),
    pool('蓝池', '2026-03-01', '2026-03-31', { pool_type: '复刻' }),
    pool('旧紫池', '2025-01-01', '2025-01-31', { pool_type: '照影' })]
  const original = structuredClone(pools)
  const wrapper = render({ pools, contextVersion: 1, poolSummaries: { 金池: { up_agent_counts: { up: 2 } } } })
  const expectTones = () => {
    expect(tone(wrapper, '金池')).toBe('cover-tone-limited')
    expect(tone(wrapper, '蓝池')).toBe('cover-tone-rerun')
  }
  expectTones()
  await button(wrapper, '按时间从新到旧').trigger('click')
  expectTones()
  expect(tone(wrapper, '旧紫池')).toBe('cover-tone-zhaoying')
  await button(wrapper, '2026').trigger('click')
  expectTones()
  await wrapper.setProps({ pools: structuredClone(pools).reverse(), catalog: pools.map(item => ({ ...item.snapshot, pool_id: item.pool_id })) })
  expectTones()
  const gold = card(wrapper, '金池')
  expect(gold.get('.pool-status').text()).toBe('进行中')
  expect(gold.get('.up-count').text()).toBe('×2')
  expect(gold.get('.cover-portrait').attributes('src')).toContain('char_001_yangxiu.webp')
  expect(gold.findAll('.operator-avatar')).toHaveLength(1)
  await gold.trigger('click')
  expect(wrapper.emitted('select')).toEqual([['金池']])
  await wrapper.setProps({ catalog: [{ ...pools[0].snapshot, pool_id: '金池', end_date: '2026-09-30' }] })
  expectTones()
  expect(card(wrapper, '金池').get('.pool-status').text()).toBe('已结束')
  expect(card(wrapper, '金池').get('.up-count').text()).toBe('×2')
  await wrapper.setProps({ catalog: [], contextVersion: 2, pools: pools.map(item => ({ ...item, snapshot: { ...item.snapshot, game: '如鸢', enabled: false } })) })
  expectTones()
  expect(card(wrapper, '金池').get('.pool-status').text()).toBe('已停用')
  expect(card(wrapper, '金池').get('.up-count').text()).toBe('×2')
  await wrapper.setProps({ catalog: [{ pool_id: '金池', name: '金池', pool_type: '自选限定', enabled: true, up_agents: slots }] })
  expect(tone(wrapper, '金池')).toBe('cover-tone-choice')
  await wrapper.setProps({ catalog: [{ pool_id: '金池', name: '金池', pool_type: null }] })
  expect(tone(wrapper, '金池')).toBe('cover-tone-neutral')
  await wrapper.setProps({ catalog: [], pools: [{ pool_id: '金池', mapped_snapshot: { name: '金池', pool_type: '复刻' }, snapshot: { name: '金池', pool_type: '限定' } }] })
  expect(tone(wrapper, '金池')).toBe('cover-tone-rerun')
  expect(pools).toEqual(original)
})

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
  expect(find('当日池').get('.entry-label').text()).toBe('记一笔')
  expect(find('停用池').get('.entry-label').text()).toBe('查看记录')
  expect(find('当日池').get('.pool-status').text()).toBe('进行中'); expect(wrapper.text()).not.toContain('当前卡池')
  expect(find('当日池').findAll('.pool-metrics b').map(item => item.text())).toEqual(['1,234', '9', '40'])
  expect(find('当日池').text()).toContain('部分出货间隔或进度未知')
  expect(find('已结束池').get('.pool-status').text()).toBe('已结束'); expect(find('未开始池').get('.pool-status').text()).toBe('未开始')
  expect(find('停用池').get('.pool-status').text()).toBe('已停用'); expect(find('停用池').attributes('disabled')).toBeUndefined()
  expect(find('不完整日期').get('.pool-status').text()).toBe('已启用')
  expect(find('不完整日期').findAll('.pool-metrics b').map(item => item.text())).toEqual(['未知', '未知', '未知'])
  expect(wrapper.text()).not.toContain('收集进度')
})

it.each([
  { currentPoolId: '旧池' }, { currentPoolId: '不存在的池' },
  { current_pool_id: '旧池' }, { current_pool_id: '不存在的池' }
])('旧指针 %j 不产生徽标、高亮或排序优先级，历史池仍可选择', async legacyPointer => {
  const pools = [pool('旧池', '2025-01-01', '2025-12-31'), pool('开放池', '2026-09-01', '2026-10-31')]
  const original = structuredClone(pools), wrapper = render({ pools, ...legacyPointer })
  expect(names(wrapper)).toEqual(['开放池', '旧池'])
  expect(wrapper.text()).not.toContain('当前卡池')
  expect(wrapper.find('.current-badge, .is-current').exists()).toBe(false)
  expect(wrapper.findAll('.pool-card').map(card => card.get('.pool-status').text())).toEqual(['进行中', '已结束'])
  const endedCard = wrapper.findAll('.pool-card')[1]
  expect(endedCard.attributes('aria-label')).toContain('旧池')
  await endedCard.trigger('click')
  expect(wrapper.emitted('select')).toEqual([['旧池']])
  expect(pools).toEqual(original)
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


it('每个有效UP显示槽位次数含零，三UP不截断；缺字段、缺键或无效值保持未知', async () => {
  const slots = [
    { id: 'slot-a', operator_id: 'char-a', name: 'A' },
    { id: 'slot-b', operator_id: 'char-b', name: 'B' },
    { id: 'slot-c', name: '占位C' },
    { id: 'retired', name: '退役', active: false }
  ]
  const wrapper = render({ pools: [pool('p', null, null, { up_agents: slots })], poolSummaries: { p: { up_agent_counts: { 'slot-a': 2, 'slot-b': 1, 'slot-c': 0, retired: 9, off: 8 } } } })
  const counts = () => wrapper.findAll('.up-count').map(item => item.text())
  expect(counts()).toEqual(['×2', '×1', '×0'])
  expect(wrapper.get('.pool-card').attributes('aria-label')).toContain('本池 UP 获得次数：A，获得 2 次；B，获得 1 次；占位C，获得 0 次')
  expect(wrapper.findAll('.up-count').map(item => item.classes('is-muted'))).toEqual([false, false, true])
  expect(wrapper.get('.cover-agents').text()).not.toContain('退役')
  expect(wrapper.findAll('.up-result')).toHaveLength(3)
  await wrapper.setProps({ poolSummaries: { p: { up_agent_counts: { 'slot-a': 0, 'slot-b': -1, 'slot-c': '2' } } } })
  expect(counts()).toEqual(['×0', '—', '—'])
  expect(wrapper.findAll('.up-count').every(item => item.classes('is-muted'))).toBe(true)
  await wrapper.setProps({ poolSummaries: { p: { up_agent_counts: {} } } })
  expect(counts()).toEqual(['—', '—', '—'])
  await wrapper.setProps({ poolSummaries: { p: { event_count: 0 } } })
  expect(counts()).toEqual(['—', '—', '—'])
  expect(wrapper.get('.pool-card').attributes('aria-label')).toContain('A，统计未知')
  await wrapper.setProps({ poolSummaries: {}, catalog: [], agents: [], pools: [{ pool_id: 'missing' }] })
  expect(wrapper.find('.up-result').exists()).toBe(false)
})

it('目录按当前有效槽位解释摘要；绑定和图鉴缺失不丢固定槽位的出货次数', async () => {
  const wrapper = render({ pools: [pool('p', null, null, { up_agents: [{ id: 'old', name: '旧UP' }] })], catalog: [{ pool_id: 'p', name: '当前池', up_agents: [{ id: 'bound', operator_id: 'formal', name: '绑定名称' }, { id: 'new', name: '新UP' }] }], poolSummaries: { p: { up_agent_counts: { old: 9, bound: 3 } } } })
  expect(wrapper.findAll('.up-count').map(item => item.text())).toEqual(['×3', '—'])
  expect(wrapper.get('.pool-card').attributes('aria-label')).toContain('绑定名称，获得 3 次')
  await wrapper.setProps({ agents: [{ id: 'formal', name: '图鉴名称', avatar: '/formal.png' }] })
  expect(wrapper.get('.pool-card').attributes('aria-label')).toContain('图鉴名称，获得 3 次')
  expect(wrapper.get('.cover-agents img').attributes('src')).toContain('/formal.png')
})
