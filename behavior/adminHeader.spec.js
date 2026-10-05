import { beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import Audit from '../src/pages/admin/audit.vue'
import Roles from '../src/pages/admin/roles.vue'
import { listAdminAuditLogs, listAdminRoleUsers, replaceAdminRoles } from '../src/api/admin.js'
import { dialog } from '../src/utils/dialog.js'

const router = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => router }))
vi.mock('../src/api/admin.js', () => ({ listAdminAuditLogs: vi.fn(), listAdminRoleUsers: vi.fn(), replaceAdminRoles: vi.fn() }))
vi.mock('../src/api/user.js', () => ({ searchFeedbackAccessUsers: vi.fn(async () => []) }))
vi.mock('../src/store/auth.js', () => ({ auth: { userInfo: { id: 'current-admin' }, refreshAdminAccess: vi.fn() } }))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn() } }))
const render = Component => mount(Component, { global: { stubs: { IslandSidebar: true, RouterLink: true } } })
const binding = { userId: 'other-admin', userName: '实际角色用户', roles: ['SUPER_ADMIN'], activated: true }
beforeEach(() => {
  vi.clearAllMocks()
  listAdminAuditLogs.mockResolvedValue({ data: [], page: 1, total: 143, hasNext: true })
  listAdminRoleUsers.mockResolvedValue([binding, { ...binding, userId: 'inactive', activated: false, roles: ['PLATFORM_ADMIN'] }])
})

it('审计身份独立，真实页数和总量跟随列表，原翻页请求不变', async () => {
  const wrapper = render(Audit); await flushPromises()
  expect(wrapper.get('h1').text()).toBe('审计记录')
  expect(wrapper.get('.page-header-back').attributes('to')).toBe('/manage')
  expect(wrapper.find('main > header button').exists()).toBe(false)
  expect(wrapper.get('.audit-summary').text()).toBe('第 1 / 8 页 · 共 143 条')
  listAdminAuditLogs.mockResolvedValue({ data: [], page: 2, total: 143, hasNext: true })
  await wrapper.get('.pager button:last-child').trigger('click'); await flushPromises()
  expect(listAdminAuditLogs).toHaveBeenLastCalledWith({ page: 2, size: 20 })
  expect(wrapper.get('.audit-summary').text()).toContain('第 2 / 8 页')
  wrapper.unmount()
})

it.each([Audit, Roles])('管理读取失败和403保持原恢复/权限路径', async Component => {
  const api = Component === Audit ? listAdminAuditLogs : listAdminRoleUsers
  const path = Component === Audit ? '/admin/audit' : '/admin/roles'
  let reject
  api.mockReturnValue(new Promise((_, fail) => { reject = fail }))
  const wrapper = render(Component)
  expect(wrapper.get('h1').text()).toBe(Component === Audit ? '审计记录' : '角色管理')
  expect(wrapper.get('[role="status"]').text()).toContain('正在加载')
  expect(wrapper.find('.audit-summary,.role-summary').exists()).toBe(false)
  reject(new Error('合成读取失败')); await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('合成读取失败')
  api.mockRejectedValue(Object.assign(new Error('权限不足'), { status: 403 }))
  await wrapper.get('[role="alert"] button').trigger('click'); await flushPromises()
  expect(router.replace).toHaveBeenCalledWith({ path: '/forbidden', query: { from: path } })
  wrapper.unmount()
})

it('角色统计作为列表摘要，筛选保留总绑定与匹配数量各自含义', async () => {
  const wrapper = render(Roles); await flushPromises()
  expect(wrapper.get('h1').text()).toBe('角色管理')
  expect(wrapper.get('.page-header-back').attributes('to')).toBe('/manage')
  expect(wrapper.get('.role-summary').text()).toBe('当前绑定 2 人 · 超级管理员 1 人 · 未激活 1 人')
  expect(wrapper.find('main > header button').exists()).toBe(false)
  await wrapper.get('input[type="search"]').setValue('不存在')
  expect(wrapper.get('.count').text()).toBe('0 条')
  expect(wrapper.get('.role-summary').text()).toContain('当前绑定 2 人')
  expect(wrapper.get('.empty-row').text()).toContain('没有匹配')
  wrapper.unmount()
})

it('清空超级管理员仍明确提示完整替换并走原危险确认，取消不写入', async () => {
  dialog.confirm.mockResolvedValue(false)
  const wrapper = render(Roles); await flushPromises()
  await wrapper.get('button[title="编辑角色"]').trigger('click')
  expect(document.querySelector('.role-replace-note').textContent).toContain('完整替换')
  const option = document.querySelector('.role-options input[value="SUPER_ADMIN"]')
  option.checked = false; option.dispatchEvent(new Event('change', { bubbles: true }))
  await flushPromises()
  const save = [...document.querySelectorAll('.modal-actions button')].find(el => el.textContent.includes('保存角色'))
  save.click(); await flushPromises()
  expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({ type: 'danger', message: expect.stringContaining('回收超级管理员角色') }))
  expect(replaceAdminRoles).not.toHaveBeenCalled()
  wrapper.unmount()
})
