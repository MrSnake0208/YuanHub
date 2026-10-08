// Keep the existing tutorial implementation covered through explicit opt-in.
vi.hoisted(() => vi.stubEnv('VITE_TUTORIALS_ENABLED', 'true'))
afterAll(() => vi.unstubAllEnvs())
const tutorialFeature = vi.hoisted(() => ({ enabled: true }))
import { afterAll, beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises, RouterLinkStub, DOMWrapper } from '@vue/test-utils'
import RecruitmentPage from '../src/pages/recruitment/index.vue'
import { auth } from '../src/store/auth.js'
import { recruitmentAccess } from '../src/store/recruitmentAccess.js'
import { getRecruitmentAccess } from '../src/api/recruitmentAccess.js'
import { deferred } from '../test-support/recruitment.js'

const personalMount = vi.hoisted(() => vi.fn())
vi.mock('../src/pages/recruitment/RecruitmentWorkspace.vue', () => ({ default: { setup() { personalMount(); return () => '真实档案工作区' } } }))
vi.mock('../src/config/features.js', async original => ({ ...(await original()), get TUTORIALS_ENABLED() { return tutorialFeature.enabled }, isFeatureEnabled: () => true }))
vi.mock('../src/store/auth.js', async () => ({ auth: (await import('vue')).reactive({ accessToken: '', userInfo: null }) }))
vi.mock('../src/api/recruitmentAccess.js', () => ({ getRecruitmentAccess: vi.fn() }))
const render = () => mount(RecruitmentPage, { attachTo: document.body, global: { stubs: { IslandSidebar: true, SiteFooter: true, RouterLink: RouterLinkStub } } })
beforeEach(() => { tutorialFeature.enabled = true; vi.clearAllMocks(); auth.accessToken = ''; auth.userInfo = null; recruitmentAccess.setIdentity(''); getRecruitmentAccess.mockResolvedValue({ canAccess: false }) })

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
it('权限错误不是空档案，重试获权后才挂载业务；身份切换清旧授权', async () => {
  auth.accessToken = 'synthetic'; auth.userInfo = { id: 'owner-a' }; getRecruitmentAccess.mockRejectedValueOnce(new Error('权限断网'))
  const wrapper = render(); await flushPromises(); expect(wrapper.text()).toContain('权限断网'); expect(personalMount).not.toHaveBeenCalled()
  getRecruitmentAccess.mockResolvedValueOnce({ canAccess: true }); await wrapper.get('.access-note button').trigger('click'); await flushPromises()
  expect(personalMount).toHaveBeenCalledTimes(1)
  const reading = deferred(); getRecruitmentAccess.mockReturnValueOnce(reading.promise); auth.userInfo = { id: 'owner-b' }; await flushPromises()
  expect(wrapper.text()).toContain('正在确认'); expect(personalMount).toHaveBeenCalledTimes(1)
  reading.resolve({ canAccess: false }); await flushPromises(); expect(wrapper.text()).toContain('暂没有招募档案权限')
})
it('旧授权缓存不能替代本次页面的权限读取，刷新中不提前读个人数据', async () => {
  auth.accessToken = 'synthetic'; auth.userInfo = { id: 'owner-a' }
  recruitmentAccess.setIdentity('owner-a'); recruitmentAccess.status = { canAccess: true }; recruitmentAccess.loaded = true
  const reading = deferred(); getRecruitmentAccess.mockReturnValueOnce(reading.promise)
  const wrapper = render(); await flushPromises(); expect(personalMount).not.toHaveBeenCalled()
  reading.resolve({ canAccess: false }); await flushPromises(); expect(personalMount).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain('暂没有招募档案权限')
})
it('练习进行中权限确认不会关闭练习或把临时状态交给业务工作区', async () => {
  auth.accessToken = 'synthetic'; auth.userInfo = { id: 'owner-a' }; const reading = deferred(); getRecruitmentAccess.mockReturnValueOnce(reading.promise)
  const wrapper = render(); await wrapper.get('.guide-entry-wrap > button').trigger('click'); await wrapper.findAll('.guide-choice button')[1].trigger('click')
  expect(new DOMWrapper(document.body).find('.practice-panel').exists()).toBe(true)
  reading.resolve({ canAccess: true }); await flushPromises()
  expect(new DOMWrapper(document.body).find('.practice-panel').exists()).toBe(true)
})
