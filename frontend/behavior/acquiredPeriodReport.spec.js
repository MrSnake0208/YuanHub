import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AcquiredPeriodReport from '../src/components/inventory/AcquiredPeriodReport.vue'
import { buildRewardInsights } from '../src/data/inventory/acquiredStats.js'

it('展示其他来源分项，月卡及非派遣茱萸不混入洛阳每小时收益', () => {
  const reward = (channel, entries) => ({ record_type: 'reward_delta', acquisition_channel: channel, effective_at: '2026-09-30T12:00:00+08:00', entries })
  const insights = buildRewardInsights({ itemRecords: [
    reward('派遣-洛阳', [{ id: 'baijinbi', count: 20 }, { id: 'zhuyu', count: 1 }]),
    reward('月卡奖励', [{ id: 'baijinbi', count: 60 }, { id: 'zhuyu', count: 2 }]),
  ] })
  const wrapper = mount(AcquiredPeriodReport, { props: { insights, dispatchDuration: { totalHours: 2, luoyangHours: 2, shouchunHours: 0 } } })
  expect(wrapper.get('.coin-formula').text()).toContain('洛阳派遣 20 + 其他／未分类 60')
  expect(wrapper.get('.coin-metric > strong').text()).toBe('230')
  expect(wrapper.get('.coin-metric .coin-average b').text()).toBe('35')
})
