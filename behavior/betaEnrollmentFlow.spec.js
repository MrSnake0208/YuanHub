import { beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import BetaPage from '../src/pages/beta/index.vue'
import { beta } from '../src/store/beta.js'

const { refresh, join, withdraw } = vi.hoisted(() => ({ refresh: vi.fn(), join: vi.fn(), withdraw: vi.fn() }))
const route = vi.hoisted(() => ({ query: {}, fullPath: '/beta' }))
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ resolve: () => ({ meta: {} }) }) }))
vi.mock('../src/store/auth.js', async () => { const { reactive } = await import('vue'); return { auth: reactive({ isLoggedIn: true, isAdmin: false }) } })
vi.mock('../src/store/beta.js', async () => { const { reactive } = await import('vue'); return { beta: reactive({
  campaign: null, mine: null, publicError: '', personalError: '', publicLoading: false, personalLoading: false,
  personalCooldownUntil: 0, refresh, join, withdraw, subscribe: () => () => {}
}) } })

const campaign = () => ({ campaignId: 'synthetic', rulesVersion: 'v1', accessMode: 'BETA', publicState: 'OPEN_REGISTRATION' })
const render = (options = {}) => mount(BetaPage, { ...options, global: { stubs: { RouterLink: RouterLinkStub, SiteFooter: true } } })

beforeEach(() => {
  beta.campaign = campaign()
  beta.mine = { nextAction: 'JOIN', enrollmentStatus: 'NOT_JOINED' }
  beta.publicError = beta.personalError = ''
  beta.personalCooldownUntil = 0
  refresh.mockReset().mockResolvedValue(null)
  join.mockReset().mockResolvedValue({ canUseBetaFeatures: true })
  withdraw.mockReset().mockResolvedValue({})
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

it('报名先展示完整 v1 规则，勾选后提交展示的同一版本', async () => {
  const wrapper = render()
  expect(wrapper.get('.rules-details').text()).toContain('v1')
  expect(wrapper.get('.rules-body').text()).toContain('不能保证绝对不丢档')
  expect(wrapper.get('.rules-body').text()).toContain('再次报名会排到队尾')
  const button = wrapper.get('.invite-action .beta-button.primary')
  expect(button.attributes('disabled')).toBeDefined()
  await wrapper.get('.rules-consent input').setValue(true)
  expect(button.attributes('disabled')).toBeUndefined()
  await button.trigger('click')
  await flushPromises()
  expect(join).toHaveBeenCalledWith(expect.objectContaining({ campaignId: 'synthetic', rulesVersion: 'v1', acceptedTerms: true, acceptWaitlist: true }))
  wrapper.unmount()
})

it('未知版本没有对应规则全文时拒绝代用户同意', async () => {
  beta.campaign = { ...campaign(), rulesVersion: 'v2' }
  const wrapper = render()
  expect(wrapper.get('.rules-details').text()).toContain('v2')
  expect(wrapper.get('.rules-details [role="alert"]').text()).toContain('尚未展示')
  expect(wrapper.get('.invite-action .beta-button.primary').attributes('disabled')).toBeDefined()
  expect(wrapper.get('.icon-refresh').exists()).toBe(true)
  expect(join).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('刷新在冷却期与状态未变化时均给出反馈', async () => {
  beta.mine = { enrollmentStatus: 'WAITING' }
  const wrapper = render()
  beta.personalCooldownUntil = Date.now() + 65000
  await wrapper.get('.icon-refresh').trigger('click')
  expect(wrapper.get('.invite-card [role="status"]').text()).toContain('秒后可重试')
  expect(refresh).not.toHaveBeenCalled()
  beta.personalCooldownUntil = 0
  await wrapper.get('.icon-refresh').trigger('click')
  await flushPromises()
  expect(refresh).toHaveBeenCalledWith({ force: true })
  expect(wrapper.get('.invite-card [role="status"]').text()).toContain('状态已是最新')
  expect(wrapper.text()).not.toContain('不用反复刷新')
  wrapper.unmount()
})

it('取消候补失败即使异常消息为空，也显示可读错误', async () => {
  beta.mine = { enrollmentStatus: 'WAITING' }
  withdraw.mockRejectedValueOnce(new Error(''))
  const wrapper = render()
  await wrapper.get('.beta-text-button').trigger('click')
  await flushPromises()
  expect(wrapper.get('.invite-action [role="alert"]').text()).toContain('取消候补失败')
  wrapper.unmount()
})


it.each([390, 1440])('报名在%s起步跨断点保持同意版本、展开规则和焦点', async width => {
  const originalWidth = window.innerWidth
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  const wrapper = render({ attachTo: document.body }); await flushPromises()
  try {
    const rules = wrapper.get('.rules-details').element
    rules.open = true
    await wrapper.get('.rules-consent input').setValue(true)
    const checkbox = wrapper.get('.rules-consent input').element
    checkbox.focus()
    const reads = refresh.mock.calls.length
    for (const nextWidth of [520, 521, 760, 761, 980, 981, 1080, 1081, width]) {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: nextWidth })
      window.dispatchEvent(new Event('resize')); await flushPromises()
      expect(wrapper.get('.rules-details').element).toBe(rules)
      expect(rules.open).toBe(true)
      expect(wrapper.get('.rules-consent input').element).toBe(checkbox)
      expect(checkbox.checked).toBe(true)
      expect(document.activeElement).toBe(checkbox)
      expect(wrapper.get('.invite-action .beta-button.primary').element.disabled).toBe(false)
      expect(wrapper.findAll('.invite-card')).toHaveLength(1)
    }
    expect(refresh).toHaveBeenCalledTimes(reads)
    expect(join).not.toHaveBeenCalled()
    expect(withdraw).not.toHaveBeenCalled()
  } finally {
    wrapper.unmount()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth })
  }
})
