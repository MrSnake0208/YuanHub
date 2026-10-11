// Keep the existing tutorial implementation covered through explicit opt-in.
vi.hoisted(() => vi.stubEnv('VITE_TUTORIALS_ENABLED', 'true'))
afterAll(() => vi.unstubAllEnvs())
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia } from 'pinia'
import { nextTick } from 'vue'

let addListener, documentListener
beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  addListener = vi.spyOn(window, 'addEventListener')
  documentListener = vi.spyOn(document, 'addEventListener')
})

afterEach(() => {
  // Each case imports a new real singleton; remove the old page's global listeners.
  for (const [type, listener] of addListener.mock.calls) {
    if (['beforeinstallprompt', 'appinstalled', 'storage', 'focus', 'pageshow', 'keydown'].includes(type)) window.removeEventListener(type, listener)
  }
  for (const [type, listener] of documentListener.mock.calls) if (type === 'visibilitychange') document.removeEventListener(type, listener)
  document.body.classList.remove('mobile-nav-open')
})

async function browser({ ios = false, mobile = true, standalone = false, suppressed = false, promo = false } = {}) {
  const media = new Map()
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ios ? 'iPhone Safari' : 'Desktop Chromium')
  vi.stubGlobal('matchMedia', query => {
    if (!media.has(query)) media.set(query, {
      matches: query === '(display-mode: standalone)' ? standalone : mobile,
      listeners: new Set(),
      addEventListener(type, listener) { if (type === 'change') this.listeners.add(listener) },
      removeEventListener(type, listener) { if (type === 'change') this.listeners.delete(listener) },
      setMatches(matches) {
        this.matches = matches
        for (const listener of this.listeners) listener({ matches })
      }
    })
    return media.get(query)
  })
  if (suppressed) localStorage.setItem('yuanhub:pwa-install-auto-suppressed:v1', '1')
  const install = promo ? await import('../promo-site/src/pwaInstall.js') : await import('../src/utils/pwaInstall.js')
  install.initPwaInstall()
  function offer(outcome = 'accepted', prompt = vi.fn(async () => {})) {
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt, userChoice: Promise.resolve({ outcome })
    })
    window.dispatchEvent(event)
    return event
  }
  return { install, offer, media }
}

async function main(context, path = '/') {
  const { default: component } = await import('../src/components/MobileInstallPrompt.vue')
  const pages = [['/', 'today'], ['/install', 'install'], ['/operator/share/:token?', 'operator-share'], ['/demo', 'demo-growth-planner'], ['/promo', 'promo'], ['/changelog', 'changelog'], ['/feedback/plaza', 'feedback-plaza'], ['/login', 'login'], ['/register', 'register'], ['/forgot', 'forgot'], ['/forbidden', 'forbidden'], ['/beta', 'beta'], ['/user/profile', 'profile'], ['/star', 'star'], ['/inventory', 'inventory'], ['/manage', 'manage'], ['/unknown', 'not-found']]
  const router = createRouter({ history: createMemoryHistory(), routes: pages.map(([path, name]) => ({ path, name, component: { template: '<p />' } })) })
  await router.push(path)
  await router.isReady()
  const pinia = createPinia()
  const host = mount(component, { attachTo: document.body, global: { plugins: [router, pinia] } })
  const { dialog } = await import('../src/utils/dialog.js')
  const { useOnboardingStore } = await import('../src/stores/onboarding.js')
  return { ...context, host, router, dialog, onboarding: useOnboardingStore(pinia) }
}

async function reveal() {
  await vi.advanceTimersByTimeAsync(1800)
  await nextTick()
}

it('真实主站组件只在 1.8 秒后邀请', async () => {
  const context = await main(await browser())
  context.offer()
  await vi.advanceTimersByTimeAsync(1799)
  expect(context.host.find('aside').exists()).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  expect(context.host.get('aside').attributes('aria-label')).toBe('添加 YuanHub 到桌面')
  expect(context.host.get('.pwa-install-primary').text()).toBe('跟着做一次')
})

it('主站卸载组件会清理尚未触发的展示计时器', async () => {
  const { host } = await main(await browser())
  const before = vi.getTimerCount()
  host.unmount()
  expect(vi.getTimerCount()).toBe(before - 1)
})

it('主站无事件时不邀请；延迟后到达有效事件才显示', async () => {
  const { host, offer } = await main(await browser())
  await reveal()
  expect(host.find('aside').exists()).toBe(false)
  offer()
  await nextTick()
  expect(host.find('aside').exists()).toBe(true)
})

it.each(['/login', '/register', '/forgot', '/forbidden', '/install', '/operator/share', '/operator/share/code', '/demo', '/promo', '/beta', '/user/profile', '/star', '/inventory', '/manage', '/unknown'])('主站 %s 默认禁止自动邀请，换到允许页才重新计时', async path => {
  const context = await main(await browser(), path)
  context.offer()
  await reveal()
  expect(context.host.find('aside').exists()).toBe(false)
  await context.router.push('/changelog')
  await vi.advanceTimersByTimeAsync(1799)
  expect(context.host.find('aside').exists()).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  expect(context.host.find('aside').exists()).toBe(true)
})

it('主站换到另一允许页也重新等待；反馈广场可邀请', async () => {
  const context = await main(await browser())
  context.offer()
  await reveal()
  await context.router.push('/feedback/plaza')
  expect(context.host.find('aside').exists()).toBe(false)
  await reveal()
  expect(context.host.find('aside').exists()).toBe(true)
})

it.each(['routeLoading', 'accessPending'])('主站 %s 期间不邀请，恢复后重新等待完整延迟', async prop => {
  const context = await main(await browser())
  context.offer()
  await reveal()
  await context.host.setProps({ [prop]: true })
  await vi.advanceTimersByTimeAsync(3000)
  expect(context.host.find('aside').exists()).toBe(false)
  await context.host.setProps({ [prop]: false })
  await vi.advanceTimersByTimeAsync(1799)
  expect(context.host.find('aside').exists()).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  expect(context.host.find('aside').exists()).toBe(true)
})

it('导航抽屉与内测群模态均抑制邀请，关闭后重新等待', async () => {
  const context = await main(await browser())
  const { betaCommunity } = await import('../src/store/betaCommunity.js')
  context.offer()
  await reveal()
  document.body.classList.add('mobile-nav-open')
  await flushPromises()
  expect(context.host.find('aside').exists()).toBe(false)
  await vi.advanceTimersByTimeAsync(2000)
  expect(context.host.find('aside').exists()).toBe(false)
  document.body.classList.remove('mobile-nav-open')
  await flushPromises()
  await reveal()
  expect(context.host.find('aside').exists()).toBe(true)
  betaCommunity.open()
  await nextTick()
  expect(context.host.find('aside').exists()).toBe(false)
  betaCommunity.close()
  await nextTick()
  expect(context.host.find('aside').exists()).toBe(false)
  await reveal()
  expect(context.host.find('aside').exists()).toBe(true)
})

it('共享焦点栈的嵌套模态必须全部关闭后才能邀请', async () => {
  const context = await main(await browser())
  const { defineComponent, h, ref } = await import('vue')
  const { useModalFocus, modalFocusState } = await import('../src/composables/useModalFocus.js')
  const Modal = defineComponent({ setup() {
    const panel = ref(null)
    useModalFocus(() => true, panel, { initialFocus: () => panel.value, onEscape() {} })
    return () => h('section', { ref: panel, tabindex: '-1' }, [h('button', '返回')])
  } })
  context.offer()
  await reveal()
  const parent = mount(Modal, { attachTo: document.body })
  const child = mount(Modal, { attachTo: document.body })
  await nextTick()
  expect(modalFocusState.active).toBe(true)
  expect(context.host.find('aside').exists()).toBe(false)
  child.unmount()
  await reveal()
  expect(modalFocusState.active).toBe(true)
  expect(context.host.find('aside').exists()).toBe(false)
  parent.unmount()
  await nextTick()
  expect(modalFocusState.active).toBe(false)
  await reveal()
  expect(context.host.find('aside').exists()).toBe(true)
})

async function startAndInstall(context) {
  await context.host.get('.pwa-install-primary').trigger('click')
  await nextTick()
  await context.host.get('.pwa-install-primary').trigger('click')
  await flushPromises()
}

it.each(['accepted', 'dismissed', 'failed'])('主动参加后 %s 留在真实任务且始终可退出', async outcome => {
  const context = await main(await browser())
  const event = context.offer(outcome, vi.fn(async () => { if (outcome === 'failed') throw new Error('native failed') }))
  await reveal()
  expect(context.host.text()).toContain('直接使用 / 暂时关闭')
  await startAndInstall(context)
  expect(context.host.find('aside').exists()).toBe(true)
  expect(context.install.pwaInstallState.installed).toBe(false)
  expect(context.install.pwaInstallState.tutorialCompleted).toBe(false)
  expect(context.host.get('.pwa-install-close').text()).toBe('关闭教程 / 退出引导')
  if (outcome === 'accepted') expect(context.host.get('.pwa-install-guide').text()).toContain('等待系统完成安装')
  if (outcome === 'dismissed') expect(context.host.get('.pwa-install-guide').text()).toContain('已取消')
  if (outcome === 'failed') expect(context.host.get('.pwa-install-guide').text()).toContain('调用失败')
  expect(context.host.get('a').attributes('href')).toBe('/install')
  expect(localStorage.getItem(context.install.PWA_AUTO_SUPPRESSED_KEY)).toBeNull()
  await context.host.get('.pwa-install-close').trigger('click')
  expect(context.host.find('aside').exists()).toBe(false)
  expect(context.install.pwaInstallState.dismissedForNow).toBe(true)
  expect(context.install.pwaInstallState.tutorialCompleted).toBe(false)
  expect(event.prompt).toHaveBeenCalledTimes(1)
})

it('直接使用 / Esc 关闭不消费真实事件；明确禁用才保存禁用偏好', async () => {
  const context = await main(await browser())
  const event = context.offer()
  await reveal()
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  await nextTick()
  expect(context.host.find('aside').exists()).toBe(false)
  expect(event.prompt).not.toHaveBeenCalled()
  expect(context.install.pwaInstallState.installable).toBe(true)
  expect(context.install.pwaInstallState.disableAutoGuide).toBe(false)
  expect(context.install.pwaInstallState.tutorialCompleted).toBe(false)
  context.install.closePwaInstallGuide({ disableAutoGuide: true })
  context.install.clearPwaInstallDismissal()
  context.offer()
  await reveal()
  expect(context.host.find('aside').exists()).toBe(false)
})

it('待系统选择时可退出；appinstalled 保留事实但不会重开教程', async () => {
  const context = await main(await browser())
  let resolvePrompt
  context.offer('accepted', vi.fn(() => new Promise(resolve => { resolvePrompt = resolve })))
  await reveal()
  await context.host.get('.pwa-install-primary').trigger('click')
  await context.host.get('.pwa-install-primary').trigger('click')
  await context.host.get('.pwa-install-close').trigger('click')
  resolvePrompt(); await flushPromises()
  window.dispatchEvent(new Event('appinstalled')); await nextTick()
  expect(context.host.find('aside').exists()).toBe(false)
  expect(context.install.pwaInstallState.installed).toBe(true)
  expect(context.install.pwaInstallState.tutorialCompleted).toBe(false)
  context.install.startPwaInstallGuide()
  expect(context.install.pwaInstallState.tutorialCompleted).toBe(true)
})

it('跨业务页面暂停教程，安装任务页则接续；导航观察器卸载清理', async () => {
  const context = await main(await browser())
  const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect')
  context.offer()
  await reveal()
  await context.host.get('.pwa-install-primary').trigger('click')
  await context.router.push('/install')
  expect(context.install.pwaInstallState.guideActive).toBe(true)
  expect(context.host.find('aside').exists()).toBe(false)
  await context.router.push('/inventory')
  expect(context.install.pwaInstallState.guideActive).toBe(false)
  expect(context.install.pwaInstallState.tutorialCompleted).toBe(false)
  await context.router.push('/')
  await reveal()
  expect(context.host.find('aside').exists()).toBe(false)
  context.host.unmount()
  expect(disconnect).toHaveBeenCalled()
})

it('appinstalled 后结束主动教程；accepted 不结束', async () => {
  const context = await main(await browser())
  context.offer()
  await reveal()
  await startAndInstall(context)
  expect(context.host.find('aside').exists()).toBe(true)
  window.dispatchEvent(new Event('appinstalled')); await nextTick()
  expect(context.install.pwaInstallState.tutorialCompleted).toBe(true)
  expect(context.host.find('aside').exists()).toBe(false)
})

it.each(['routeLoading', 'accessPending'])('已参加者 %s 期间仍能立即退出教程', async prop => {
  const context = await main(await browser())
  context.offer()
  await reveal()
  await context.host.get('.pwa-install-primary').trigger('click')
  await context.host.setProps({ [prop]: true })
  expect(context.host.get('.pwa-install-close').text()).toContain('退出引导')
  await context.host.get('.pwa-install-close').trigger('click')
  expect(context.install.pwaInstallState.guideActive).toBe(false)
  expect(context.install.pwaInstallState.tutorialCompleted).toBe(false)
})

it('业务模态打开时暂停教程，不覆盖录入或关闭模态后自动重开', async () => {
  const context = await main(await browser())
  context.offer()
  await reveal()
  await context.host.get('.pwa-install-primary').trigger('click')
  context.dialog._state.visible = true
  await nextTick()
  expect(context.install.pwaInstallState.guideActive).toBe(false)
  expect(context.dialog._state.visible).toBe(true)
  context.dialog._state.visible = false
  await reveal()
  expect(context.host.find('aside').exists()).toBe(false)
})

it('其他调用方的恢复状态不会让主站组件挂载时自动展示', async () => {
  const context = await browser()
  await context.install.requestPwaInstall()
  const { host } = await main(context)
  await reveal()
  expect(host.find('aside').exists()).toBe(false)
})

it('主站真实 viewport 变化与同 origin 偏好事件会即时隐藏面板', async () => {
  const context = await main(await browser())
  context.offer()
  await reveal()
  expect(context.host.find('aside').exists()).toBe(true)
  const query = context.media.get(context.install.PWA_MOBILE_VIEWPORT_QUERY)
  query.setMatches(false)
  await nextTick()
  expect(context.host.find('aside').exists()).toBe(false)
  query.setMatches(true)
  await nextTick()
  expect(context.host.find('aside').exists()).toBe(true)
  localStorage.setItem(context.install.PWA_AUTO_SUPPRESSED_KEY, '1')
  window.dispatchEvent(new StorageEvent('storage', { key: context.install.PWA_AUTO_SUPPRESSED_KEY, storageArea: localStorage }))
  await nextTick()
  expect(context.host.find('aside').exists()).toBe(false)
})

it('旧推广偏好不冒充安装，手动开始后 accepted 仍只等待', async () => {
  const context = await browser({ suppressed: true })
  const { default: guide } = await import('../src/pages/install/index.vue')
  const host = mount(guide, { global: { stubs: { IslandSidebar: true, SiteFooter: true, RouterLink: true } } })
  context.offer(); await nextTick()
  expect(host.find('.installed-banner').exists()).toBe(false)
  await host.get('.install-now').trigger('click')
  await host.get('.install-now').trigger('click'); await flushPromises()
  expect(host.get('.install-feedback').text()).toContain('等待系统完成安装')
  expect(host.find('.installed-banner').exists()).toBe(false)
  expect(context.install.pwaInstallState.installed).toBe(false)
})

it('iOS 无自动邀请，主动参加才显示真实分享菜单动作', async () => {
  const context = await main(await browser({ ios: true }))
  await reveal()
  expect(context.host.find('aside').exists()).toBe(false)
  const { default: guide } = await import('../src/pages/install/index.vue')
  const host = mount(guide, { global: { stubs: { IslandSidebar: true, SiteFooter: true, RouterLink: true } } })
  await host.get('.install-now').trigger('click')
  expect(host.get('.install-feedback').text()).toContain('Safari 的“分享”菜单')
  expect(host.text()).not.toContain('立即添加到桌面')
  expect(context.install.pwaInstallState.tutorialCompleted).toBe(false)
})

async function promo(context, open = false) {
  const { default: component } = await import('../promo-site/src/PromoInstallPrompt.vue')
  const host = mount(component, { props: {
    open,
    'onUpdate:open': value => host.setProps({ open: value })
  } })
  return { ...context, host }
}

it('宣传站停止自动推广后手动面板仍可打开，接受后普通窗口不冒充桌面运行', async () => {
  const context = await promo(await browser({ promo: true, suppressed: true }))
  const event = context.offer()
  await reveal()
  expect(context.host.find('aside').exists()).toBe(false)
  await context.host.setProps({ open: true })
  expect(context.host.get('.promo-install-title').text()).toBe('先把 YuanHub 保存到桌面')
  await context.host.get('.promo-install-primary').trigger('click')
  await flushPromises()
  expect(event.prompt).toHaveBeenCalledTimes(1)
  expect(context.host.find('aside').exists()).toBe(false)
  await context.host.setProps({ open: true })
  expect(context.host.text()).not.toContain('当前已经以独立窗口运行')
  expect(context.host.get('.promo-install-primary').text()).toBe('查看添加方法')
})

it('宣传站自动邀请失败后保留恢复指南，收起指南不会关闭面板', async () => {
  const context = await promo(await browser({ promo: true }))
  context.offer('dismissed', vi.fn(async () => { throw new Error('permission denied') }))
  await reveal()
  await context.host.get('.promo-install-primary').trigger('click')
  await flushPromises()
  expect(context.host.find('aside').exists()).toBe(true)
  expect(context.host.get('.promo-install-permission').text()).toContain('权限/其他权限')
  await context.host.get('.promo-install-primary').trigger('click')
  expect(context.host.find('.promo-install-guide').exists()).toBe(false)
  expect(context.host.find('aside').exists()).toBe(true)
})

it('宣传站 iOS 手动打开显示分享教程；真实 standalone 才显示独立窗口文案', async () => {
  const context = await promo(await browser({ promo: true, ios: true }))
  await reveal()
  expect(context.host.find('aside').exists()).toBe(false)
  await context.host.setProps({ open: true })
  expect(context.host.get('.promo-install-guide').text()).toContain('“分享”菜单')
  expect(context.host.text()).not.toContain('立即添加')
  context.media.get('(display-mode: standalone)').setMatches(true)
  await nextTick()
  expect(context.host.get('.promo-install-title').text()).toBe('YuanHub 已从桌面打开')
  expect(context.host.find('.promo-install-guide').exists()).toBe(false)
})
