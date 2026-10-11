// Keep the existing tutorial implementation covered through explicit opt-in.
vi.hoisted(() => vi.stubEnv('VITE_TUTORIALS_ENABLED', 'true'))
afterAll(() => vi.unstubAllEnvs())
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { deferred } from '../test-support/factories.js'

let listeners, documentListeners
beforeEach(() => {
  vi.resetModules()
  listeners = vi.spyOn(window, 'addEventListener')
  documentListeners = vi.spyOn(document, 'addEventListener')
})
afterEach(() => {
  for (const [type, listener] of listeners.mock.calls) window.removeEventListener(type, listener)
  for (const [type, listener] of documentListeners.mock.calls) document.removeEventListener(type, listener)
})
async function render({ ios = false, standalone = false } = {}) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ios ? 'iPhone Safari' : 'Android Chrome Mobile')
  const display = { matches: standalone, addEventListener: vi.fn() }
  vi.stubGlobal('matchMedia', query => query === '(display-mode: standalone)' ? display : { matches: true, addEventListener: vi.fn() })
  const install = await import('../src/utils/pwaInstall.js')
  const { default: component } = await import('../src/pages/install/index.vue')
  const wrapper = mount(component, { attachTo: document.body, global: { stubs: { IslandSidebar: true, SiteFooter: true, RouterLink: { template: '<a><slot /></a>' } } } })
  function offer(outcome = 'accepted', prompt = vi.fn(async () => {})) {
    const event = Object.assign(new Event('beforeinstallprompt'), { prompt, userChoice: Promise.resolve({ outcome }) })
    window.dispatchEvent(event)
    return event
  }
  async function begin() { await wrapper.get('.install-now').trigger('click'); await flushPromises() }
  return { wrapper, install, offer, display, begin }
}

it('阅读与直接使用不开始教程、不调用系统、不标记完成', async () => {
  const { wrapper, install, offer } = await render()
  const event = offer()
  await flushPromises()
  expect(wrapper.text()).toContain('跟着做一次')
  expect(wrapper.text()).toContain('直接使用网页版')
  expect(install.pwaInstallState.guideActive).toBe(false)
  expect(install.pwaInstallState.tutorialCompleted).toBe(false)
  await wrapper.get('a').trigger('click')
  expect(install.pwaInstallState.dismissedForNow).toBe(true)
  expect(install.pwaInstallState.installed).toBe(false)
  expect(install.pwaInstallState.tutorialCompleted).toBe(false)
  expect(event.prompt).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})

it.each(['accepted', 'dismissed', 'failed', 'unavailable'])('%s 使用真实结果而不伪造安装', async outcome => {
  const { wrapper, install, offer, begin } = await render()
  if (outcome !== 'unavailable') offer(outcome, vi.fn(async () => { if (outcome === 'failed') throw new Error('native failed') }))
  await begin()
  if (outcome !== 'unavailable') await wrapper.get('.install-now').trigger('click')
  else await install.requestPwaInstall()
  await flushPromises()
  expect(install.pwaInstallState.installed).toBe(false)
  expect(install.pwaInstallState.tutorialCompleted).toBe(false)
  expect(wrapper.find('.installed-banner').exists()).toBe(false)
  expect(wrapper.find('.shortcut-permission-help').exists()).toBe(outcome === 'failed')
  if (outcome === 'accepted') expect(wrapper.get('.install-feedback').text()).toContain('正在等待系统完成安装')
  if (outcome === 'dismissed') {
    expect(wrapper.get('.install-feedback').text()).toContain('本次安装已取消')
    offer()
    await flushPromises()
    expect(wrapper.find('.install-now').exists()).toBe(true)
  }
  await wrapper.get('.exit-guide').trigger('click')
  expect(install.pwaInstallState.guideActive).toBe(false)
  expect(wrapper.text()).toContain('继续实操教程')
  expect(document.activeElement).toBe(wrapper.get('.install-now').element)
})

it('accepted 后 appinstalled 才完成，普通窗口不宣称从桌面运行', async () => {
  const { wrapper, install, offer, begin, display } = await render()
  offer()
  await begin()
  await wrapper.get('.install-now').trigger('click'); await flushPromises()
  expect(install.pwaInstallState.tutorialCompleted).toBe(false)
  window.dispatchEvent(new Event('appinstalled')); await flushPromises()
  expect(install.pwaInstallState.tutorialCompleted).toBe(true)
  expect(wrapper.get('.installed-banner').text()).toContain('系统已确认 YuanHub 安装完成')
  expect(wrapper.text()).not.toContain('你现在正从桌面版 YuanHub 运行')
  display.matches = true
  window.dispatchEvent(new Event('pageshow')); await flushPromises()
  expect(wrapper.get('.installed-banner').text()).toContain('你现在正从桌面版 YuanHub 运行')
})

it('原生提示未结束也可以 Esc 退出；迟到结果只更新真实任务', async () => {
  const { wrapper, install, offer, begin } = await render()
  const pending = deferred()
  const event = offer('accepted', vi.fn(() => pending.promise))
  await begin()
  await wrapper.get('.install-now').trigger('click')
  expect(wrapper.get('.install-now').attributes('disabled')).toBeDefined()
  await wrapper.get('.install-now').trigger('click')
  expect(event.prompt).toHaveBeenCalledTimes(1)
  expect(wrapper.get('.exit-guide').attributes('disabled')).toBeUndefined()
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await flushPromises()
  expect(wrapper.text()).toContain('教程已暂停')
  pending.resolve(); await flushPromises()
  expect(install.pwaInstallState.phase).toBe('waiting-for-install')
  expect(install.pwaInstallState.guideActive).toBe(false)
  expect(event.prompt).toHaveBeenCalledTimes(1)
  await wrapper.get('.install-now').trigger('click'); await flushPromises()
  expect(wrapper.get('.install-feedback').text()).toContain('正在等待系统完成安装')
})

it('iOS 当前环境直接给分享动作，等待与浏览器返回均不确认安装', async () => {
  const { wrapper, install, begin, display } = await render({ ios: true })
  await begin()
  expect(wrapper.get('.install-feedback').text()).toContain('打开 Safari 的“分享”菜单')
  expect(wrapper.text()).not.toContain('立即添加到桌面')
  await wrapper.get('.install-now').trigger('click')
  window.dispatchEvent(new Event('focus')); await flushPromises()
  expect(install.pwaInstallState.phase).toBe('waiting-for-install')
  expect(install.pwaInstallState.tutorialCompleted).toBe(false)
  expect(wrapper.find('.installed-banner').exists()).toBe(false)
  display.matches = true
  document.dispatchEvent(new Event('visibilitychange')); await flushPromises()
  expect(install.pwaInstallState.tutorialCompleted).toBe(true)
  expect(wrapper.get('.installed-banner').text()).toContain('你现在正从桌面版 YuanHub 运行')
})

it('有 standalone 成果直接显示真实状态，不强迫重做或把未参加者算完成', async () => {
  const { wrapper, install } = await render({ ios: true, standalone: true })
  expect(wrapper.get('.installed-banner').text()).toContain('你现在正从桌面版 YuanHub 运行')
  expect(wrapper.get('.install-now').text()).toContain('复用已安装成果')
  expect(install.pwaInstallState.tutorialCompleted).toBe(false)
  await wrapper.get('.install-now').trigger('click'); await flushPromises()
  expect(install.pwaInstallState.tutorialCompleted).toBe(true)
  expect(fetch).not.toHaveBeenCalled()
})

it('禁用自动教程仍可手动参加；卸载即暂停而不完成', async () => {
  const { wrapper, install, offer } = await render()
  await wrapper.get('.guide-preference button').trigger('click')
  expect(install.pwaInstallState.disableAutoGuide).toBe(true)
  offer(); await flushPromises()
  await wrapper.get('.install-now').trigger('click')
  expect(install.pwaInstallState.guideActive).toBe(true)
  wrapper.unmount()
  expect(install.pwaInstallState.guideActive).toBe(false)
  expect(install.pwaInstallState.tutorialCompleted).toBe(false)
})


it('暂停后 appinstalled 不算教程完成；手动继续复用真实成果立即完成', async () => {
  const { wrapper, install, offer, begin } = await render()
  offer()
  await begin()
  await wrapper.get('.exit-guide').trigger('click')
  window.dispatchEvent(new Event('appinstalled')); await flushPromises()
  expect(wrapper.get('.installed-banner').text()).toContain('系统已确认')
  expect(install.pwaInstallState.tutorialCompleted).toBe(false)
  await wrapper.get('.install-now').trigger('click'); await flushPromises()
  expect(install.pwaInstallState.tutorialCompleted).toBe(true)
  expect(wrapper.get('.installed-banner').text()).toContain('实操教程已完成')
  expect(wrapper.get('.install-now').text()).toContain('复用已安装成果')
})
