import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import OperatorEditorNav from '../src/pages/operator/OperatorEditorNav.vue'

it('三个入口具有标签语义，只请求切换、不滚动表单或写云端', async () => {
  const wrapper = mount(OperatorEditorNav, { props: { modelValue: 'growth' } })
  expect(wrapper.findAll('[role="tab"]')).toHaveLength(3)
  expect(wrapper.get('[aria-selected="true"]').text()).toBe('基础养成')
  await wrapper.get('#operator-editor-tab-discs').trigger('click')
  expect(wrapper.emitted('update:modelValue')).toEqual([['discs']])
  await wrapper.setProps({ modelValue: 'discs' })
  expect(wrapper.get('[aria-selected="true"]').text()).toBe('命盘')
  expect(wrapper.get('#operator-editor-tab-discs').attributes('aria-controls')).toBe('operator-editor-discs')
  expect(fetch).not.toHaveBeenCalled()
})

it('左右/Home/End只移动焦点，离开后当前标签恢复唯一Tab入口', async () => {
  const wrapper = mount(OperatorEditorNav, { attachTo: document.body })
  const tabs = wrapper.findAll('[role="tab"]')
  tabs[0].element.focus()
  await tabs[0].trigger('keydown', { key: 'ArrowRight' })
  expect(document.activeElement).toBe(tabs[1].element)
  expect(tabs.map(tab => tab.element.tabIndex)).toEqual([-1, 0, -1])
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  await tabs[1].trigger('keydown', { key: 'End' })
  expect(document.activeElement).toBe(tabs[2].element)
  await tabs[2].trigger('keydown', { key: 'ArrowRight' })
  expect(document.activeElement).toBe(tabs[0].element)
  await tabs[0].trigger('keydown', { key: 'ArrowLeft' })
  expect(document.activeElement).toBe(tabs[2].element)
  await tabs[2].trigger('keydown', { key: 'Home' })
  expect(document.activeElement).toBe(tabs[0].element)
  await tabs[0].trigger('keydown', { key: 'ArrowRight' })
  tabs[1].element.blur()
  expect(tabs.map(tab => tab.element.tabIndex)).toEqual([0, -1, -1])
  expect(fetch).not.toHaveBeenCalled()
})
