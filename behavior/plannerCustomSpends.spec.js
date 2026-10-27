import { expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import PlannerCustomDailySpend from '../src/components/operator/PlannerCustomDailySpend.vue'
import PlannerCustomSpendManager from '../src/components/operator/PlannerCustomSpendManager.vue'
import PlannerCustomEntry from '../src/components/operator/PlannerCustomEntry.vue'
import PlannerDateTabs from '../src/components/operator/PlannerDateTabs.vue'
const item = { id: 'custom-spend-lantai', label: '兰台扫荡', costPer: 10, yield: { __xp__: 1000 } }
const global = { stubs: { teleport: true } }
const daily = () => mount(PlannerCustomDailySpend, { attachTo: document.body, props: { rules: [], templates: [item], today: '2026-10-27', date: '2026-10-27', lastDate: '2027-01-24', contextKey: 'main/child/plan', resourceName: () => '经验' }, global })
it('每日10次先预览100体力和10000经验，编辑后预览失效，确认保存后等待回执', async () => {
  const wrapper = daily(); wrapper.vm.open({ ...item, value: 10 }); await flushPromises()
  expect(wrapper.text()).toContain('每天 10 次，共 100 体力 · 经验 10000')
  await wrapper.get('form').trigger('submit')
  const [request, done] = wrapper.emitted('preview')[0]
  expect(request.version).toMatchObject({ count: 10, enabled: true, item: { costPer: 10, yield: { __xp__: 1000 } } })
  done({ fromDate: '2026-10-27', throughDate: '2027-01-24', exceptions: 1, takeovers: 0 }); await flushPromises()
  expect(wrapper.get('.settings-save').text()).toBe('确认保存每日安排')
  await wrapper.get('input[type="number"]').setValue(8)
  expect(wrapper.get('.settings-save').text()).toBe('预览每日安排')
  await wrapper.get('form').trigger('submit'); wrapper.emitted('preview')[1][1]({ exceptions: 1 }); await flushPromises()
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(wrapper.get('.settings-save').element.disabled).toBe(true)
  wrapper.emitted('apply')[0][1]({ error: '云端冲突' }); await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('云端冲突')
  expect(wrapper.get('input[type="number"]').element.value).toBe('8')
})
it('规则副本不会随模板改变，主动采用最新资料才替换；停用保留历史', async () => {
  const wrapper = daily()
  await wrapper.setProps({ rules: [{ id: item.id, versions: [{ fromDate: '2026-10-27', enabled: true, count: 10, item: { label: '旧兰台', costPer: 20, yield: { __xp__: 10 } } }] }] })
  wrapper.vm.open({ ...item, value: 1 }); await flushPromises()
  expect(wrapper.text()).toContain('每次 20 体力')
  await wrapper.get('.daily-link').trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('每次 10 体力')
  await wrapper.get('input[type="checkbox"]').setValue(false)
  await wrapper.get('form').trigger('submit')
  expect(wrapper.emitted('preview')[0][0].version).toEqual({ fromDate: '2026-10-27', enabled: false })
  await wrapper.setProps({ contextKey: 'main/other-child/plan' }); expect(wrapper.find('form').exists()).toBe(false)
})
it('常用模板复用项目表单而不保存次数，失败保留编辑，大账号切换关闭表单', async () => {
  const wrapper = mount(PlannerCustomSpendManager, { attachTo: document.body, props: { templates: [item], owner: 'main', resources: [], resourceName: id => id }, global })
  wrapper.vm.open(item.id); await flushPromises()
  expect(wrapper.getComponent(PlannerCustomEntry).props('hideCount')).toBe(true)
  expect(wrapper.find('input[aria-label$="次数"]').exists()).toBe(false)
  await wrapper.get('input[type="text"]').setValue('兰台常用')
  await wrapper.get('form').trigger('submit')
  expect(wrapper.emitted('save')[0][0][0]).toEqual({ ...item, label: '兰台常用' })
  wrapper.emitted('save')[0][1](false); await flushPromises()
  expect(wrapper.get('input[type="text"]').element.value).toBe('兰台常用')
  await wrapper.setProps({ owner: 'other' }); expect(wrapper.find('form').exists()).toBe(false)
})
it('备齐后的派生日期明确显示未保存，日期选择本身不提交日程', async () => {
  const wrapper = mount(PlannerDateTabs, { props: { dates: ['2026-10-27', '2026-10-28'], selected: '2026-10-28', today: '2026-10-27', fixed: true, previewDates: ['2026-10-28'] } })
  expect(wrapper.get('[data-date="2026-10-28"]').attributes('aria-label')).toContain('未保存日程')
  expect(wrapper.get('[data-date="2026-10-27"]').text()).toContain('已保存')
  expect(wrapper.get('.date-current-status').text()).toContain('规则预览')
  expect(wrapper.emitted('save')).toBeUndefined()
})
