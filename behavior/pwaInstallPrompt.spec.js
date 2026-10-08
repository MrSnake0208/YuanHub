import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia } from 'pinia'
import { nextTick } from 'vue'

let addListener
beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  addListener = vi.spyOn(window, 'addEventListener')
})

afterEach(() => {
  // Each case imports a new real singleton; remove the old page's global listeners.
  for (const [type, listener] of addListener.mock.calls) {
    if (['beforeinstallprompt', 'appinstalled', 'storage'].includes(type)) window.removeEventListener(type, listener)
  }
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
  const host = mount(component, { global: { plugins: [router, pinia] } })
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
  expect(context.host.get('.pwa-install-primary').text()).toBe('立即添加')
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

it('安装失败恢复也不能覆盖禁止页或资格恢复；卸载清理导航观察器', async () => {
  const context = await main(await browser())
  const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect')
  context.offer('dismissed', vi.fn(async () => { throw new Error('denied') }))
  await reveal()
  await context.host.get('.pwa-install-primary').trigger('click')
  await flushPromises()
  expect(context.host.find('.pwa-install-guide').exists()).toBe(true)
  await context.router.push('/forbidden')
  await reveal()
  expect(context.host.find('aside').exists()).toBe(false)
  await context.router.push('/')
  await context.host.setProps({ accessPending: true })
  await reveal()
  expect(context.host.find('aside').exists()).toBe(false)
  await context.host.setProps({ accessPending: false })
  await reveal()
  expect(context.host.find('.pwa-install-guide').exists()).toBe(true)
  context.host.unmount()
  expect(disconnect).toHaveBeenCalled()
})

it.each(['failed', 'unavailable'])('主站 %s 后权限指南仍可见且可以收起、打开教程、关闭', async outcome => {
  const context = await main(await browser())
  let fail
  const event = context.offer('dismissed', vi.fn(() => new Promise((resolve, reject) => { fail = reject })))
  await reveal()
  const button = context.host.get('.pwa-install-primary')
  let other
  if (outcome === 'unavailable') {
    // Another caller consumes the event after the rendered button, before this click.
    other = context.install.requestPwaInstall()
  }
  await button.trigger('click')
  fail(new Error('permission denied'))
  if (other) await other
  await flushPromises()
  expect(context.host.find('aside').exists()).toBe(true)
  expect(context.host.get('.pwa-install-guide').attributes('aria-live')).toBe('polite')
  expect(context.host.get('.pwa-install-permission').text()).toContain('系统设置 → 应用/应用管理 → 当前浏览器 → 权限/其他权限')
  expect(context.host.get('a').attributes('href')).toBe('/install')
  expect(localStorage.getItem(context.install.PWA_AUTO_SUPPRESSED_KEY)).toBeNull()
  expect(context.install.shouldShowPwaInstallPrompt()).toBe(false)
  await context.host.get('.pwa-install-primary').trigger('click')
  expect(context.host.find('.pwa-install-guide').exists()).toBe(false)
  expect(context.host.find('aside').exists()).toBe(true)
  await context.host.get('.pwa-install-primary').trigger('click')
  expect(context.host.find('.pwa-install-guide').exists()).toBe(true)
  await context.host.get('.pwa-install-close').trigger('click')
  expect(context.host.find('aside').exists()).toBe(false)
  expect(event.prompt).toHaveBeenCalledTimes(1)
})

it('主站 /install、全局弹窗及新手引导暂时隐藏正常邀请与恢复面板', async () => {
  const context = await main(await browser())
  context.offer('dismissed', vi.fn(async () => { throw new Error('permission denied') }))
  await reveal()
  for (const recovery of [false, true]) {
    if (recovery) {
      await context.host.get('.pwa-install-primary').trigger('click')
      await flushPromises()
      expect(context.host.find('.pwa-install-guide').exists()).toBe(true)
    }
    await context.router.push('/install')
    expect(context.host.find('aside').exists()).toBe(false)
    await context.router.push('/')
    expect(context.host.find('aside').exists()).toBe(false)
    await reveal()
    expect(context.host.find('aside').exists()).toBe(true)
    context.dialog._state.visible = true
    await nextTick()
    expect(context.host.find('aside').exists()).toBe(false)
    context.dialog._state.visible = false
    context.onboarding.start('operator-first-entry')
    await nextTick()
    expect(context.host.find('aside').exists()).toBe(false)
    context.onboarding.dismiss()
    await nextTick()
    expect(context.host.find('aside').exists()).toBe(false)
    await reveal()
    expect(context.host.find('aside').exists()).toBe(true)
  }
})

it.each(['accepted', 'dismissed'])('主站 %s 后隐藏当前邀请；只有接受才保存永久推广偏好', async outcome => {
  const context = await main(await browser())
  context.offer(outcome)
  await reveal()
  await context.host.get('.pwa-install-primary').trigger('click')
  await flushPromises()
  expect(context.host.find('aside').exists()).toBe(false)
  expect(context.install.pwaInstallState.standalone).toBe(false)
  expect(localStorage.getItem(context.install.PWA_AUTO_SUPPRESSED_KEY)).toBe(outcome === 'accepted' ? '1' : null)
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

it('主站独立教程只在真实 standalone 显示窗口文案，旧推广偏好仍允许手动安装', async () => {
  const context = await browser({ suppressed: true })
  const { default: guide } = await import('../src/pages/install/index.vue')
  const host = mount(guide, { global: { stubs: { IslandSidebar: true, SiteFooter: true } } })
  context.offer()
  await nextTick()
  expect(host.find('.installed-banner').exists()).toBe(false)
  await host.get('.install-now').trigger('click')
  await flushPromises()
  expect(host.get('.install-feedback').text()).toContain('请等待系统完成')
  expect(host.get('.installed-banner').text()).toContain('请等待系统完成后，从桌面图标打开')
  expect(host.text()).not.toContain('当前已从桌面独立运行')
  context.offer()
  await nextTick()
  expect(host.find('.install-now').exists()).toBe(false)
  expect(context.install.pwaInstallState.standalone).toBe(false)
})

it('iOS 主站无自动邀请，但手动教程仍默认 iPhone 并无假安装按钮', async () => {
  const context = await main(await browser({ ios: true }))
  await reveal()
  expect(context.host.find('aside').exists()).toBe(false)
  const { default: guide } = await import('../src/pages/install/index.vue')
  const host = mount(guide, { global: { stubs: { IslandSidebar: true, SiteFooter: true } } })
  await nextTick()
  expect(host.text()).toContain('iPhone / iPad 不提供网页内的一键安装按钮')
  expect(host.find('.install-now').exists()).toBe(false)
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
