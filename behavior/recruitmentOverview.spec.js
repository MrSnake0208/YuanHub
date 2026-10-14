import { beforeEach, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { useRecruitmentPreviews } from '../src/pages/recruitment/useRecruitmentPreviews.js'
import RecruitmentRecordsPreview from '../src/pages/recruitment/RecruitmentRecordsPreview.vue'
import RecruitmentTimeline from '../src/pages/recruitment/RecruitmentTimeline.vue'
import { listRecruitmentEvents } from '../src/api/recruitment.js'
import { deferred } from '../test-support/recruitment.js'

vi.mock('../src/api/recruitment.js', () => ({ listRecruitmentEvents: vi.fn() }))
beforeEach(() => vi.clearAllMocks())
const event = (id, span = 20, rarity = 5, poolId = 'a') => ({ event_id: id, pool_id: poolId, agent_snapshot: { agent_id: id, name: id, rarity }, pull_span: span, up_status: 'unknown' })
const pool = (id, year = '2026') => ({ pool_id: id, snapshot: { catalog_pool_id: id, name: id, start_date: `${year}-01-01` } })
const page = (items, next = null, revision = 1) => ({ items, next_cursor: next, archive_revision: revision })
const entry = items => ({ items, loaded: true, loading: false, cursor: null, error: '' })
const button = (wrapper, name) => wrapper.findAll('button').find(item => item.text() === name)

function model() {
  const state = reactive({ contextVersion: 1, requestVersion: 0, archive: { archive_revision: 1, pools: [pool('a'), pool('b'), pool('c')] }, loading: false, busy: false })
  const account = ref('A'), available = ref(true), scope = effectScope()
  const previews = scope.run(() => useRecruitmentPreviews({ state, available, capture: () => ({ accountId: account.value }), matches: token => available.value && token.accountId === account.value }))
  return { ...previews, state, account, available, stop: () => scope.stop() }
}

it('两池并发且第三池排队，首批去重且分页独立，不自动读完历史', async () => {
  const reads = [deferred(), deferred(), deferred(), deferred()]
  reads.forEach(read => listRecruitmentEvents.mockImplementationOnce(() => read.promise))
  const m = model()
  m.load('a'); m.load('a'); m.load('b'); m.load('c')
  expect(listRecruitmentEvents).toHaveBeenCalledTimes(2)
  reads[0].resolve(page([event('a1')], 'next-a')); await flushPromises()
  expect(listRecruitmentEvents).toHaveBeenCalledTimes(3)
  reads[1].resolve(page([event('b1', 5, 5, 'b')])); reads[2].resolve(page([])); await flushPromises()
  expect(m.previews.pools.a.cursor).toBe('next-a')
  expect(m.previews.pools.b.items[0].event_id).toBe('b1')
  m.load('a', true); reads[3].resolve(page([event('a2')])); await flushPromises()
  expect(m.previews.pools.a.items.map(item => item.event_id)).toEqual(['a1', 'a2'])
  expect(listRecruitmentEvents.mock.calls[3][0]).toMatchObject({ cursor: 'next-a', poolId: 'a', accountId: 'A', order: 'asc', limit: 100 })
  m.stop()
})

it.each(['account', 'revision', 'request', 'logout', 'unmount'])('%s 变化丢弃迟到响应和旧预览', async change => {
  const late = deferred(); listRecruitmentEvents.mockReturnValue(late.promise)
  const m = model(); m.load('a')
  if (change === 'account') { m.account.value = 'B'; m.state.contextVersion++ }
  if (change === 'revision') m.state.archive.archive_revision++
  if (change === 'request') m.state.requestVersion++
  if (change === 'logout') { m.available.value = false; m.state.contextVersion++ }
  if (change === 'unmount') m.stop()
  late.resolve(page([event('private-A')])); await flushPromises()
  expect(m.previews.pools).toEqual({})
  m.stop()
})

it('分页失败保留已读记录，显式重试首批；读取失败不是空池', async () => {
  listRecruitmentEvents.mockResolvedValueOnce(page([event('first')], 'next')).mockRejectedValueOnce(new Error('离线')).mockResolvedValueOnce(page([event('fresh')]))
  const m = model(); m.load('a'); await flushPromises(); m.load('a', true); await flushPromises()
  expect(m.previews.pools.a.error).toBe('离线')
  expect(m.previews.pools.a.items[0].event_id).toBe('first')
  m.load('a'); await flushPromises()
  expect(m.previews.pools.a.items[0].event_id).toBe('fresh')
  expect(m.previews.pools.a.error).toBe('')
  m.stop()
})

it('新账号同名卡池完成读取后，旧账号的失败不能覆盖新结果', async () => {
  const old = deferred()
  listRecruitmentEvents.mockReturnValueOnce(old.promise).mockResolvedValueOnce(page([event('B-only')]))
  const m = model(); m.load('a'); m.account.value = 'B'; m.state.contextVersion++; m.load('a')
  await flushPromises(); old.reject(new Error('A failure')); await flushPromises()
  expect(m.previews.pools.a.items[0].event_id).toBe('B-only')
  expect(m.previews.pools.a.error).toBe('')
  m.stop()
})

it.each([
  ['串池', page([event('wrong', 20, 5, 'b')])],
  ['删除', page([{ ...event('deleted'), deleted_at: 'y' }])],
  ['重复ID', page([event('same'), event('same')])],
  ['版本不符', page([event('old')], null, 2)],
  ['空页带游标', page([], 'next')],
])('拒绝%s，不冒充完整数据', async (_, response) => {
  listRecruitmentEvents.mockResolvedValue(response)
  const m = model(); m.load('a'); await flushPromises()
  expect(m.previews.pools.a.error).not.toBe('')
  expect(m.previews.pools.a.loaded).toBe(false)
  m.stop()
})

it('拒绝跨页重复ID、游标循环和不完整总量', async () => {
  for (const response of [page([event('one')]), page([event('two')], 'next')]) {
    listRecruitmentEvents.mockResolvedValueOnce(page([event('one')], 'next')).mockResolvedValueOnce(response)
    const m = model(); m.load('a'); await flushPromises(); m.load('a', true); await flushPromises()
    expect(m.previews.pools.a.error).not.toBe(''); expect(m.previews.pools.a.items).toHaveLength(1); m.stop()
  }
  listRecruitmentEvents.mockResolvedValueOnce(page([event('one')]))
  const m = model(); m.state.archive.pool_summaries = { a: { event_count: 2 } }; m.load('a'); await flushPromises()
  expect(m.previews.pools.a.error).toContain('数量不一致'); m.stop()
})

it('不可用账号、非本账号池、忙碌时不读取，切账号后排队任务不发送', async () => {
  const late = deferred(); listRecruitmentEvents.mockReturnValue(late.promise)
  const m = model(); m.available.value = false; m.load('a'); m.available.value = true; m.load('missing')
  m.state.busy = true; m.load('a'); m.state.busy = false
  expect(listRecruitmentEvents).not.toHaveBeenCalled()
  m.load('a'); m.load('b'); m.load('c'); m.account.value = 'B'; m.state.contextVersion++
  late.resolve(page([])); await flushPromises()
  expect(listRecruitmentEvents).toHaveBeenCalledTimes(2); m.stop()
})

it('只读两视图保持新到旧、5星序号、4星计次、批次、非UP及未知标记', async () => {
  const items = [event('first', 39), event('four', null, 4), { ...event('latest', null), up_status: 'non_up', batch_id: 'batch' }]
  const original = structuredClone(items)
  const wrapper = mount(RecruitmentRecordsPreview, { props: { pool: pool('a'), entry: entry(items) } })
  expect(wrapper.findAll('.preview-record').map(item => item.attributes('data-event-id'))).toEqual(['latest', 'four', 'first'])
  expect(wrapper.findAll('.agent-order-badge').map(item => item.text())).toEqual(['2', '1'])
  expect(wrapper.text()).toContain('4星计次'); expect(wrapper.text()).toContain('未知'); expect(wrapper.text()).toContain('批次')
  expect(wrapper.findAll('button, input, select')).toHaveLength(0)
  expect(wrapper.get('.preview-record').attributes('aria-label')).toContain('非UP')
  await wrapper.setProps({ view: 'progress' })
  expect(wrapper.findAll('.record-bar').map(item => item.classes().find(cls => cls.startsWith('bar-')))).toEqual(['bar-unknown', 'bar-count', 'bar-high'])
  expect(wrapper.findAll('.record-bar')[2].attributes('style')).toContain('97.5%')
  expect(items).toEqual(original)
})

it('首批只在进入视口后请求，退出卸载观察器；失败与未读完可见', async () => {
  let callback; const disconnect = vi.fn()
  vi.stubGlobal('IntersectionObserver', class { constructor(cb) { callback = cb } observe() {} disconnect() { disconnect() } })
  const wrapper = mount(RecruitmentRecordsPreview, { props: { pool: pool('a') } })
  expect(wrapper.emitted('load')).toBeUndefined()
  callback([{ isIntersecting: true }]); await nextTick()
  expect(wrapper.emitted('load')).toEqual([[false]])
  await wrapper.setProps({ entry: { ...entry([event('one')]), cursor: 'next' } })
  expect(wrapper.text()).toContain('尚未读完')
  await button(wrapper, '加载更多记录').trigger('click')
  expect(wrapper.emitted('load')[1]).toEqual([true])
  await wrapper.setProps({ entry: { ...entry([]), error: '读取失败' } })
  expect(wrapper.text()).not.toContain('暂无已保存记录')
  await button(wrapper, '重新读取明细').trigger('click')
  expect(wrapper.emitted('load')[2]).toEqual([false])
  wrapper.unmount(); expect(disconnect).toHaveBeenCalledOnce()
})

it('默认展开有记录池，批量只影响筛选结果，独立编辑不折叠，切换视图不改顺序', async () => {
  const wrapper = mount(RecruitmentTimeline, { props: { pools: [pool('a'), pool('b', '2025'), pool('empty')], poolSummaries: { a: { event_count: 2, four_star_count: 1, known_total_pulls: 45 }, b: { event_count: 1 }, empty: { event_count: 0 } }, previews: { a: entry([event('a1', 38), event('four', null, 4)]), b: entry([event('b1', 20, 5, 'b')]) } } })
  expect(wrapper.findAll('.pool-preview')).toHaveLength(2)
  expect(wrapper.findAll('.preview-agents')).toHaveLength(2)
  expect(wrapper.get('.average-metric').text()).toContain('38')
  expect(wrapper.get('.small-pity-metric').text()).toContain('—')
  await wrapper.get('.entry-label').trigger('click')
  expect(wrapper.emitted('select')).toEqual([['a']]); expect(wrapper.findAll('.pool-preview')).toHaveLength(2)
  await button(wrapper, '2026').trigger('click'); await button(wrapper, '全部折叠').trigger('click')
  expect(wrapper.findAll('.pool-preview')).toHaveLength(0)
  await button(wrapper, '全部').trigger('click'); expect(wrapper.findAll('.pool-preview')).toHaveLength(1)
  await button(wrapper, '全部展开').trigger('click'); expect(wrapper.findAll('.pool-preview')).toHaveLength(2)
  await button(wrapper, '进度条视图').trigger('click'); expect(wrapper.findAll('.preview-progress')).toHaveLength(2)
  await wrapper.get('.pool-card').trigger('click'); expect(wrapper.get('.preview-toggle').attributes('aria-expanded')).toBe('false')
  await wrapper.get('.preview-toggle').trigger('click'); expect(wrapper.get('.preview-toggle').attributes('aria-expanded')).toBe('true')
  expect(wrapper.emitted('select')).toHaveLength(1)
  await wrapper.setProps({ contextVersion: 2, previews: {}, poolSummaries: { a: { event_count: 1 } } })
  expect(wrapper.get('.average-metric').text()).toContain('—')
  expect(wrapper.get('.preview-toggle').attributes('aria-expanded')).toBe('true')
})

it('空池不显示大空框，未完整读取、失败和没有有效间隔不显示虚假均值', async () => {
  const wrapper = mount(RecruitmentTimeline, { props: { pools: [pool('a')], poolSummaries: { a: { event_count: 0, known_total_pulls: 7 } } } })
  expect(wrapper.find('.pool-preview').exists()).toBe(false)
  expect(wrapper.get('.average-metric').text()).toContain('—')
  expect(wrapper.text()).not.toContain('暂无绝密出金样本')
  expect(wrapper.get('.pool-metrics b').text()).toBe('7')
  for (const preview of [{ ...entry([event('one', 20)]), cursor: 'next' }, { ...entry([event('one', 20)]), error: '失败' }, entry([event('one', null)])]) {
    await wrapper.setProps({ poolSummaries: { a: { event_count: 1 } }, previews: { a: preview } })
    expect(wrapper.get('.average-metric').text()).toContain('—')
  }
})

it('两页大量记录保留完整顺序与跨页金序号，视图切换不截断记录', async () => {
  const items = Array.from({ length: 120 }, (_, index) => event(String(index), index % 40 + 1))
  const wrapper = mount(RecruitmentRecordsPreview, { props: { pool: pool('a'), entry: entry(items) } })
  expect(wrapper.findAll('.preview-record')).toHaveLength(120)
  expect(wrapper.get('.agent-order-badge').text()).toBe('120')
  expect(wrapper.findAll('.agent-order-badge').at(-1).text()).toBe('1')
  await wrapper.setProps({ view: 'progress' })
  expect(wrapper.findAll('.preview-record')).toHaveLength(120)
  expect(wrapper.get('.preview-record').attributes('data-event-id')).toBe('119')
})

it('小保底率按首金假设计算，区分0%、无样本、分页未知和常驻不适用', async () => {
  const items = ['up', 'non_up', 'up', 'up'].map((status, index) => ({ ...event(String(index), null), up_status: status }))
  const wrapper = mount(RecruitmentTimeline, { props: { pools: [pool('a')], poolSummaries: { a: { event_count: 4 } }, previews: { a: entry(items) } } })
  expect(wrapper.get('.small-pity-metric b').text()).toBe('66.7%')
  expect(wrapper.get('.small-pity-metric').attributes('title')).toBeUndefined()
  expect(wrapper.text()).not.toContain('不含大保底')
  await wrapper.setProps({ previews: { a: { ...entry(items), cursor: 'next' } } })
  expect(wrapper.get('.small-pity-metric b').text()).toBe('—')
  await wrapper.setProps({ previews: { a: entry([{ ...event('lost', 1), up_status: 'non_up' }]) } })
  expect(wrapper.get('.small-pity-metric b').text()).toBe('0%')
  await wrapper.setProps({ previews: { a: entry([event('unknown')]) } })
  expect(wrapper.get('.small-pity-metric b').text()).toBe('—')
  expect(wrapper.text()).not.toContain('UP状态未知或出金顺序不符合保底规则')
  await wrapper.setProps({ pools: [{ ...pool('a'), snapshot: { ...pool('a').snapshot, pool_type: 'permanent' } }], previews: { a: entry(items) } })
  expect(wrapper.get('.small-pity-metric b').text()).toBe('—')
  expect(wrapper.text()).not.toContain('常驻池不统计小保底不歪率')
})
