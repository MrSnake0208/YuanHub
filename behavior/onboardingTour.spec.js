import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

let tour
let store
let resizeObservers

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()
  const { createPinia, setActivePinia } = await import('pinia')
  setActivePinia(createPinia())
  const media = new Map()
  vi.stubGlobal('matchMedia', query => {
    if (!media.has(query)) media.set(query, {
      matches: query === '(prefers-reduced-motion: reduce)' || query === '(max-width: 1080px)',
      listeners: new Set(),
      addEventListener(_type, listener) { this.listeners.add(listener) },
      removeEventListener(_type, listener) { this.listeners.delete(listener) }
    })
    return media.get(query)
  })
  vi.stubGlobal('requestAnimationFrame', callback => setTimeout(() => callback(performance.now()), 16))
  vi.stubGlobal('cancelAnimationFrame', frame => clearTimeout(frame))
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback) { this.callback = callback; this.observe = vi.fn(); this.disconnect = vi.fn(); resizeObservers.push(this) }
  })
  resizeObservers = []
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    return new DOMRect(20, 120, this.style.display === 'none' ? 0 : 160, this.style.display === 'none' ? 0 : 48)
  })
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function () {
    return this.style.display === 'none' ? [] : [this.getBoundingClientRect()]
  })
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  tour = await import('../src/utils/onboardingTour.js')
  const { useOnboardingStore } = await import('../src/stores/onboarding.js')
  store = useOnboardingStore().initialize()
})

afterEach(async () => {
  tour.destroyOnboardingTour()
  await Promise.resolve()
})

async function tick(ms = 200) { await vi.advanceTimersByTimeAsync(ms) }

// 真实Memory Router + Driver.js按钮；只用合成DOM/几何，不能代表浏览器排版验收。
async function page({ missingAccount = false } = {}) {
  const connectClick = vi.fn()
  const router = createRouter({ history: createMemoryHistory(), routes: ['/', '/user/profile', '/operator', '/inventory', '/login'].map(path => ({ path, component: { template: '<p />' } })) })
  const render = path => {
    document.querySelector('main')?.remove()
    const main = document.createElement('main')
    const targets = path === '/user/profile' ? ['maayuan-sync', ...(missingAccount ? [] : ['account-create'])]
      : path === '/' ? ['today-overview'] : path === '/operator' ? ['operator-workspace'] : path === '/inventory' ? ['inventory-workspace'] : []
    for (const target of [...targets, 'replay-menu', 'replay-entry']) {
      const button = document.createElement('button')
      button.dataset.tour = target
      button.textContent = target
      if (target === 'replay-entry') button.style.display = 'none'
      if (target === 'maayuan-sync') button.addEventListener('click', connectClick)
      main.append(button)
    }
    document.body.append(main)
  }
  router.afterEach(to => render(to.path))
  await router.push('/')
  await router.isReady()
  return { router, render, connectClick }
}

async function start(router) {
  const pending = tour.startOnboardingTour(router)
  await tick()
  expect(await pending).toBe(true)
}

async function clickNext(ms = 200) {
  const button = document.querySelector('.driver-popover-next-btn')
  expect(button).not.toBeNull()
  button.click()
  await tick(ms)
}

it('真实七步前后与完成：第六步是下一步且不点击连接，手机末步指向关闭抽屉时的菜单按钮', async () => {
  const { router, connectClick } = await page()
  await start(router)
  expect(document.querySelector('.driver-popover-title').textContent).toContain('欢迎')
  for (const id of ['account-create', 'today-overview', 'operator-workspace', 'inventory-workspace', 'maayuan-sync']) {
    await clickNext()
    expect(store.activeStepId).toBe(id)
    expect(document.querySelectorAll('.driver-popover')).toHaveLength(1)
  }
  expect(document.querySelector('.driver-popover-next-btn').textContent).toBe('下一步')
  expect(document.querySelector('.driver-popover-description').textContent).toContain('主动提交后才会生成连接码')
  await clickNext()
  expect(store.activeStepId).toBe('replay-entry')
  expect(document.querySelector('.driver-active-element').dataset.tour).toBe('replay-menu')
  expect(document.querySelector('.driver-popover-description').textContent).toContain('顶部')
  document.querySelector('.driver-popover-prev-btn').click()
  await tick()
  expect(store.activeStepId).toBe('maayuan-sync')
  await clickNext()
  await clickNext()
  expect(store.status).toBe('completed')
  expect(document.querySelector('.driver-popover')).toBeNull()
  expect(connectClick).not.toHaveBeenCalled()
  expect(resizeObservers.every(observer => observer.disconnect.mock.calls.length > 0)).toBe(true)
})

it('目标超时给中心提示，继续后仍能完成，不把整个教程误标为跳过', async () => {
  const { router } = await page({ missingAccount: true })
  await start(router)
  await clickNext(5300)
  expect(store.status).toBe('in_progress')
  expect(document.querySelector('.driver-popover-description').textContent).toContain('暂时无法定位这个入口')
  expect(document.querySelector('.driver-active-element').id).toBe('driver-dummy-element')
  await clickNext()
  expect(store.activeStepId).toBe('today-overview')
  expect(document.querySelector('.driver-active-element').dataset.tour).toBe('today-overview')
})

it('等待目标时取消立即释放等待，晚到DOM不能复活教程', async () => {
  const { router, render } = await page({ missingAccount: true })
  await start(router)
  await clickNext(80)
  tour.destroyOnboardingTour()
  render('/user/profile')
  const lateTarget = document.createElement('button')
  lateTarget.dataset.tour = 'account-create'
  document.querySelector('main').append(lateTarget)
  await tick(6000)
  expect(store.status).toBe('skipped')
  expect(document.querySelector('.driver-popover')).toBeNull()
  expect(vi.getTimerCount()).toBe(0)
})

it('取消旧等待并重看，新会话不会被旧promise的finally清除', async () => {
  const { router } = await page({ missingAccount: true })
  await start(router)
  await clickNext(80)
  const restarting = tour.restartOnboardingTour(router)
  await tick()
  expect(await restarting).toBe(true)
  expect(store.activeStepId).toBe('welcome')
  await tick(6000)
  expect(store.status).toBe('in_progress')
  expect(store.activeStepId).toBe('welcome')
  expect(document.querySelectorAll('.driver-popover')).toHaveLength(1)
})

it('路由等待中取消，晚到路由不显示旧步骤；允许重新启动', async () => {
  const { router } = await page()
  let release
  router.beforeEach(to => to.path === '/user/profile' ? new Promise(resolve => { release = resolve }) : true)
  await start(router)
  await clickNext(80)
  tour.destroyOnboardingTour()
  release(true)
  await tick()
  expect(store.status).toBe('skipped')
  expect(document.querySelector('.driver-popover')).toBeNull()
  const restarting = tour.restartOnboardingTour(router)
  await tick()
  expect(await restarting).toBe(true)
  expect(store.activeStepId).toBe('welcome')
})

it('权限重定向不高亮登录页，也不把教程步骤标记完成', async () => {
  const { router } = await page()
  router.beforeEach(to => to.path === '/user/profile' ? '/login' : true)
  await start(router)
  await clickNext()
  expect(router.currentRoute.value.path).toBe('/login')
  expect(store.status).toBe('skipped')
  expect(document.querySelector('.driver-popover')).toBeNull()
})

it('几何变化期间不提前高亮，稳定后才显示；观察器离开时清理', async () => {
  const { router } = await page()
  await router.push('/user/profile')
  const target = document.querySelector('[data-tour="account-create"]')
  let y = 120
  const rect = vi.spyOn(target, 'getBoundingClientRect').mockImplementation(() => new DOMRect(20, y++, 160, 48))
  store.start('account-create')
  const pending = tour.resumeOnboardingTour(router)
  await tick(300)
  expect(document.querySelector('.driver-popover-description').textContent).toContain('正在准备')
  expect(document.querySelector('.driver-active-element').id).toBe('driver-dummy-element')
  rect.mockImplementation(() => new DOMRect(20, 200, 160, 48))
  await tick()
  expect(await pending).toBe(true)
  expect(document.querySelector('.driver-active-element')).toBe(target)
  const observer = resizeObservers.at(-1)
  expect(observer.observe).toHaveBeenCalledWith(target)
  observer.callback([])
  await tick()
  tour.destroyOnboardingTour()
  expect(observer.disconnect).toHaveBeenCalled()
})

it('持续不稳定的目标有界退回中心提示，关闭期间停止几何帧', async () => {
  const { router } = await page()
  await router.push('/user/profile')
  const target = document.querySelector('[data-tour="account-create"]')
  let y = 100
  vi.spyOn(target, 'getBoundingClientRect').mockImplementation(() => new DOMRect(20, y++, 160, 48))
  store.start('account-create')
  const pending = tour.resumeOnboardingTour(router)
  await tick(1800)
  expect(await pending).toBe(true)
  expect(document.querySelector('.driver-popover-description').textContent).toContain('暂时无法定位')
  tour.destroyOnboardingTour()
  await tick()
  expect(vi.getTimerCount()).toBe(0)
})

it('关闭真实按钮恢复入口焦点；重复启动和下一步不会创建重复实例或跳两步', async () => {
  const { router } = await page()
  const opener = document.querySelector('[data-tour="replay-menu"]')
  opener.focus()
  const first = tour.startOnboardingTour(router)
  expect(tour.startOnboardingTour(router)).toBe(first)
  await tick()
  expect(await first).toBe(true)
  document.querySelector('.driver-popover-close-btn').click()
  await tick()
  expect(store.status).toBe('skipped')
  expect(document.activeElement).toBe(opener)
  const restarting = tour.restartOnboardingTour(router)
  await tick()
  await restarting
  const button = document.querySelector('.driver-popover-next-btn')
  button.click(); button.click()
  await tick()
  expect(store.activeStepId).toBe('account-create')
  expect(document.querySelectorAll('.driver-popover')).toHaveLength(1)
})

it('内部跨路由保留教程，用户主动换页则取消当前等待', async () => {
  const { router } = await page({ missingAccount: true })
  const stop = tour.initializeOnboardingTour(router)
  await tick()
  await clickNext(80)
  expect(store.status).toBe('in_progress')
  await router.push('/inventory')
  await tick(6000)
  expect(store.status).toBe('skipped')
  expect(document.querySelector('.driver-popover')).toBeNull()
  stop()
})

it('末步跨越导航断点会重新定位可见入口，关闭后移除媒体监听', async () => {
  const { router } = await page()
  store.start('replay-entry')
  const pending = tour.resumeOnboardingTour(router)
  await tick()
  expect(await pending).toBe(true)
  const media = matchMedia('(max-width: 1080px)')
  document.querySelector('[data-tour="replay-entry"]').style.display = ''
  media.matches = false
  for (const listener of media.listeners) listener({ matches: false })
  await tick()
  expect(document.querySelector('.driver-active-element').dataset.tour).toBe('replay-entry')
  media.matches = true
  for (const listener of media.listeners) listener({ matches: true })
  await tick()
  expect(document.querySelector('.driver-active-element').dataset.tour).toBe('replay-menu')
  tour.destroyOnboardingTour()
  expect(media.listeners.size).toBe(0)
})

it('等待中的真实关闭按钮可退出；晚到目标不能再次显示', async () => {
  const { router } = await page({ missingAccount: true })
  await start(router)
  await clickNext(300)
  expect(document.querySelector('.driver-popover-description').textContent).toContain('正在准备')
  expect(document.querySelector('.driver-popover-next-btn').disabled).toBe(true)
  document.querySelector('.driver-popover-close-btn').click()
  const target = document.createElement('button')
  target.dataset.tour = 'account-create'
  document.querySelector('main').append(target)
  await tick(6000)
  expect(store.status).toBe('skipped')
  expect(document.querySelector('.driver-popover')).toBeNull()
  expect(vi.getTimerCount()).toBe(0)
})

it.each([true, '/login'])('旧路由等待中先重看，再返回%s，不改变新会话或新页面', async result => {
  const { router } = await page()
  const stop = tour.initializeOnboardingTour(router)
  await tick()
  let release
  router.beforeEach(to => to.path === '/user/profile' ? new Promise(resolve => { release = resolve }) : true)
  await clickNext(300)
  const restarting = tour.restartOnboardingTour(router)
  await tick()
  expect(await restarting).toBe(true)
  release(result)
  await tick()
  expect(router.currentRoute.value.path).toBe('/')
  expect(store.activeStepId).toBe('welcome')
  expect(store.status).toBe('in_progress')
  expect(document.querySelectorAll('.driver-popover')).toHaveLength(1)
  stop()
})

it.each([true, '/login'])('旧路由仍等待时重看后主动换页，旧结果%s不抢回页面', async result => {
  const { router } = await page()
  const stop = tour.initializeOnboardingTour(router)
  await tick()
  let release
  router.beforeEach(to => to.path === '/user/profile' ? new Promise(resolve => { release = resolve }) : true)
  await clickNext(300)
  const restarting = tour.restartOnboardingTour(router)
  await tick()
  await restarting
  await router.push('/inventory')
  release(result)
  await tick()
  expect(router.currentRoute.value.path).toBe('/inventory')
  expect(store.status).toBe('skipped')
  expect(document.querySelector('.driver-popover')).toBeNull()
  stop()
})

it('取消旧路由后用户再次进入同一目标，正常权限重定向仍保留', async () => {
  const { router } = await page()
  const stop = tour.initializeOnboardingTour(router)
  await tick()
  let release
  let first = true
  router.beforeEach(to => {
    if (to.path !== '/user/profile') return true
    if (first) { first = false; return new Promise(resolve => { release = resolve }) }
    return '/login'
  })
  await clickNext(300)
  tour.destroyOnboardingTour()
  await router.push('/user/profile')
  expect(router.currentRoute.value.path).toBe('/login')
  release('/login')
  await tick()
  expect(router.currentRoute.value.path).toBe('/login')
  expect(store.status).toBe('skipped')
  stop()
})

it('末步准备期间键盘右箭头不提前完成；目标超时提示后仍可主动完成', async () => {
  const { router } = await page()
  document.querySelector('[data-tour="replay-menu"]').remove()
  store.start('replay-entry')
  const pending = tour.resumeOnboardingTour(router)
  await tick(300)
  window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }))
  await tick(100)
  expect(store.status).toBe('in_progress')
  expect(document.querySelector('.driver-popover-description').textContent).toContain('正在准备')
  await tick(5000)
  expect(await pending).toBe(true)
  expect(store.status).toBe('in_progress')
  await clickNext()
  expect(store.status).toBe('completed')
})
