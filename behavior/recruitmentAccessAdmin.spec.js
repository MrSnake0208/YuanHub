import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import RecruitmentAccessAdmin from '../src/pages/admin/recruitmentAccess.vue'
import * as api from '../src/api/recruitmentAccess.js'
import { dialog } from '../src/utils/dialog.js'

vi.mock('../src/api/recruitmentAccess.js', () => ({
  getAdminRecruitmentAccess: vi.fn(),
  updateRecruitmentAccessMode: vi.fn(),
  searchRecruitmentAccessUsers: vi.fn(),
  grantRecruitmentAccess: vi.fn(),
  revokeRecruitmentAccess: vi.fn()
}))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn() } }))

const render = () => mount(RecruitmentAccessAdmin, {
  attachTo: document.body,
  global: { stubs: { IslandSidebar: true, RouterLink: RouterLinkStub } }
})
const button = (wrapper, text) => wrapper.findAll('button').find(item => item.text().includes(text))

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  dialog.confirm.mockResolvedValue(true)
  api.getAdminRecruitmentAccess.mockResolvedValue({
    accessMode: 'LIMITED',
    version: 2,
    grants: [{ userId: 'old', userName: '旧测试员', activated: true, grantedBy: 'admin', grantedAt: '2026-10-01T00:00:00Z' }]
  })
  api.updateRecruitmentAccessMode.mockResolvedValue({
    accessMode: 'PUBLIC',
    version: 3,
    grants: [{ userId: 'old', userName: '旧测试员', activated: true, grantedBy: 'admin', grantedAt: '2026-10-01T00:00:00Z' }]
  })
  api.searchRecruitmentAccessUsers.mockResolvedValue([
    { id: 'new', userName: '新测试员', email: 'new@example.com', activated: true }
  ])
  api.grantRecruitmentAccess.mockResolvedValue({
    userId: 'new', userName: '新测试员', activated: true, grantedBy: 'admin', grantedAt: '2026-10-01T01:00:00Z'
  })
  api.revokeRecruitmentAccess.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

it('有限和公开模式切换会确认并保留名单', async () => {
  const wrapper = render()
  await flushPromises()
  expect(wrapper.get('.mode-badge').text()).toBe('有限访问')
  expect(wrapper.text()).toContain('旧测试员')

  await button(wrapper, '公开访问').trigger('click')
  await flushPromises()

  expect(dialog.confirm).toHaveBeenCalled()
  expect(api.updateRecruitmentAccessMode).toHaveBeenCalledWith('PUBLIC', 2)
  expect(wrapper.get('.mode-badge').text()).toBe('公开访问')
  expect(wrapper.text()).toContain('旧测试员')
  expect(wrapper.text()).toContain('名单暂不参与访问判定')
})

it('管理员可以搜索已激活用户加入名单并移除授权', async () => {
  const wrapper = render()
  await flushPromises()

  await wrapper.get('input[type=search]').setValue('新测试员')
  await vi.advanceTimersByTimeAsync(260)
  await flushPromises()
  expect(api.searchRecruitmentAccessUsers).toHaveBeenCalledWith({ q: '新测试员', page: 1, size: 10 })
  expect(wrapper.text()).toContain('new@example.com')

  await button(wrapper, '授权访问').trigger('click')
  await flushPromises()
  expect(api.grantRecruitmentAccess).toHaveBeenCalledWith('new')
  expect(wrapper.text()).toContain('已为 新测试员 开通招募档案访问')

  const oldRow = wrapper.findAll('.grant-row').find(row => row.text().includes('旧测试员'))
  await oldRow.get('.danger').trigger('click')
  await flushPromises()
  expect(api.revokeRecruitmentAccess).toHaveBeenCalledWith('old')
  expect(wrapper.text()).toContain('已移除 旧测试员 的招募档案权限')
})
