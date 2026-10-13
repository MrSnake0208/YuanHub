import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import { reactive } from 'vue'
import AuthLayout from '../src/components/AuthLayout.vue'
import { auth } from '../src/store/auth.js'
import LoginPage from '../src/pages/user/login.vue'
import RegisterPage from '../src/pages/user/register.vue'
import ForgotPage from '../src/pages/user/forgot.vue'

const route = reactive({ query: {} })
const { push, register, sendRegistrationToken, sendResetVCode, resetPassword } = vi.hoisted(() => ({
  push: vi.fn(), register: vi.fn(), sendRegistrationToken: vi.fn(), sendResetVCode: vi.fn(), resetPassword: vi.fn()
}))
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ push }) }))
vi.mock('../src/store/auth.js', () => ({ auth: { login: vi.fn() } }))
vi.mock('../src/api/user.js', () => ({ register, sendRegistrationToken, sendResetVCode, resetPassword }))

const mountPage = Page => mount(Page, { global: { stubs: { RouterLink: RouterLinkStub, AuthLayout: { template: '<div><slot /></div>' }, BetaNotice: true } } })

beforeEach(() => {
  route.query = {}
  vi.clearAllMocks()
  register.mockResolvedValue({})
  sendResetVCode.mockResolvedValue({})
})
afterEach(() => vi.useRealTimers())

it('注册成功后登录页播报成功状态，并保留安全回跳', async () => {
  route.query = { redirect: '/inventory' }
  const form = mountPage(RegisterPage)
  await form.get('#register-email').setValue('test@example.com')
  await form.get('#register-username').setValue('tester')
  await form.get('#register-code').setValue('123456')
  await form.get('#register-password').setValue('password123')
  await form.get('#register-confirm').setValue('password123')
  await form.get('form').trigger('submit')
  await flushPromises()
  expect(push).toHaveBeenCalledWith({ path: '/login', query: { redirect: '/inventory', registered: '1' } })
  route.query = { registered: '1' }
  expect(mountPage(LoginPage).get('[role="status"]').text()).toContain('注册成功，请登录')
})

it('登录、注册、找回的五个密码框均可切换且读屏可得知状态', async () => {
  for (const [Page, count] of [[LoginPage, 1], [RegisterPage, 2], [ForgotPage, 2]]) {
    const wrapper = mountPage(Page)
    if (Page === ForgotPage) {
      await wrapper.get('#forgot-email').setValue('test@example.com')
      await wrapper.get('form').trigger('submit')
      await flushPromises()
    }
    const controls = wrapper.findAll('.visibility-toggle')
    expect(controls).toHaveLength(count)
    for (const control of controls) {
      const input = control.element.previousElementSibling
      expect(input.type).toBe('password')
      expect(control.attributes('aria-pressed')).toBe('false')
      await control.trigger('click')
      expect(input.type).toBe('text')
      expect(control.attributes('aria-pressed')).toBe('true')
      expect(control.attributes('aria-label')).toBe('隐藏密码')
    }
    wrapper.unmount()
  }
})

it('找回第二步可返回、倒计时期间继续填写、期满后重发；失败可播报', async () => {
  vi.useFakeTimers()
  const wrapper = mountPage(ForgotPage)
  await wrapper.get('#forgot-email').setValue('test@example.com')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(sendResetVCode).toHaveBeenCalledTimes(1)
  expect(wrapper.get('.recovery-actions').text()).toContain('重新发送（60s）')
  await wrapper.findAll('.recovery-actions button')[1].trigger('click')
  expect(wrapper.find('#forgot-email').exists()).toBe(true)
  await wrapper.get('form').trigger('submit')
  expect(wrapper.find('#forgot-code').exists()).toBe(true)
  expect(sendResetVCode).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(60000)
  sendResetVCode.mockRejectedValueOnce(new Error('请稍后重试'))
  await wrapper.findAll('.recovery-actions button')[0].trigger('click')
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('请稍后重试')
  expect(sendResetVCode).toHaveBeenCalledTimes(2)
  wrapper.unmount()
})

it('找回第一步发送失败会播报，并允许重新尝试', async () => {
  sendResetVCode.mockRejectedValueOnce(new Error('发送失败'))
  const wrapper = mountPage(ForgotPage)
  await wrapper.get('#forgot-email').setValue('test@example.com')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('发送失败')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(wrapper.find('#forgot-code').exists()).toBe(true)
  wrapper.unmount()
})


it.each([[LoginPage, 'login', 390], [LoginPage, 'login', 1440], [RegisterPage, 'register', 390], [RegisterPage, 'register', 1440], [ForgotPage, 'forgot', 390], [ForgotPage, 'forgot', 1440]])('%s表单在%s/%s跨断点保持真实布局、输入与密码可见状态', async (Page, kind, width) => {
  const originalWidth = window.innerWidth
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  route.query = { redirect: '/inventory?tab=stock' }
  const wrapper = mount(Page, { attachTo: document.body, global: { stubs: { IslandSidebar: true, RouterLink: RouterLinkStub, BetaNotice: true }, directives: { reveal: () => {} } } })
  try {
    await wrapper.get(`#${kind}-email`).setValue('synthetic@example.invalid')
    if (kind === 'forgot') { await wrapper.get('form').trigger('submit'); await flushPromises() }
    await wrapper.get(`#${kind}-password`).setValue('synthetic-password')
    await wrapper.findAll('.visibility-toggle')[0].trigger('click')
    const input = wrapper.get(`#${kind}-password`).element
    input.focus()
    const layout = wrapper.getComponent(AuthLayout).vm.$
    const sends = sendResetVCode.mock.calls.length
    for (const nextWidth of [360, 361, 640, 641, 767, 768, 1080, 1081, width]) {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: nextWidth })
      window.dispatchEvent(new Event('resize')); await flushPromises()
      expect(wrapper.get(`#${kind}-password`).element).toBe(input)
      expect(input.value).toBe('synthetic-password')
      expect(input.type).toBe('text')
      expect(document.activeElement).toBe(input)
      expect(wrapper.getComponent(AuthLayout).vm.$).toBe(layout)
      expect(wrapper.findAll('.auth-card')).toHaveLength(1)
      expect(route.query.redirect).toBe('/inventory?tab=stock')
    }
    expect(sendResetVCode).toHaveBeenCalledTimes(sends)
    expect(sendRegistrationToken).not.toHaveBeenCalled()
    expect(register).not.toHaveBeenCalled()
    expect(resetPassword).not.toHaveBeenCalled()
    expect(auth.login).not.toHaveBeenCalled()
  } finally {
    wrapper.unmount()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth })
  }
})
