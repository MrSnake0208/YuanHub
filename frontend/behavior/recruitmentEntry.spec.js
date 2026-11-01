// Keep the existing tutorial implementation covered through explicit opt-in.
vi.hoisted(() => vi.stubEnv('VITE_TUTORIALS_ENABLED', 'true'))
afterAll(() => vi.unstubAllEnvs())
const tutorialFeature = vi.hoisted(() => ({ enabled: true }))
import { afterAll, beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises, RouterLinkStub, DOMWrapper } from '@vue/test-utils'
import RecruitmentPage from '../src/pages/recruitment/index.vue'
import { auth } from '../src/store/auth.js'
import { getRecruitmentAccess } from '../src/api/recruitmentAccess.js'

const personalMount = vi.hoisted(() => vi.fn())
vi.mock('../src/pages/recruitment/RecruitmentWorkspace.vue', () => ({ default: { setup() { personalMount(); return () => '真实档案工作区' } } }))
vi.mock('../src/config/features.js', async original => ({ ...(await original()), get TUTORIALS_ENABLED() { return tutorialFeature.enabled }, isFeatureEnabled: () => true }))
vi.mock('../src/store/auth.js', async () => ({ auth: (await import('vue')).reactive({ accessToken: '', userInfo: null }) }))
vi.mock('../src/api/recruitmentAccess.js', () => ({ getRecruitmentAccess: vi.fn() }))
const render = () => mount(RecruitmentPage, { attachTo: document.body, global: { stubs: { IslandSidebar: true, SiteFooter: true, RouterLink: RouterLinkStub } } })
beforeEach(() => { tutorialFeature.enabled = true; vi.clearAllMocks(); auth.accessToken = ''; auth.userInfo = null; getRecruitmentAccess.mockResolvedValue({ canAccess: false }) })

it('招募档案保持单元素根节点，避免全站 out-in 路由过渡进入空白状态', () => {
  const wrapper = render()
  expect(wrapper.vm.$el.nodeType).toBe(Node.ELEMENT_NODE)
  expect(wrapper.find('#main-content').exists()).toBe(true)
  wrapper.unmount()
})

it('关闭教程保留匿名登录与权限提示，不暴露练习或教程菜单', async () => {
  tutorialFeature.enabled = false
  const wrapper = render(); await flushPromises()
  expect(wrapper.find('.guide-entry-wrap, .guide-choice, .practice-panel, .guide-hint').exists()).toBe(false)
  expect(wrapper.text()).not.toMatch(/教程|练习/)
  expect(wrapper.findComponent(RouterLinkStub).props('to')).toContain('/login?redirect=/recruitment')
  expect(personalMount).not.toHaveBeenCalled()
})

it('匿名可使用教程和练习，绝不初始化个人资料读取', async () => {
  const wrapper = render(); await flushPromises()
  await wrapper.get('.guide-entry-wrap > button').trigger('click')
  expect(wrapper.findAll('.guide-choice button')).toHaveLength(3)
  await wrapper.get('.guide-choice button').trigger('click')
  expect(wrapper.get('.guide-hint').attributes('data-guide-for')).toBe('access')
  expect(wrapper.findComponent(RouterLinkStub).props('to')).toContain('/login?redirect=/recruitment')
  expect(getRecruitmentAccess).not.toHaveBeenCalled(); expect(personalMount).not.toHaveBeenCalled()
})
it('登录用户直接进入工作区，不再查询独立招募授权；内测资格由路由守卫校验', async () => {
  auth.accessToken = 'synthetic'; auth.userInfo = { id: 'owner-a' }
  getRecruitmentAccess.mockResolvedValue({ canAccess: false })
  const wrapper = render(); await flushPromises()
  expect(personalMount).toHaveBeenCalledTimes(1)
  expect(wrapper.text()).toContain('真实档案工作区')
  expect(getRecruitmentAccess).not.toHaveBeenCalled()
  wrapper.unmount()
})
it('退出登录立即卸载真实工作区，不保留旧账号资料', async () => {
  auth.accessToken = 'synthetic'; auth.userInfo = { id: 'owner-a' }
  const wrapper = render(); await flushPromises()
  auth.accessToken = ''; auth.userInfo = null; await flushPromises()
  expect(wrapper.text()).not.toContain('真实档案工作区')
  expect(wrapper.findComponent(RouterLinkStub).props('to')).toContain('/login?redirect=/recruitment')
  expect(getRecruitmentAccess).not.toHaveBeenCalled()
  wrapper.unmount()
})
