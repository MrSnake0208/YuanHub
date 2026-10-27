import { expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import PlannerRepeatedSpend from '../src/components/operator/PlannerRepeatedSpend.vue'
const setup = props => mount(PlannerRepeatedSpend, { attachTo: document.body, props: { entry: { kind: 'stage624', value: 6 }, date: '2026-10-22', today: '2026-10-22', lastDate: '2027-01-19', accountId: 'a', planId: 'p', schedule: { baselineDate: '2026-10-22' }, ...props }, global: { stubs: { teleport: true } } })
const open = async wrapper => { await wrapper.get('.repeat-link').trigger('click'); await flushPromises() }
it('默认所选日期起7天和当前次数，仅确认后应用，等待云端结果', async () => {
  const wrapper = setup(); await open(wrapper)
  expect(wrapper.get('[aria-label="每日安排开始日期"]').element.value).toBe('2026-10-22')
  expect(wrapper.get('[aria-label="每日安排结束日期"]').element.value).toBe('2026-10-28')
  expect(wrapper.get('[aria-label="每日6-24次数"]').element.value).toBe('6')
  expect(wrapper.emitted('apply')).toBeUndefined()
  await wrapper.get('form').trigger('submit'); await flushPromises()
  const [request, context, done] = wrapper.emitted('apply')[0]
  expect(request).toEqual({ fromDate: '2026-10-22', toDate: '2026-10-28', count: 6 })
  expect(context).toMatchObject({ accountId: 'a', planId: 'p' })
  expect(wrapper.get('.settings-save').element.disabled).toBe(true)
  done(true); await flushPromises()
  expect(wrapper.find('form').exists()).toBe(false)
})
it('错误保留草稿，日期边界限制且过期日程不提交', async () => {
  const wrapper = setup(); await open(wrapper)
  await wrapper.get('[aria-label="每日6-24次数"]').setValue(8)
  await wrapper.get('form').trigger('submit'); await flushPromises()
  wrapper.emitted('apply')[0][2](false, '体力不足，未应用任何日期'); await flushPromises()
  expect(wrapper.text()).toContain('体力不足')
  expect(wrapper.get('[aria-label="每日6-24次数"]').element.value).toBe('8')
  await wrapper.setProps({ schedule: { baselineDate: '2026-10-23' } })
  expect(wrapper.get('.settings-save').element.disabled).toBe(true)
  await wrapper.get('form').trigger('submit')
  expect(wrapper.emitted('apply')).toHaveLength(1)
})
it('账号或清单切换关闭弹窗，迟到完成不回写新表单', async () => {
  const wrapper = setup(); await open(wrapper)
  await wrapper.get('form').trigger('submit'); await flushPromises()
  const done = wrapper.emitted('apply')[0][2]
  await wrapper.setProps({ accountId: 'b', planId: 'q' }); await open(wrapper)
  done(false, '旧账号错误'); await flushPromises()
  expect(wrapper.text()).not.toContain('旧账号错误')
  expect(wrapper.find('form').exists()).toBe(true)
  expect(wrapper.get('.settings-save').element.disabled).toBe(false)
})
it('当天固定标记可解除，空账号或禁用时不能打开', async () => {
  const wrapper = setup({ entry: { fixed: true, value: 6, kind: 'stage624' } })
  expect(wrapper.text()).toContain('当天固定 6 次')
  await wrapper.findAll('.repeat-link')[1].trigger('click')
  expect(wrapper.emitted('release')).toHaveLength(1)
  await wrapper.setProps({ accountId: '' }); await open(wrapper)
  expect(wrapper.find('form').exists()).toBe(false)
  await wrapper.setProps({ accountId: 'a', disabled: true }); await open(wrapper)
  expect(wrapper.find('form').exists()).toBe(false)
})

it('自定义项目默认安排到规划末日，展示体力与产出并等待云端确认', async () => {
  const wrapper = setup({ entry: { id: 'custom-spend-1', custom: true, label: '据点产出', costPer: 0, value: 1, yield: { __xp__: 1000 } }, resourceName: () => '经验' })
  await open(wrapper)
  expect(wrapper.get('[aria-label="每日安排结束日期"]').element.value).toBe('2027-01-19')
  expect(wrapper.text()).toContain('不会自动延续到范围之外')
  expect(wrapper.text()).toContain('每天消耗 0 体力')
  await wrapper.get('[aria-label="每日项目次数"]').setValue(2)
  expect(wrapper.text()).toContain('每天产出：经验 2000')
  await wrapper.get('form').trigger('submit'); await flushPromises()
  const [request, context, done] = wrapper.emitted('apply')[0]
  expect(request.count).toBe(2)
  expect(context.entryId).toBe('custom-spend-1')
  expect(wrapper.get('.settings-save').element.disabled).toBe(true)
  done(false, '体力不足，未应用任何日期'); await flushPromises()
  expect(wrapper.text()).toContain('体力不足')
  expect(wrapper.get('[aria-label="每日项目次数"]').element.value).toBe('2')
})

it('自定义当天安排提供修改入口，禁用时说明原因', async () => {
  const wrapper = setup({ entry: { id: 'custom-spend-1', custom: true, label: '据点', value: 1, fixed: true }, disabled: true, blockedReason: '请先切换至常规日程规划' })
  expect(wrapper.text()).toContain('修改每日安排')
  expect(wrapper.text()).toContain('当天安排 1 次')
  expect(wrapper.text()).toContain('请先切换至常规日程规划')
  expect(wrapper.text()).not.toContain('解除当天固定')
})
