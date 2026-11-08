import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import PlannerOverallSummary from '../src/components/operator/PlannerOverallSummary.vue'
import { createSpend } from '../src/data/cultivationPlanner.js'
import { visibleFixedScheduleTimeline } from '../src/data/fixedPlannerSchedule.js'

const day = (date, spends) => ({ date, planned: { spends }, errors: [] })
const training = (level, value, channel = 'yinyang') => createSpend(channel, { stageLevel: level, value })

it('跨日期合并同类同层，按层排序，排除非历练和零次数，保留不同历练类型', () => {
  const timeline = [day('2026-11-01', [training(6, 3), training(4, 4), createSpend('luoyang', { value: 9 }), createSpend('stage624', { value: 20 })]),
    day('2026-11-02', [training(6, 7), training(8, 0), training(6, 2, 'dishui'), training(8, 36, 'experience'), createSpend('custom', { name: '阴阳历练', value: 99 })])]
  const before = structuredClone(timeline)
  const wrapper = mount(PlannerOverallSummary, { props: { today: '2026-11-02', timeline, status: 'complete' } })
  const yy = wrapper.get('.yy')
  expect(yy.findAll('tbody tr').map(row => row.text())).toEqual(['4 层4 次', '6 层10 次'])
  expect(yy.get('caption').text()).toBe('阴阳历练共 14 次')
  expect(wrapper.get('.ds').get('caption').text()).toBe('地水历练共 2 次')
  expect(wrapper.get('.experience').text()).toContain('绝境历练')
  expect(wrapper.get('.experience').get('td').text()).toBe('36 次')
  expect(wrapper.text()).not.toContain('99')
  expect(wrapper.find('.overall-warning').exists()).toBe(false)
  expect(timeline).toEqual(before)
})

it('沿用当前周期历史与未来安排，更新方案后替换合计，不累计旧方案', async () => {
  const schedule = { context: { displayStartDate: '2026-11-01' }, history: [
    day('2026-10-31', [training(4, 99)]), day('2026-11-01', [training(4, 2)])
  ], result: { timeline: [day('2026-11-02', [training(4, 3)])] } }
  const wrapper = mount(PlannerOverallSummary, { props: { today: '2026-11-02', timeline: visibleFixedScheduleTimeline(schedule), status: 'complete' } })
  expect(wrapper.get('.yy td').text()).toBe('5 次')
  expect(wrapper.get('.overall-period').text()).toBe('2026-11-01 至 2026-11-02')
  await wrapper.setProps({ timeline: [day('2026-11-03', [training(12, 1)])] })
  expect(wrapper.get('.yy tbody').text()).toBe('12 层1 次')
})

it('无效、待重算与未覆盖缺口的日程明确标注不完整', async () => {
  const wrapper = mount(PlannerOverallSummary, { props: { today: '2026-11-02', timeline: [day('2026-11-01', [training(4, 4)])], status: 'horizon' } })
  expect(wrapper.get('.overall-warning').text()).toContain('尚未覆盖全部培养缺口')
  await wrapper.setProps({ status: 'complete', awaitingRecalculation: true })
  expect(wrapper.get('.overall-warning').text()).toContain('待重算')
  await wrapper.setProps({ status: 'invalid' })
  expect(wrapper.get('.overall-warning').text()).toBe('日程有问题，这里只统计已排出的部分，请先处理顶部提示。')
})

it('加载和读取失败不冒充零安排，空方案清楚提示', async () => {
  const wrapper = mount(PlannerOverallSummary, { props: { today: '2026-11-02', loading: true } })
  expect(wrapper.text()).toContain('正在读取规划')
  expect(wrapper.text()).not.toContain('暂无历练安排')
  await wrapper.setProps({ loading: false, unavailable: true })
  expect(wrapper.text()).toContain('规划数据尚未准备好')
  expect(wrapper.text()).not.toContain('暂无历练安排')
  await wrapper.setProps({ unavailable: false, status: 'complete' })
  expect(wrapper.text()).toContain('当前方案暂无历练安排')
})


it('今天起剩余包含今天和未来，随业务日期推进更新，切回全部不改变原计划', async () => {
  const timeline = [day('2026-11-01', [training(4, 2)]), day('2026-11-02', [training(4, 3)]), day('2026-11-03', [training(4, 5)])]
  const before = structuredClone(timeline)
  const wrapper = mount(PlannerOverallSummary, { props: { today: '2026-11-02', timeline, status: 'complete' } })
  const buttons = wrapper.findAll('.overall-range button')
  expect(buttons[0].attributes('aria-pressed')).toBe('true')
  expect(wrapper.get('.yy td').text()).toBe('10 次')
  await buttons[1].trigger('click')
  expect(buttons[1].attributes('aria-pressed')).toBe('true')
  expect(wrapper.get('.yy td').text()).toBe('8 次')
  expect(wrapper.get('.overall-period').text()).toBe('2026-11-02 至 2026-11-03')
  expect(wrapper.text()).toContain('未扣除今天实际刷取')
  await wrapper.setProps({ today: '2026-11-03' })
  expect(wrapper.get('.yy td').text()).toBe('5 次')
  await wrapper.setProps({ today: '2026-11-04' })
  expect(wrapper.find('table').exists()).toBe(false)
  expect(wrapper.find('.overall-period').exists()).toBe(false)
  expect(wrapper.text()).toContain('原计划从今天起暂无历练安排')
  await buttons[0].trigger('click')
  expect(wrapper.get('.yy td').text()).toBe('10 次')
  expect(timeline).toEqual(before)
})
