import { expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import ForbiddenPage from '../src/pages/user/forbidden.vue'
import { routes } from '../src/router/routes.js'
import { deferred } from '../test-support/factories.js'

async function render(query) {
  const router = createRouter({ history: createMemoryHistory(), routes: routes.map(route => ({ ...route, component: { template: '<div />' } })) })
  await router.push({ path: '/forbidden', query })
  const wrapper = mount(ForbiddenPage, { global: { plugins: [router], stubs: { IslandSidebar: true } } })
  return { wrapper, router }
}

it.each([
  ['recruitment-required', '/recruitment', '尚未获得招募档案资格', '访问名单'],
  ['recruitment-unavailable', '/recruitment', '暂时无法确认招募档案资格', '不代表你没有资格'],
  ['admin-required', '/admin/roles', '没有此功能的管理权限', '管理权限'],
  ['admin-unavailable', '/admin/roles', '暂时无法确认管理权限', '不代表权限已被撤销']
])('有限原因 %s 只展示固定文案并保留恢复入口', async (reason, from, title, description) => {
  const { wrapper } = await render({ reason, from })
  expect(wrapper.get('h1').text()).toContain(title)
  expect(wrapper.text()).toContain(description)
  expect(wrapper.find('button').exists()).toBe(true)
  if (reason.startsWith('recruitment')) expect(wrapper.text()).not.toContain('管理权限')
  expect(fetch).not.toHaveBeenCalled()
})

it.each([
  { reason: '<script>alert(1)</script>', from: '/recruitment' },
  { reason: ['admin-unavailable', 'admin-required'], from: '/admin/roles' },
  ...['https://evil.invalid', '//evil.invalid', '/%2fevil.invalid', '/%5cevil.invalid', '/login', '/forbidden', '/unknown-page', '/promo', '/operator/share/code']
    .map(from => ({ reason: 'admin-unavailable', from })),
  { reason: 'recruitment-required', from: '/admin/roles' }
])('不可信来源或原因 %j 不提供任意跳转或外部文案', async query => {
  const { wrapper } = await render(query)
  expect(wrapper.get('h1').text()).toBe('当前账号暂时无法访问此功能')
  expect(wrapper.find('button').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('alert(1)')
  expect(fetch).not.toHaveBeenCalled()
})

it('重试保留站内路径与参数，重复点击只发起一次导航', async () => {
  const { wrapper, router } = await render({ reason: 'recruitment-unavailable', from: '/recruitment?game=如鸢#history' })
  const pending = deferred()
  const push = vi.spyOn(router, 'push').mockReturnValue(pending.promise)
  await wrapper.get('button').trigger('click')
  expect(wrapper.get('button').attributes('disabled')).toBeDefined()
  await wrapper.get('button').trigger('click')
  expect(push).toHaveBeenCalledExactlyOnceWith('/recruitment?game=如鸢#history')
  pending.resolve(undefined)
  await flushPromises()
  expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
})

it('导航抛错保留重试入口；导航取消不触发后备写入或放行', async () => {
  const { wrapper, router } = await render({ reason: 'admin-unavailable', from: '/admin/roles' })
  const push = vi.spyOn(router, 'push').mockRejectedValueOnce(new Error('chunk failed')).mockResolvedValueOnce({ type: 4 })
  await wrapper.get('button').trigger('click')
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('暂时无法返回')
  await wrapper.get('button').trigger('click')
  await flushPromises()
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  expect(router.currentRoute.value.path).toBe('/forbidden')
  expect(push).toHaveBeenCalledTimes(2)
  expect(fetch).not.toHaveBeenCalled()
})
