import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import OperatorLevelBreakthroughSelect from '../src/components/operator/OperatorLevelBreakthroughSelect.vue'

it.each([10, 20, 30, 40, 50, 60, 70, 80, 90])('整十级 %i 显示行内突破；未知只在用户操作后更新', async level => {
  const wrapper = mount(OperatorLevelBreakthroughSelect, { props: { inline: true, level, modelValue: null } })
  const input = wrapper.get('input[type="checkbox"]')
  expect(wrapper.find('select').exists()).toBe(false)
  expect(input.element.checked).toBe(false)
  expect(input.element.indeterminate).toBe(true)
  expect(input.attributes('aria-checked')).toBe('mixed')
  expect(wrapper.text()).toContain('待核对')
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  await input.setValue(true)
  expect(wrapper.emitted('update:modelValue')).toEqual([[level / 10]])
  await wrapper.setProps({ modelValue: level / 10 })
  expect(input.element.indeterminate).toBe(false)
  expect(wrapper.text()).not.toContain('待核对')
  await input.setValue(false)
  expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([level / 10 - 1])
})

it.each([0, -10, 1, 81, 89, 91, 99, 100, 110, 80.5, NaN, Infinity])('等级 %s 不显示行内突破，也不改写原记录', level => {
  const wrapper = mount(OperatorLevelBreakthroughSelect, { props: { inline: true, level, modelValue: 9 } })
  expect(wrapper.find('input').exists()).toBe(false)
  expect(wrapper.find('select').exists()).toBe(false)
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
})

it.each([null, 8, 9])('90→89→90 保留原始突破 %s', async stage => {
  const wrapper = mount(OperatorLevelBreakthroughSelect, { props: { inline: true, level: 90, modelValue: stage } })
  await wrapper.setProps({ level: 89 })
  expect(wrapper.find('input').exists()).toBe(false)
  await wrapper.setProps({ level: 90 })
  const input = wrapper.get('input')
  expect(input.element.checked).toBe(stage === 9)
  expect(input.element.indeterminate).toBe(stage == null)
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
})

it('保存中禁用突破操作；非弹窗调用保留原下拉协议', () => {
  const inline = mount(OperatorLevelBreakthroughSelect, { props: { inline: true, level: 90, disabled: true } })
  expect(inline.get('input').element.disabled).toBe(true)
  const original = mount(OperatorLevelBreakthroughSelect, { props: { level: 90, modelValue: null } })
  expect(original.get('select').element.value).toBe('')
  expect(original.findAll('option').map(option => option.element.value)).toEqual(['', '8', '9'])
})
