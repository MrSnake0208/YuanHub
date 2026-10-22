import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import OperatorDiscPresets from '../src/components/operator/OperatorDiscPresets.vue'
import presets from '../src/data/operatorDiscPresets.json'

const operatorId = 'char_001_yangxiu'
const choices = presets[operatorId]
const catalog = [...new Set(choices.flat())].map(ot_name => ({ ot_name, color: '金' }))
function render(modelValue = []) {
  const wrapper = mount(OperatorDiscPresets, { props: {
    operatorId, catalog, modelValue, destination: '组合 1 的当前命盘',
    'onUpdate:modelValue': value => wrapper.setProps({ modelValue: value }),
  } })
  return wrapper
}

it('完整预设最多三套，匹配忽略顺序，填入和撤销不修改静态数据', async () => {
  const before = JSON.stringify(presets)
  const initial = choices[0].slice().reverse()
  const wrapper = render(initial)
  expect(wrapper.findAll('.disc-preset')).toHaveLength(3)
  expect(wrapper.get('.disc-preset').attributes('aria-pressed')).toBe('true')
  await wrapper.get('.disc-preset').trigger('click')
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  await wrapper.findAll('.disc-preset')[1].trigger('click')
  expect(wrapper.props('modelValue')).toEqual(choices[1])
  expect(wrapper.get('[role="status"]').text()).toContain('已填入组合 1 的当前命盘')
  await wrapper.get('.disc-preset-feedback button').trigger('click')
  expect(wrapper.props('modelValue')).toEqual(initial)
  expect(JSON.stringify(presets)).toBe(before)
  wrapper.unmount()
})

it('手动修改或切换编辑对象后，不允许旧撤销覆盖新草稿', async () => {
  const wrapper = render()
  await wrapper.get('.disc-preset').trigger('click')
  await wrapper.setProps({ modelValue: choices[0].slice(0, 2) })
  expect(wrapper.find('.disc-preset-feedback button').exists()).toBe(false)
  await wrapper.get('.disc-preset').trigger('click')
  await wrapper.setProps({ destination: '组合 2 的目标命盘' })
  expect(wrapper.find('.disc-preset-feedback button').exists()).toBe(false)
  wrapper.unmount()
})

it('保存期间禁止填入和撤销，未知密探及失效组合不展示', async () => {
  const wrapper = render()
  await wrapper.setProps({ disabled: true })
  await wrapper.get('.disc-preset').trigger('click')
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  await wrapper.setProps({ disabled: false })
  await wrapper.get('.disc-preset').trigger('click')
  await wrapper.setProps({ disabled: true })
  await wrapper.get('.disc-preset-feedback button').trigger('click')
  expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
  await wrapper.setProps({ catalog: catalog.filter(disc => disc.ot_name !== choices[0][0]) })
  expect(wrapper.findAll('.disc-preset').every(button => !button.text().includes(choices[0][0]))).toBe(true)
  await wrapper.setProps({ operatorId: 'missing' })
  expect(wrapper.find('.disc-presets').exists()).toBe(false)
  wrapper.unmount()
})

it('所有静态候选均为去重后的完整三词条，且每个密探最多三套', () => {
  expect(Object.keys(presets)).toHaveLength(125)
  for (const choices of Object.values(presets)) {
    expect(choices.length).toBeGreaterThan(0)
    expect(choices.length).toBeLessThanOrEqual(3)
    expect(new Set(choices.map(names => names.slice().sort().join('\0'))).size).toBe(choices.length)
    for (const names of choices) {
      expect(names).toHaveLength(3)
      expect(new Set(names).size).toBe(3)
      expect(names.every(name => typeof name === 'string' && name.trim())).toBe(true)
    }
  }
})
