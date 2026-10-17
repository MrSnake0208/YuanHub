import { afterEach, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import PlannerSettingsPanel from '../src/components/operator/PlannerSettingsPanel.vue'
import AppDialog from '../src/components/AppDialog.vue'
import { dialog } from '../src/utils/dialog.js'
import { installViewport } from '../test-support/viewport.js'

const DraftInput = defineComponent({ setup() { const value = ref(''); return () => h('input', { 'aria-label': '测试草稿', value: value.value, onInput: event => { value.value = event.target.value } }) } })
const CountInput = defineComponent({ setup() { const value = ref(5); return () => h('input', { 'aria-label': '次数', type: 'number', min: 0, max: 4, required: true, value: value.value, onInput: event => { value.value = event.target.value } }) } })
const body = new DOMWrapper(document.body)
const button = (wrapper, label) => body.findAll('button').find(item => item.text() === label)
afterEach(() => { if (dialog._state.visible) dialog._cancel() })

it.each([390, 768, 1440])('编辑面板聚焦标题，跨宽度保留草稿，关闭恢复入口焦点与滚动：%ipx', async width => {
  const viewport = installViewport(width), open = ref(false)
  const Host = defineComponent({ setup: () => () => h('div', [
    h('button', { onClick: () => { open.value = true } }, '编辑'),
    h(PlannerSettingsPanel, { open: open.value, title: '日常安排', onClose: () => { open.value = false } }, { default: () => h(DraftInput) }),
  ]) })
  const wrapper = mount(Host, { attachTo: document.body, global: { stubs: { teleport: false } } })
  const trigger = button(body, '编辑'); trigger.element.focus(); await trigger.trigger('click'); await flushPromises()
  expect(document.activeElement.tagName).toBe('H3')
  const input = body.get('input'); await input.setValue('未保存内容'); input.element.focus(); await flushPromises()
  expect(document.activeElement).toBe(input.element)
  const instance = wrapper.getComponent(PlannerSettingsPanel).vm.$
  for (const width of [768, 390, 1440]) {
    viewport.resize(width); await flushPromises()
    expect(wrapper.getComponent(PlannerSettingsPanel).vm.$).toBe(instance)
    expect(input.element.value).toBe('未保存内容')
    expect(document.activeElement).toBe(input.element)
  }
  await body.get('[aria-label="关闭设置"]').trigger('click'); await flushPromises()
  expect(body.find('[role="dialog"]').exists()).toBe(false)
  expect(document.activeElement).toBe(trigger.element)
  expect(document.body.style.overflow).toBe('')
})

it('未保存修改通过真实确认弹窗继续编辑或放弃，确认期间面板不越层响应 Escape', async () => {
  const open = ref(true)
  const Host = defineComponent({ setup: () => () => h('div', [
    h(PlannerSettingsPanel, { open: open.value, dirty: true, title: '月卡', onClose: () => { open.value = false } }, { default: () => h('input', { value: '37' }) }), h(AppDialog),
  ]) })
  const wrapper = mount(Host, { attachTo: document.body, global: { stubs: { teleport: false } } })
  await flushPromises()
  await body.get('[aria-label="关闭设置"]').trigger('click'); await flushPromises()
  expect(body.findAll('[role="dialog"]')).toHaveLength(2)
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await flushPromises()
  expect(open.value).toBe(true)
  expect(body.findAll('[role="dialog"]')).toHaveLength(1)
  await body.get('[aria-label="关闭设置"]').trigger('click'); await flushPromises()
  await button(body, '放弃修改').trigger('click'); await flushPromises()
  expect(open.value).toBe(false)
})

it('校验拦截无效字段，保存中禁止关闭，错误保留表单并可定位', async () => {
  const wrapper = mount(PlannerSettingsPanel, { attachTo: document.body, props: { open: true, title: '派遣' }, slots: { default: () => h(CountInput) }, global: { stubs: { teleport: false } } })
  await body.get('form').trigger('submit')
  expect(wrapper.emitted('save')).toBeUndefined()
  await body.get('input').setValue(4); await body.get('form').trigger('submit')
  expect(wrapper.emitted('save')).toHaveLength(1)
  await wrapper.setProps({ busy: true })
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flushPromises()
  expect(wrapper.emitted('close')).toBeUndefined()
  expect(button(body, '保存中…').element.disabled).toBe(true)
  await wrapper.setProps({ busy: false, error: '保存失败，请重试' }); await nextTick()
  expect(body.get('[role="alert"]').text()).toContain('保存失败')
  expect(document.activeElement).toBe(body.get('[role="alert"]').element)
  expect(body.get('input').element.value).toBe('4')
})

it('旧面板的放弃确认不能关闭重新打开的面板；未保存时拦截页面卸载', async () => {
  let answer
  vi.spyOn(dialog, 'confirm').mockImplementation(() => new Promise(resolve => { answer = resolve }))
  const wrapper = mount(PlannerSettingsPanel, { attachTo: document.body, props: { open: true, title: '账号A', dirty: true }, global: { stubs: { teleport: false } } })
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event); expect(event.defaultPrevented).toBe(true)
  await body.get('[aria-label="关闭设置"]').trigger('click')
  await wrapper.setProps({ open: false }); await wrapper.setProps({ open: true, title: '账号B' })
  answer(true); await flushPromises()
  expect(wrapper.emitted('close')).toBeUndefined()
  expect(body.get('h3').text()).toBe('账号B')
})

it('浏览器返回/站内离开路由同样确认草稿，继续编辑留在原页', async () => {
  const confirm = vi.spyOn(dialog, 'confirm').mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  const Page = defineComponent({ setup: () => () => h(PlannerSettingsPanel, { open: true, dirty: true, title: '未保存的日常设置' }) })
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: Page }, { path: '/other', component: { template: '<p>另一页</p>' } }] })
  await router.push('/'); await router.isReady()
  mount(defineComponent({ setup: () => () => h(RouterView) }), { attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
  await router.push('/other'); await flushPromises()
  expect(confirm).toHaveBeenCalledOnce()
  expect(router.currentRoute.value.path).toBe('/')
  expect(body.get('[role="dialog"]').text()).toContain('未保存的日常设置')
  await router.push('/other'); await flushPromises()
  expect(router.currentRoute.value.path).toBe('/other')
  expect(body.find('[role="dialog"]').exists()).toBe(false)
})
