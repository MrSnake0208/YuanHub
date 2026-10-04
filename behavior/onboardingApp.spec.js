import { beforeEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import App from '../src/App.vue'
import { auth } from '../src/store/auth.js'
import { beta } from '../src/store/beta.js'
import { routeLoadingState } from '../src/router/index.js'
import { destroyOnboardingTour, initializeOnboardingTour } from '../src/utils/onboardingTour.js'

const hooks = vi.hoisted(() => ({ stop: vi.fn() }))
vi.mock('../src/utils/onboardingTour.js', () => ({ initializeOnboardingTour: vi.fn(() => hooks.stop), destroyOnboardingTour: vi.fn() }))
vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  return { auth: reactive({ accessToken: 'synthetic', userInfo: { id: 'user-a' }, isAdmin: false }) }
})
vi.mock('../src/store/beta.js', async () => {
  const { reactive } = await import('vue')
  return { beta: reactive({ campaign: { accessMode: 'BETA' }, publicError: '', canUseBetaFeatures: true, publicLoading: false, personalLoading: false, personalLoaded: true, setIdentity: vi.fn(), subscribe: () => vi.fn() }) }
})
vi.mock('../src/router/index.js', async () => {
  const { reactive } = await import('vue')
  return { routeLoadingState: reactive({ active: false }) }
})
vi.mock('../src/store/activeAccount.js', () => ({ activeAccount: { id: 'account-a' } }))
vi.mock('../src/store/accountEvents.js', () => ({ stopAccountEventStream: vi.fn(), subscribeAccountEvents: () => vi.fn(), syncAccountEventStream: vi.fn() }))
vi.mock('../src/store/notificationUnread.js', () => ({ subscribeNotificationUnread: () => vi.fn() }))
vi.mock('../src/components/VersionUpdateBanner.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../src/components/AccountEventToasts.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../src/components/beta/BetaCommunityDialog.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../src/components/AppDialog.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../src/components/MobileInstallPrompt.vue', () => ({ default: { name: 'MobileInstallPrompt', props: ['routeLoading', 'accessPending'], template: '<aside />' } }))

beforeEach(() => {
  vi.clearAllMocks()
  auth.userInfo = { id: 'user-a' }
  auth.accessToken = 'synthetic'
  beta.campaign = { accessMode: 'BETA' }
  beta.publicError = ''
  beta.canUseBetaFeatures = true
  beta.publicLoading = false
  beta.personalLoading = false
  beta.personalLoaded = true
  routeLoadingState.active = false
})

async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', name: 'today', meta: { requiresBeta: true }, component: { template: '<main />' } },
    { path: '/user/profile', name: 'profile', meta: { requiresAuth: true }, component: { template: '<main />' } },
    { path: '/changelog', name: 'changelog', component: { template: '<main />' } }
  ] })
  await router.push('/')
  await router.isReady()
  const host = mount(App, { global: { plugins: [router] } })
  return { router, host }
}

it('个人中心是教程宿主；第二/六步内部进入不会停止控制器，离开宿主才停止', async () => {
  const { router } = await render()
  expect(initializeOnboardingTour).toHaveBeenCalledTimes(1)
  await router.push('/user/profile')
  await nextTick()
  expect(hooks.stop).not.toHaveBeenCalled()
  expect(initializeOnboardingTour).toHaveBeenCalledTimes(1)
  await router.push('/changelog')
  await nextTick()
  expect(hooks.stop).toHaveBeenCalledTimes(1)
})

it('身份切换会取消旧教程，初次加载身份不误取消', async () => {
  await render()
  expect(destroyOnboardingTour).not.toHaveBeenCalled()
  auth.userInfo = { id: 'user-b' }
  await nextTick()
  expect(destroyOnboardingTour).toHaveBeenCalledTimes(1)
})

it('App把真实路由加载及资格恢复状态传给安装提示', async () => {
  const { host } = await render()
  const prompt = host.findComponent({ name: 'MobileInstallPrompt' })
  expect(prompt.props('accessPending')).toBe(false)
  routeLoadingState.active = true
  beta.personalLoading = true
  await nextTick()
  expect(prompt.props('routeLoading')).toBe(true)
  expect(prompt.props('accessPending')).toBe(true)
  beta.personalLoading = false
  beta.canUseBetaFeatures = false
  beta.personalLoaded = false
  await nextTick()
  expect(prompt.props('accessPending')).toBe(true)
})

it('OPEN游客可用的今日一览不被登录资格getter误抑制；加载或错误仍抑制', async () => {
  auth.accessToken = ''
  auth.userInfo = null
  beta.canUseBetaFeatures = false
  beta.personalLoaded = false
  beta.campaign = { accessMode: 'OPEN' }
  const { host } = await render()
  const prompt = host.findComponent({ name: 'MobileInstallPrompt' })
  expect(prompt.props('accessPending')).toBe(false)
  beta.publicLoading = true
  await nextTick()
  expect(prompt.props('accessPending')).toBe(true)
  beta.publicLoading = false
  beta.publicError = '暂时无法确认活动状态'
  await nextTick()
  expect(prompt.props('accessPending')).toBe(true)
  beta.publicError = ''
  await nextTick()
  expect(prompt.props('accessPending')).toBe(false)
})
