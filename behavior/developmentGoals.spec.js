import { beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import DevelopmentRoadmap from '../src/components/co-creation/DevelopmentRoadmap.vue'
import GoalAdmin from '../src/pages/co-creation/admin.vue'
import CoCreation from '../src/pages/co-creation/index.vue'
import * as goals from '../src/api/developmentGoals.js'
import { listPublicFeedback } from '../src/api/coCreation.js'
import { auth } from '../src/store/auth.js'
import { dialog } from '../src/utils/dialog.js'

vi.mock('vue-router', () => ({ onBeforeRouteLeave: vi.fn(), onBeforeRouteUpdate: vi.fn() }))
vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  return { auth: reactive({ userInfo: { id: 'admin' }, adminAccess: { permissions: [] } }) }
})
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn() } }))
vi.mock('../src/api/coCreation.js', () => ({ listPublicFeedback: vi.fn() }))
vi.mock('../src/api/developmentGoals.js', async importOriginal => ({
  ...await importOriginal(), listDevelopmentGoals: vi.fn(), saveDevelopmentGoal: vi.fn(), getAdminDevelopmentGoal: vi.fn()
}))
const goal = (overrides = {}) => ({
  id: 'goal_1', title: '改善反馈闭环', description: '让用户能持续跟进反馈结果', stage: 'IN_PROGRESS',
  criteria: [{ title: '提交后可查看进度', completed: true }, { title: '合并后仍可跟进', completed: false }],
  linkedFeedback: [{ id: 'public_1', title: '公开反馈标题' }], feedbackIds: ['public_1'],
  targetVersion: '0.2.0', targetDate: '2026-10-20', updatedAt: '2026-09-30T00:00:00Z', version: 2, ...overrides
})
const render = component => mount(component, { global: { stubs: { IslandSidebar: true, AdminBackLink: true, RouterLink: true } } })
beforeEach(() => {
  vi.clearAllMocks()
  auth.adminAccess.permissions = []
  goals.listDevelopmentGoals.mockReset().mockResolvedValue({ items: [goal()], total: 1, hasNext: false })
  goals.saveDevelopmentGoal.mockReset().mockResolvedValue(goal())
  goals.getAdminDevelopmentGoal.mockReset()
  listPublicFeedback.mockReset()
  dialog.confirm.mockReset().mockResolvedValue(true)
})

it('公开目标展示真实验收比例和需求来源，不从反馈生成目标', async () => {
  const wrapper = render(DevelopmentRoadmap)
  await flushPromises()
  expect(wrapper.text()).toContain('改善反馈闭环')
  expect(wrapper.get('progress').attributes('value')).toBe('1')
  expect(wrapper.get('progress').attributes('max')).toBe('2')
  expect(wrapper.text()).toContain('目标版本 0.2.0')
  expect(wrapper.text()).toContain('公开反馈标题')
  expect(goals.listDevelopmentGoals).toHaveBeenCalledWith({ page: 1, stage: '', admin: false })
  expect(listPublicFeedback).not.toHaveBeenCalled()
  expect(wrapper.find('button').exists()).toBe(false)
})

it('阶段筛选和分页使用目标接口并重置页码', async () => {
  goals.listDevelopmentGoals.mockResolvedValue({ items: [goal()], total: 30, hasNext: true })
  const wrapper = render(DevelopmentRoadmap)
  await flushPromises()
  await wrapper.findAll('.goal-pagination button')[1].trigger('click'); await flushPromises()
  expect(goals.listDevelopmentGoals).toHaveBeenLastCalledWith({ page: 2, stage: '', admin: false })
  await wrapper.get('select').setValue('PLANNED'); await flushPromises()
  expect(goals.listDevelopmentGoals).toHaveBeenLastCalledWith({ page: 1, stage: 'PLANNED', admin: false })
})

it('公开目标失败可重试，空状态不伪造目标', async () => {
  goals.listDevelopmentGoals.mockRejectedValueOnce(new Error('加载失败')).mockResolvedValueOnce({ items: [], total: 0, hasNext: false })
  const wrapper = render(DevelopmentRoadmap)
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('加载失败')
  await wrapper.get('[role="alert"] button').trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('暂时还没有公布开发目标')
  expect(wrapper.find('.goal-card').exists()).toBe(false)
})

it('共创页面移除广场和许愿池，只按权限提供目标管理入口', async () => {
  const wrapper = render(CoCreation)
  await flushPromises()
  expect(wrapper.text()).not.toContain('许愿池')
  expect(wrapper.text()).not.toContain('反馈广场')
  expect(wrapper.text()).not.toContain('管理开发目标')
  auth.adminAccess.permissions = ['development_goal:manage']
  await flushPromises()
  expect(wrapper.text()).toContain('管理开发目标')
})

it('管理员独立创建目标并明确保存后公开', async () => {
  const wrapper = render(GoalAdmin)
  await flushPromises()
  await wrapper.get('.feedback-hero-action').trigger('click'); await flushPromises()
  const form = wrapper.get('.goal-editor')
  const fields = form.findAll('input[type="text"], input:not([type])')
  await fields[0].setValue('独立目标')
  await form.get('textarea').setValue('交付说明')
  await form.get('[aria-label="第 1 项验收标准"]').setValue('可验收结果')
  await form.trigger('submit'); await flushPromises()
  expect(goals.saveDevelopmentGoal).toHaveBeenCalledWith('', expect.objectContaining({ title: '独立目标', feedbackIds: [], criteria: [{ title: '可验收结果', completed: false }] }))
  expect(wrapper.text()).toContain('开发目标已保存并公开')
  expect(wrapper.find('.goal-editor').exists()).toBe(false)
})

it('维护目标可关联公开反馈并携带版本，失败保留草稿', async () => {
  const wrapper = render(GoalAdmin)
  await flushPromises()
  await wrapper.get('.goal-card button').trigger('click'); await flushPromises()
  await wrapper.get('[aria-label="搜索可关联的公开反馈"]').setValue('建议')
  listPublicFeedback.mockResolvedValue({ items: [{ id: 'public_2', publicTitle: '新的公开建议' }] })
  await wrapper.get('.goal-search button').trigger('click'); await flushPromises()
  await wrapper.findAll('.linked-row button').find(button => button.text() === '关联').trigger('click')
  goals.saveDevelopmentGoal.mockRejectedValue(Object.assign(new Error('版本冲突'), { status: 409 }))
  await wrapper.get('.goal-editor').trigger('submit'); await flushPromises()
  expect(goals.saveDevelopmentGoal).toHaveBeenCalledWith('goal_1', expect.objectContaining({ version: 2, feedbackIds: ['public_1', 'public_2'] }))
  expect(wrapper.get('.goal-editor').text()).toContain('版本冲突')
  expect(wrapper.get('.goal-editor').text()).toContain('新的公开建议')
  expect(wrapper.text()).toContain('重新加载目标')
})

it('未完成验收不能标记完成，取消编辑需要确认未保存修改', async () => {
  const wrapper = render(GoalAdmin)
  await flushPromises()
  await wrapper.get('.goal-card button').trigger('click'); await flushPromises()
  await wrapper.get('.goal-editor select').setValue('COMPLETED')
  await wrapper.get('.goal-editor').trigger('submit'); await flushPromises()
  expect(goals.saveDevelopmentGoal).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain('全部验收标准通过后才能标记完成')
  dialog.confirm.mockResolvedValue(false)
  await wrapper.get('.goal-editor-actions button').trigger('click'); await flushPromises()
  expect(wrapper.find('.goal-editor').exists()).toBe(true)
})

it('冲突重新加载必须确认，失败保留内容，成功更新版本', async () => {
  const wrapper = render(GoalAdmin)
  await flushPromises()
  await wrapper.get('.goal-card button').trigger('click'); await flushPromises()
  await wrapper.get('.goal-editor textarea').setValue('尚未保存的修改')
  goals.saveDevelopmentGoal.mockRejectedValue(Object.assign(new Error('版本冲突'), { status: 409 }))
  await wrapper.get('.goal-editor').trigger('submit'); await flushPromises()
  dialog.confirm.mockResolvedValueOnce(false)
  await wrapper.get('.feedback-form-error button').trigger('click'); await flushPromises()
  expect(goals.getAdminDevelopmentGoal).not.toHaveBeenCalled()
  goals.getAdminDevelopmentGoal.mockRejectedValueOnce(new Error('重新加载失败'))
  await wrapper.get('.feedback-form-error button').trigger('click'); await flushPromises()
  expect(wrapper.get('.goal-editor textarea').element.value).toBe('尚未保存的修改')
  expect(wrapper.text()).toContain('重新加载失败')
  goals.getAdminDevelopmentGoal.mockResolvedValueOnce(goal({ description: '服务器最新说明', version: 3 }))
  await wrapper.get('.feedback-form-error button').trigger('click'); await flushPromises()
  expect(wrapper.get('.goal-editor textarea').element.value).toBe('服务器最新说明')
  goals.saveDevelopmentGoal.mockResolvedValueOnce(goal({ version: 4 }))
  await wrapper.get('.goal-editor').trigger('submit'); await flushPromises()
  expect(goals.saveDevelopmentGoal).toHaveBeenLastCalledWith('goal_1', expect.objectContaining({ version: 3 }))
})

it('旧搜索响应不能污染新打开的目标表单', async () => {
  let resolve
  listPublicFeedback.mockReturnValue(new Promise(yes => { resolve = yes }))
  const wrapper = render(GoalAdmin)
  await flushPromises()
  await wrapper.get('.goal-card button').trigger('click'); await flushPromises()
  await wrapper.get('[aria-label="搜索可关联的公开反馈"]').setValue('旧查询')
  await wrapper.get('.goal-search button').trigger('click')
  await wrapper.get('.feedback-hero-action').trigger('click'); await flushPromises()
  resolve({ items: [{ id: 'old', publicTitle: '旧查询结果' }] }); await flushPromises()
  expect(wrapper.text()).not.toContain('旧查询结果')
})
