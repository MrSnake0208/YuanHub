import { expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import PlannerRoutineSettings from '../src/components/operator/PlannerRoutineSettings.vue'
import PlannerSelect from '../src/components/operator/PlannerSelect.vue'
import { DEFAULT_TRAINING_LEVELS, TRAINING_GROUPS } from '../src/data/operatorTraining.js'
import { normalizePlannerPreferences } from '../src/data/cultivationPlanner.js'
import { installViewport } from '../test-support/viewport.js'

const setup = props => mount(PlannerRoutineSettings, { attachTo: document.body, props: { accountId: 'a', planId: 'plan', revision: 1, levels: { ...DEFAULT_TRAINING_LEVELS }, preferences: normalizePlannerPreferences(), ...props }, global: { stubs: { teleport: true } } })
const open = async (wrapper, index = 0) => { await wrapper.findAll('.condition-summary-card')[index].trigger('click'); await flushPromises() }
const save = async wrapper => { await wrapper.get('form').trigger('submit'); await flushPromises() }

it.each([390, 768, 1440])('首页无调节器，按需编辑保存后摘要同步、完整保留关卡选项：%ipx', async width => {
  const viewport = installViewport(width), wrapper = setup()
  expect(wrapper.find('input').exists()).toBe(false)
  expect(wrapper.text()).toContain('风火 12 层 · 地水 12 层 · 阴阳 12 层 · 经验 绝境历练')
  expect(wrapper.emitted('save-preferences')).toBeUndefined()
  await open(wrapper)
  await wrapper.get('#pref-luoyang').setValue(2)
  await wrapper.get('#pref-shouchun').setValue(1)
  await wrapper.get('#pref-purchase').setValue(3)
  viewport.resize(width === 390 ? 1440 : 390); await flushPromises()
  expect(wrapper.get('#pref-purchase').element.value).toBe('3')
  expect(wrapper.findAll('.condition-summary-card')[0].text()).toContain('购买体力 0 次')
  await save(wrapper)
  const [preferences, context, done] = wrapper.emitted('save-preferences')[0]
  expect(preferences).toMatchObject({ luoyang: 2, shouchun: 1, purchaseCount: 3 })
  expect(context).toMatchObject({ accountId: 'a', planId: 'plan', revision: 1 })
  await wrapper.setProps({ preferences }); done(true); await flushPromises()
  expect(wrapper.find('form').exists()).toBe(false)
  expect(wrapper.findAll('.condition-summary-card')[0].text()).toContain('洛阳 2 次 · 寿春 1 次 · 购买体力 3 次')
  await open(wrapper, 1)
  const selects = wrapper.findAllComponents(PlannerSelect)
  expect(selects).toHaveLength(4)
  selects.forEach((select, index) => expect(select.props('options').map(option => option.value)).toEqual(TRAINING_GROUPS[index].stages.map(stage => stage.level)))
  selects[0].vm.$emit('update:modelValue', 9); await flushPromises()
  expect(wrapper.emitted('save-levels')).toBeUndefined()
  await save(wrapper)
  const [levels, , saved] = wrapper.emitted('save-levels')[0]
  expect(levels).toEqual({ ...DEFAULT_TRAINING_LEVELS, fh: 9 })
  await wrapper.setProps({ levels, revision: 2 }); saved(true); await flushPromises()
  expect(wrapper.findAll('.condition-summary-card')[1].text()).toContain('风火 9 层')
})

it('范围校验、失败草稿与陈旧版本保护均保留', async () => {
  const wrapper = setup()
  await open(wrapper)
  await wrapper.get('#pref-purchase').setValue(9); await save(wrapper)
  expect(wrapper.emitted('save-preferences')).toBeUndefined()
  await wrapper.get('#pref-purchase').setValue(2); await save(wrapper)
  wrapper.emitted('save-preferences')[0][2](false); await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('保存未成功')
  expect(wrapper.get('#pref-purchase').element.value).toBe('2')
  await wrapper.setProps({ preferences: normalizePlannerPreferences({ purchaseCount: 4 }) })
  expect(wrapper.get('#pref-purchase').element.value).toBe('2')
  await save(wrapper)
  expect(wrapper.emitted('save-preferences')).toHaveLength(1)
})

it('切换账号或清单清空编辑器；旧保存回调不能修改新账号草稿', async () => {
  const wrapper = setup()
  await open(wrapper); await wrapper.get('#pref-purchase').setValue(2); await save(wrapper)
  const done = wrapper.emitted('save-preferences')[0][2]
  await wrapper.setProps({ accountId: 'b', preferences: normalizePlannerPreferences({ purchaseCount: 1 }) })
  expect(wrapper.find('form').exists()).toBe(false)
  await open(wrapper); await wrapper.get('#pref-purchase').setValue(3)
  done(true); await flushPromises()
  expect(wrapper.get('#pref-purchase').element.value).toBe('3')
  expect(wrapper.findAll('.condition-summary-card')[0].text()).toContain('购买体力 1 次')
  await wrapper.setProps({ planId: 'other' })
  expect(wrapper.find('form').exists()).toBe(false)
  expect(wrapper.emitted('save-levels')).toBeUndefined()
})
