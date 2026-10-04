import { beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import InstallPage from '../src/pages/install/index.vue'
import { pwaInstallState, requestPwaInstall } from '../src/utils/pwaInstall.js'
import { deferred } from '../test-support/factories.js'

vi.mock('../src/utils/pwaInstall.js', async () => {
  const { reactive } = await import('vue')
  return { pwaInstallState: reactive({ installable: true, installed: false, standalone: false, ios: false }), requestPwaInstall: vi.fn() }
})
beforeEach(() => {
  Object.assign(pwaInstallState, { installable: true, installed: false, standalone: false, ios: false })
  requestPwaInstall.mockReset().mockResolvedValue({ outcome: 'accepted' })
})
const render = () => mount(InstallPage, { attachTo: document.body, global: { stubs: { IslandSidebar: true, SiteFooter: true } } })

it.each([
  ['accepted', '等待系统完成'],
  ['dismissed', '本次安装已取消'],
  ['unavailable', '一键安装入口暂不可用'],
  ['failed', '系统安装调用未完成']
])('安装结果 %s 提供对应恢复方式', async (outcome, text) => {
  requestPwaInstall.mockResolvedValue({ outcome })
  const wrapper = render()
  await wrapper.get('.install-now').trigger('click'); await flushPromises()
  expect(wrapper.get('.install-feedback').text()).toContain(text)
  if (outcome === 'dismissed' || outcome === 'unavailable') expect(wrapper.get('.install-feedback').text()).not.toContain('权限')
  expect(fetch).not.toHaveBeenCalled()
})

it('原生入口不存在时展示手动指南，独立运行和已记录安装时不再邀请', async () => {
  pwaInstallState.installable = false
  const wrapper = render()
  expect(wrapper.find('.install-now').exists()).toBe(false)
  expect(wrapper.text()).toContain('可能不支持或尚未满足安装条件')
  pwaInstallState.installed = true; await flushPromises()
  expect(wrapper.get('.installed-banner').text()).toContain('已记录安装操作')
  pwaInstallState.standalone = true; await flushPromises()
  expect(wrapper.get('.installed-banner').text()).toContain('当前已从桌面独立运行')
  expect(requestPwaInstall).not.toHaveBeenCalled()
})

it('重复点击安装只调用一次；意外异常后反馈可恢复', async () => {
  const pending = deferred()
  requestPwaInstall.mockReturnValueOnce(pending.promise)
  const wrapper = render()
  await wrapper.get('.install-now').trigger('click')
  expect(wrapper.get('.install-now').attributes('disabled')).toBeDefined()
  await wrapper.get('.install-now').trigger('click')
  expect(requestPwaInstall).toHaveBeenCalledTimes(1)
  pending.reject(new Error('native failed')); await flushPromises()
  expect(wrapper.get('.install-feedback').text()).toContain('安装请求未完成')
  expect(wrapper.get('.install-now').attributes('disabled')).toBeUndefined()
})

it('平台标签提供关联、单一 Tab 焦点及方向键/Home/End 操作', async () => {
  const wrapper = render()
  const android = wrapper.get('#install-tab-android'), ios = wrapper.get('#install-tab-ios')
  android.element.focus()
  await android.trigger('keydown', { key: 'ArrowRight' })
  expect(ios.attributes('aria-selected')).toBe('true')
  expect(ios.attributes('tabindex')).toBe('0')
  expect(android.attributes('tabindex')).toBe('-1')
  expect(document.activeElement).toBe(ios.element)
  expect(wrapper.get('#install-panel-ios').attributes('aria-labelledby')).toBe(ios.attributes('id'))
  expect(ios.attributes('aria-controls')).toBe('install-panel-ios')
  expect(wrapper.get('#install-panel-ios').isVisible()).toBe(true)
  expect(wrapper.get('#install-panel-android').isVisible()).toBe(false)
  await ios.trigger('keydown', { key: 'Home' })
  expect(android.attributes('aria-selected')).toBe('true')
  await android.trigger('keydown', { key: 'End' })
  expect(ios.attributes('aria-selected')).toBe('true')
  await ios.trigger('keydown', { key: 'ArrowLeft' })
  expect(android.attributes('aria-selected')).toBe('true')
})

it('iOS 默认选中手动安装指南，保留系统步骤而不展示一键按钮', async () => {
  pwaInstallState.ios = true
  const wrapper = render()
  await flushPromises()
  expect(wrapper.get('#install-tab-ios').attributes('aria-selected')).toBe('true')
  expect(wrapper.find('.install-now').exists()).toBe(false)
  expect(wrapper.get('#install-panel-ios').text()).toContain('作为 Web App 打开')
})
