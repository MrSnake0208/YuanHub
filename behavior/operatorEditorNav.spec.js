import { expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import OperatorEditorNav from '../src/pages/operator/OperatorEditorNav.vue'

function scrollRoot() {
  const root = document.createElement('div')
  root.innerHTML = ['growth', 'discs', 'stars'].map(id => `<section data-editor-section="${id}"><h4 id="operator-editor-${id}" tabindex="-1">${id}</h4><input value="draft" /></section>`).join('')
  document.body.append(root)
  root.getBoundingClientRect = () => ({ top: 100 })
  root.querySelectorAll('section').forEach((section, index) => {
    section.getBoundingClientRect = section.firstChild.getBoundingClientRect = () => ({ top: 112 + index * 300 - root.scrollTop })
  })
  Object.defineProperties(root, { clientHeight: { value: 400 }, scrollHeight: { value: 900 } })
  root.scrollTo = vi.fn(({ top }) => { root.scrollTop = top; root.dispatchEvent(new Event('scroll')) })
  return root
}

it('页内定位移动焦点和当前分区，保留所有表单节点与输入', async () => {
  const root = scrollRoot()
  const input = root.querySelector('input')
  input.value = '未保存的养成'
  const wrapper = mount(OperatorEditorNav, { attachTo: document.body, props: { scrollRoot: root } })
  await wrapper.get('[aria-controls="operator-editor-discs"]').trigger('click')
  expect(root.scrollTo).toHaveBeenLastCalledWith({ top: 300, behavior: 'instant' })
  expect(document.activeElement).toBe(root.querySelector('#operator-editor-discs'))
  expect(wrapper.get('[aria-current="location"]').text()).toBe('命盘')
  expect(root.querySelector('input')).toBe(input)
  expect(input.value).toBe('未保存的养成')
  expect(root.querySelectorAll('section')).toHaveLength(3)
  expect(fetch).not.toHaveBeenCalled()
})

it('滚动到底部时高亮星石，滚回顶部恢复基础养成', async () => {
  const root = scrollRoot()
  const wrapper = mount(OperatorEditorNav, { props: { scrollRoot: root } })
  root.scrollTo({ top: 500 }); await wrapper.vm.$nextTick()
  expect(wrapper.get('[aria-current="location"]').text()).toBe('星石')
  root.scrollTo({ top: 0 }); await wrapper.vm.$nextTick()
  expect(wrapper.get('[aria-current="location"]').text()).toBe('基础养成')
})

it('极矮视口切换滚动容器时避开吸顶导航，并清理旧监听', async () => {
  const body = scrollRoot()
  const wrapper = mount(OperatorEditorNav, { attachTo: document.body, props: { scrollRoot: body } })
  const panel = document.createElement('div')
  document.body.append(panel)
  panel.append(wrapper.element, body)
  panel.getBoundingClientRect = () => ({ top: 60 })
  wrapper.element.getBoundingClientRect = () => ({ bottom: 104 })
  panel.scrollTo = vi.fn()
  const removeBody = vi.spyOn(body, 'removeEventListener')
  const removePanel = vi.spyOn(panel, 'removeEventListener')
  await wrapper.setProps({ scrollRoot: panel })
  expect(removeBody).toHaveBeenCalledWith('scroll', expect.any(Function))
  await wrapper.get('[aria-controls="operator-editor-discs"]').trigger('click')
  expect(panel.scrollTo).toHaveBeenCalledWith({ top: 296, behavior: 'instant' })
  wrapper.unmount()
  expect(removePanel).toHaveBeenCalledWith('scroll', expect.any(Function))
})
