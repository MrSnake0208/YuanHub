import { expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PlannerDailySources from '../src/components/operator/PlannerDailySources.vue'
import { emptyStaminaSources } from '../src/data/dailyStaminaSources.js'
import { installViewport } from '../test-support/viewport.js'

const setup = props => mount(PlannerDailySources, { props: { accountId: 'a', revision: 1, today: '2026-10-17', selectedDate: '2026-10-18', sources: emptyStaminaSources(), ...props } })
const button = (wrapper, text) => wrapper.findAll('button').find(button => button.text() === text)

it.each([390, 1440])('月卡设置保存60+20，自定义与单独商店，预览不写入；布局切换保留草稿 %ipx', async width => {
  const viewport = installViewport(width), wrapper = setup()
  await wrapper.get('[aria-label="月卡权益档位"]').setValue('zhaoyang')
  expect(wrapper.get('[aria-label="月卡每日奖励体力"]').element.value).toBe('60')
  expect(wrapper.get('[aria-label="月卡商店免费体力"]').element.value).toBe('20')
  await wrapper.get('input[type="checkbox"]').setValue(false)
  await wrapper.get('[aria-label="月卡商店免费体力"]').setValue('19')
  viewport.resize(width === 390 ? 1440 : 390); await flushPromises()
  expect(wrapper.get('[aria-label="月卡商店免费体力"]').element.value).toBe('19')
  expect(button(wrapper, '预览影响范围').element.closest('fieldset').disabled).toBe(true)
  await button(wrapper, '保存子账号配置').trigger('click')
  const [sources, revision, done] = wrapper.emitted('save')[0]
  expect(sources.monthlyCard).toMatchObject({ tier: 'zhaoyang', dailyEnabled: false, shopEnabled: true, dailyAmount: 60, shopAmount: 19 })
  expect(revision).toBe(1)
  await wrapper.setProps({ revision: 2, sources }); await done(true)
  await button(wrapper, '预览影响范围').trigger('click')
  expect(wrapper.emitted('preview')[0]).toEqual([{ fromDate: '2026-10-18', overwrite: false }])
  expect(wrapper.emitted('apply')).toBeUndefined()
  await wrapper.setProps({ preview: { fromDate: '2026-10-18', throughDate: '2027-01-14', affectedDates: 3, preservedManualDates: 1 } })
  expect(wrapper.text()).toContain('影响 3 个日期，保留 1 个手工日期')
  await button(wrapper, '应用到未来日程').trigger('click')
  expect(wrapper.emitted('apply')).toHaveLength(1)
})

it('固定模板从已有来源创建，能关闭并编辑数量；同ID不会重复出现', async () => {
  const wrapper = setup({ gains: [{ id: 'event', label: '活动奖励', value: 37 }] })
  await wrapper.get('[aria-label="从已有体力来源创建固定模板"]').setValue('event')
  await button(wrapper, '设为每日固定').trigger('click')
  expect(wrapper.findAll('.fixed-source-row')).toHaveLength(1)
  expect(wrapper.get('[aria-label="固定来源每日体力1"]').element.value).toBe('37')
  expect(wrapper.find('[aria-label="从已有体力来源创建固定模板"] option[value="event"]').exists()).toBe(false)
  await wrapper.get('[aria-label="启用固定来源活动奖励"]').setValue(false)
  await wrapper.get('[aria-label="固定来源每日体力1"]').setValue('12')
  await button(wrapper, '保存子账号配置').trigger('click')
  expect(wrapper.emitted('save')[0][0].fixedSources).toEqual([{ id: 'event', label: '活动奖励', value: 12, enabled: false }])
})

it('云端更新不覆盖当前草稿，阻止陈旧提交；切换账号清空草稿与预览', async () => {
  const wrapper = setup()
  await wrapper.get('[aria-label="月卡权益档位"]').setValue('xingguang')
  await wrapper.setProps({ revision: 2, sources: emptyStaminaSources() })
  expect(wrapper.get('[aria-label="月卡权益档位"]').element.value).toBe('xingguang')
  expect(wrapper.get('[role="alert"]').text()).toContain('云端配置已更新')
  expect(button(wrapper, '保存子账号配置').element.disabled).toBe(true)
  await wrapper.setProps({ accountId: 'b', revision: 0, sources: undefined })
  expect(wrapper.get('[aria-label="月卡权益档位"]').element.value).toBe('none')
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  expect(wrapper.emitted('save')).toBeUndefined()
})
