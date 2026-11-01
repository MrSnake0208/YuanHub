import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

let listeners, documentListeners
beforeEach(() => {
  vi.stubEnv('VITE_TUTORIALS_ENABLED', '')
  vi.resetModules()
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Android Chrome Mobile')
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn() }))
  listeners = vi.spyOn(window, 'addEventListener')
  documentListeners = vi.spyOn(document, 'addEventListener')
})
afterEach(() => {
  for (const [type, listener] of listeners.mock.calls) window.removeEventListener(type, listener)
  for (const [type, listener] of documentListeners.mock.calls) document.removeEventListener(type, listener)
  vi.unstubAllEnvs()
})

it.each(['accepted', 'dismissed', 'failed'])('direct installation handles %s without resuming or overwriting historical tutorial progress', async outcome => {
  const install = await import('../src/utils/pwaInstall.js')
  const history = JSON.stringify({ tutorialStarted: true, guideActive: true, tutorialCompleted: false, phase: 'waiting-for-install', disableAutoGuide: false })
  localStorage.setItem(install.PWA_GUIDE_KEY, history)
  const { default: InstallPage } = await import('../src/pages/install/index.vue')
  const wrapper = mount(InstallPage, { global: { stubs: { IslandSidebar: true, SiteFooter: true, RouterLink: { template: '<a><slot /></a>' } } } })
  expect(wrapper.text()).not.toMatch(/教程|跟着做一次|第\s*\d\s*步/)
  expect(wrapper.text()).toContain('安装方法')
  expect(wrapper.text()).toContain('Safari')
  expect(wrapper.find('.task-exit, .guide-preference').exists()).toBe(false)
  expect(listeners.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(0)
  const prompt = vi.fn(async () => { if (outcome === 'failed') throw new Error('native failure') })
  window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt, userChoice: Promise.resolve({ outcome }) }))
  await flushPromises()
  expect(install.shouldShowPwaInstallPrompt()).toBe(false)
  expect(wrapper.get('.install-now').text()).toBe('立即添加到桌面')
  await wrapper.get('.install-now').trigger('click'); await flushPromises()
  expect(prompt).toHaveBeenCalledTimes(1)
  expect(install.pwaInstallState.guideActive).toBe(false)
  expect(install.pwaInstallState.installed).toBe(false)
  expect(wrapper.get('.install-feedback').text()).toContain(outcome === 'accepted' ? '等待系统完成安装' : outcome === 'dismissed' ? '本次安装已取消' : '系统安装调用失败')
  window.dispatchEvent(new Event('appinstalled')); await flushPromises()
  expect(install.pwaInstallState.installed).toBe(true)
  expect(wrapper.find('.installed-banner').exists()).toBe(true)
  expect(install.pwaInstallState.tutorialCompleted).toBe(false)
  expect(localStorage.getItem(install.PWA_GUIDE_KEY)).toBe(history)
  wrapper.unmount()
  expect(localStorage.getItem(install.PWA_GUIDE_KEY)).toBe(history)
})


it.each([390, 1440])('安装页在%s起步跨断点保留安装入口且不触发系统提示', async width => {
  const originalWidth = window.innerWidth
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  const install = await import('../src/utils/pwaInstall.js')
  const { default: InstallPage } = await import('../src/pages/install/index.vue')
  const wrapper = mount(InstallPage, { attachTo: document.body, global: { stubs: { IslandSidebar: true, SiteFooter: true, RouterLink: { template: '<a><slot /></a>' } } } })
  try {
    const prompt = vi.fn()
    window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt, userChoice: new Promise(() => {}) })); await flushPromises()
    const button = wrapper.get('.install-now').element
    button.focus()
    const phase = install.pwaInstallState.phase
    for (const nextWidth of [640, 641, 767, 768, 1080, 1081, width]) {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: nextWidth })
      window.dispatchEvent(new Event('resize')); await flushPromises()
      expect(wrapper.get('.install-now').element).toBe(button)
      expect(document.activeElement).toBe(button)
      expect(install.pwaInstallState.phase).toBe(phase)
      expect(install.pwaInstallState.guideActive).toBe(false)
      expect(wrapper.findAll('.install-now')).toHaveLength(1)
    }
    expect(prompt).not.toHaveBeenCalled()
    expect(install.pwaInstallState.installed).toBe(false)
  } finally {
    wrapper.unmount()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth })
  }
})
