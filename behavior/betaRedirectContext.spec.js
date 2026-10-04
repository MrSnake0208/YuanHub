import { beforeEach, expect, it, vi } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { reactive } from 'vue'
import BetaPage from '../src/pages/beta/index.vue'
import LoginPage from '../src/pages/user/login.vue'
import NotFoundPage from '../src/pages/site/not-found.vue'
import { beta } from '../src/store/beta.js'
import { auth } from '../src/store/auth.js'

const route = reactive({ query: {}, fullPath: '/beta' })
const resolve = vi.fn(path => ({ name: path.startsWith('/inventory') ? 'inventory' : 'today', meta: { requiresBeta: true, title: path.startsWith('/inventory') ? '库存 — YuanHub' : '今日一览 — YuanHub' } }))
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ resolve, push: vi.fn() }) }))
vi.mock('../src/store/auth.js', () => ({ auth: reactive({ accessToken: 'test-only', userInfo: { id: 'test' }, isLoggedIn: true, isAdmin: false }) }))
vi.mock('../src/store/beta.js', () => ({ beta: reactive({
  campaign: { accessMode: 'OPEN', publicState: 'OPEN' }, mine: null,
  publicError: '', personalError: '', publicLoading: false, personalLoading: false,
  subscribe: vi.fn(() => vi.fn())
}) }))

const renderBeta = () => mount(BetaPage, { global: { stubs: { RouterLink: RouterLinkStub, SiteFooter: true } } })

beforeEach(() => {
  route.query = {}
  auth.isLoggedIn = true
  route.fullPath = '/beta'
  resolve.mockClear()
  beta.campaign = { accessMode: 'OPEN', publicState: 'OPEN' }
  beta.mine = null
  beta.personalError = ''
  beta.publicError = ''
})

it.each(['/', '/today', '/beta?redirect=%2Finventory', '//evil.invalid', '/%2fevil.invalid', '/login', '/%5cevil.invalid'])('普通首页或无效回跳 %s 不冒充具体功能来源', redirect => {
  route.query = { redirect }
  const wrapper = renderBeta()
  expect(wrapper.find('.beta-redirect-note').exists()).toBe(false)
  wrapper.unmount()
})

it.each(['guest', 'waiting', 'error'])('无资格状态 %s 的公共出口可离开内测页', state => {
  beta.campaign = { accessMode: 'BETA', publicState: 'FULL' }
  if (state === 'guest') auth.isLoggedIn = false
  if (state === 'waiting') beta.mine = { enrollmentStatus: 'WAITING', canUseBetaFeatures: false }
  if (state === 'error') beta.publicError = 'offline'
  const wrapper = renderBeta()
  const exit = wrapper.findAllComponents(RouterLinkStub).filter(link => ['beta-home-link', 'beta-brand-link'].some(name => link.classes().includes(name)))
  expect(exit).toHaveLength(2)
  expect(exit.every(link => link.props('to') === '/promo')).toBe(true)
  expect(wrapper.get('.beta-home-link').text()).toBe('了解 YuanHub')
  wrapper.unmount()
})

it('被守卫带到内测页时说明来源、资格和回跳动作', () => {
  route.query = { redirect: '/inventory?tab=rewards' }
  beta.campaign = { accessMode: 'BETA', publicState: 'OPEN_REGISTRATION' }
  const wrapper = renderBeta()
  const note = wrapper.get('.beta-redirect-note')
  expect(note.text()).toContain('你刚才想打开「库存」')
  expect(note.text()).toContain('需要体验资格')
  expect(note.text()).toContain('资格开通后点击「返回库存」')
})

it('资格已开放时直接给出返回来源页面的动作', () => {
  route.query = { redirect: '/inventory?tab=rewards' }
  const wrapper = renderBeta()
  expect(wrapper.get('.beta-redirect-note').text()).toContain('现在可以点击「返回库存」继续')
  const entry = wrapper.findAllComponents(RouterLinkStub).find(link => link.props('to') === '/inventory?tab=rewards')
  expect(entry?.text()).toContain('返回库存')
})

it('主动访问内测页不会伪称来自其他页面', () => {
  const wrapper = renderBeta()
  expect(wrapper.find('.beta-redirect-note').exists()).toBe(false)
  expect(wrapper.text()).toContain('进入 YuanHub')
})

it('手动退出后登录页给出可见结果', () => {
  route.query = { loggedOut: '1' }
  const wrapper = mount(LoginPage, { global: { stubs: { RouterLink: RouterLinkStub, AuthLayout: { template: '<div><slot /></div>' }, BetaNotice: true } } })
  expect(wrapper.get('[role="status"]').text()).toContain('已退出登录')
})

it('404 页面提供明确说明和返回首页链接', () => {
  const wrapper = mount(NotFoundPage, { global: { stubs: { IslandSidebar: true, RouterLink: RouterLinkStub } } })
  expect(wrapper.get('h1').text()).toContain('没有你要找的页面')
  expect(wrapper.getComponent(RouterLinkStub).props('to')).toBe('/')
  expect(wrapper.getComponent(RouterLinkStub).text()).toBe('返回首页')
})
