import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import FeedbackWorkspaceNav from '../src/components/feedback/FeedbackWorkspaceNav.vue'
import { auth } from '../src/store/auth.js'
import { normalizeAdminAccess } from '../src/utils/authPermissions.js'

vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  return { auth: reactive({ adminAccess: null }) }
})

const destinations = ['/feedback/plaza', '/feedback', '/feedback/manage', '/feedback/admin']
const sections = ['plaza', 'mine', 'manage', 'admin']

async function render(active = 'plaza', props = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [...destinations, '/manage'].map(path => ({ path, component: { template: '<div />' } }))
  })
  await router.push(destinations[sections.indexOf(active)])
  return mount(FeedbackWorkspaceNav, {
    props: { active, ...props },
    global: { plugins: [router] }
  })
}

beforeEach(() => {
  auth.adminAccess = normalizeAdminAccess({ operator_areas: ['OPERATOR'], permissions: ['admin:feedback_access:manage'] })
})

it.each(sections)('%s 保留相同的内部导航顺序和独立管理入口', async active => {
  const wrapper = await render(active, { canManage: true, canConfigure: true, hasUnreadFeedback: true })
  const nav = wrapper.get('nav[aria-label="反馈工作区"]')
  expect(nav.findAll('a').map(link => link.attributes('href'))).toEqual(destinations)
  expect(nav.get('a.active').attributes('href')).toBe(destinations[sections.indexOf(active)])
  expect(nav.get('a.active').attributes('aria-current')).toBe('page')
  expect(nav.find('a[href="/manage"]').exists()).toBe(false)
  expect(wrapper.findAll('a[href="/manage"]')).toHaveLength(1)
  expect(wrapper.get('a[href="/manage"]').text()).toContain('管理工作台')
  expect(nav.get('[aria-label="有未读反馈"]').exists()).toBe(true)
})

it('普通用户只看见公开广场和我的反馈', async () => {
  auth.adminAccess = null
  const wrapper = await render()
  expect(wrapper.findAll('a').map(link => link.attributes('href'))).toEqual(destinations.slice(0, 2))
  expect(wrapper.find('[aria-label="有未读反馈"]').exists()).toBe(false)
})

it('仅有反馈处理能力时隐藏权限配置，并在能力撤销后隐藏管理入口', async () => {
  auth.adminAccess = normalizeAdminAccess({ operator_areas: ['OPERATOR'] })
  const wrapper = await render('manage', { canManage: true })
  expect(wrapper.get('nav').findAll('a').map(link => link.attributes('href'))).toEqual(destinations.slice(0, 3))
  expect(wrapper.find('a[href="/manage"]').exists()).toBe(true)
  auth.adminAccess = null
  await wrapper.setProps({ canManage: false })
  await flushPromises()
  expect(wrapper.findAll('a').map(link => link.attributes('href'))).toEqual(destinations.slice(0, 2))
})
