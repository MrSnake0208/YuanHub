import { beforeEach, expect, it, vi } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import Workbench from '../src/pages/admin/index.vue'
import { auth } from '../src/store/auth.js'

vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  return { auth: reactive({ adminAccess: null, adminAccessLoaded: false, adminAccessLoading: false, adminAccessError: '' }) }
})

const render = () => mount(Workbench, { global: { stubs: { IslandSidebar: true, SiteFooter: true, RouterLink: RouterLinkStub } } })
beforeEach(() => Object.assign(auth, { adminAccess: null, adminAccessLoaded: false, adminAccessLoading: false, adminAccessError: '' }))

it('管理工作台作为独立页面聚合授权工具，不再将个人中心作为父级', () => {
  Object.assign(auth, { adminAccessLoaded: true, adminAccess: { permissions: ['recruitment_catalog:write', 'admin:audit:read'], operatorAreas: ['UI'] } })
  const wrapper = render()
  expect(wrapper.get('h1').text()).toBe('管理工作台')
  expect(wrapper.find('header .page-header-back').exists()).toBe(false)
  expect(wrapper.findAll('.workbench-group h2').map(heading => heading.text())).toEqual(['反馈工作区', '内容维护', '平台设置'])
  expect(wrapper.findAllComponents(RouterLinkStub).map(link => link.props('to'))).toEqual(['/feedback/manage', '/recruitment/admin', '/admin/audit'])
  wrapper.unmount()
})

it.each([
  ['尚未读取', {}, '正在读取管理权限'],
  ['刷新中', { adminAccessLoaded: true, adminAccessLoading: true }, '正在读取管理权限'],
  ['读取失败', { adminAccessLoaded: true, adminAccessError: '合成读取失败' }, '管理权限读取失败'],
  ['没有权限', { adminAccessLoaded: true, adminAccess: { permissions: [] } }, '当前账号没有可用的管理能力'],
])('%s 时保留工作台状态，不展示工具', (_, state, message) => {
  Object.assign(auth, { adminAccess: { permissions: ['admin:audit:read'] } }, state)
  const wrapper = render()
  expect(wrapper.get('.workbench-state').text()).toContain(message)
  expect(wrapper.find('.workbench-tool').exists()).toBe(false)
  if (state.adminAccessError) expect(wrapper.get('[role="alert"]').text()).toContain(state.adminAccessError)
  wrapper.unmount()
})
