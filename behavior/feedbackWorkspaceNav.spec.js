import { beforeEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
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
const publicDestinations = destinations.slice(0, 2)

async function render(active = 'plaza', query = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [...destinations, '/manage'].map(path => ({ path, component: { template: '<div />' } }))
  })
  await router.push({ path: destinations[sections.indexOf(active)], query })
  return mount(FeedbackWorkspaceNav, {
    props: { active },
    global: { plugins: [router] }
  })
}

beforeEach(() => {
  auth.adminAccess = normalizeAdminAccess({ operator_areas: ['OPERATOR'], permissions: ['admin:feedback_access:manage'] })
})

it.each(sections)('%s 对管理员也仅显示两个用户入口，不重复展示管理入口', async active => {
  const wrapper = await render(active)
  const nav = wrapper.get('nav[aria-label="反馈工作区"]')
  expect(nav.findAll('a').map(link => link.attributes('href'))).toEqual(publicDestinations)
  if (active === 'plaza' || active === 'mine') {
    expect(nav.get('a.active').attributes('href')).toBe(destinations[sections.indexOf(active)])
    expect(nav.get('a.active').attributes('aria-current')).toBe('page')
  } else {
    expect(nav.find('a.active').exists()).toBe(false)
  }
  expect(wrapper.findAll('a').map(link => link.attributes('href'))).toEqual(publicDestinations)
  expect(wrapper.find('a[href="/manage"]').exists()).toBe(false)
  expect(nav.find('[aria-label="有未读反馈"]').exists()).toBe(false)
  wrapper.unmount()
})

it('普通用户只看见公开广场和我的反馈', async () => {
  auth.adminAccess = null
  const wrapper = await render()
  expect(wrapper.findAll('a').map(link => link.attributes('href'))).toEqual(publicDestinations)
  expect(wrapper.find('[aria-label="有未读反馈"]').exists()).toBe(false)
  wrapper.unmount()
})

it('仅有反馈处理能力也不重复展示管理入口', async () => {
  auth.adminAccess = normalizeAdminAccess({ operator_areas: ['OPERATOR'] })
  const wrapper = await render('manage')
  expect(wrapper.findAll('a').map(link => link.attributes('href'))).toEqual(publicDestinations)
  wrapper.unmount()
})

it.each(['partner-a', 'all'])('用户导航保留具体专区并将总管理范围返回默认专区：%s', async space => {
  const wrapper = await render('manage', { space })
  const suffix = space === 'all' ? '' : '?space=partner-a'
  expect(wrapper.findAll('a').map(link => link.attributes('href'))).toEqual(publicDestinations.map(path => path + suffix))
  wrapper.unmount()
})
