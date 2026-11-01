import { beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
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
const render = component => mount(component, { global: { stubs: { IslandSidebar: true, RouterLink: RouterLinkStub } } })
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
  expect(wrapper.get('.goal-details').attributes()).toHaveProperty('open')
  expect(wrapper.text()).toContain('已确认的完成项')
  expect(wrapper.text()).toContain('公开反馈标题')
  expect(wrapper.getComponent(RouterLinkStub).props('to')).toEqual({ path: '/feedback/plaza', query: { feedback: 'public_1' } })
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
  await wrapper.get('.goal-create-action').trigger('click'); await flushPromises()
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
  await wrapper.get('.goal-create-action').trigger('click'); await flushPromises()
  resolve({ items: [{ id: 'old', publicTitle: '旧查询结果' }] }); await flushPromises()
  expect(wrapper.text()).not.toContain('旧查询结果')
})


it('筛选为空提供恢复入口，恢复时清空阶段并回第一页', async () => {
  const wrapper = render(DevelopmentRoadmap); await flushPromises()
  goals.listDevelopmentGoals.mockResolvedValue({ items: [], total: 0, hasNext: false })
  await wrapper.get('select').setValue('COMPLETED'); await flushPromises()
  expect(wrapper.get('.goal-state').text()).toContain('查看全部目标')
  await wrapper.get('.goal-state button').trigger('click'); await flushPromises()
  expect(goals.listDevelopmentGoals).toHaveBeenLastCalledWith({ page: 1, stage: '', admin: false })
  expect(wrapper.find('select').exists()).toBe(false)
  expect(wrapper.text()).toContain('暂时还没有公布开发目标')
})

it('首次公开零目标简化工具栏和进度说明，管理态仍保留筛选', async () => {
  goals.listDevelopmentGoals.mockResolvedValue({ items: [], total: 0, hasNext: false })
  const publicView = render(DevelopmentRoadmap); await flushPromises()
  expect(publicView.find('.goal-toolbar').exists()).toBe(false)
  expect(publicView.find('.goal-notice').exists()).toBe(false)
  expect(publicView.text()).toContain('提交你的功能建议')
  const adminView = mount(DevelopmentRoadmap, { props: { managed: true }, global: { stubs: { RouterLink: RouterLinkStub } } }); await flushPromises()
  expect(adminView.find('select').exists()).toBe(true)
  expect(adminView.find('.goal-notice').exists()).toBe(true)
})

it('加载错误保留筛选与说明，成功有目标后不隐藏控件', async () => {
  goals.listDevelopmentGoals.mockRejectedValueOnce(new Error('offline'))
  const wrapper = render(DevelopmentRoadmap); await flushPromises()
  expect(wrapper.find('select').exists()).toBe(true)
  expect(wrapper.find('.goal-notice').exists()).toBe(true)
  await wrapper.get('[role="alert"] button').trigger('click'); await flushPromises()
  expect(wrapper.find('select').exists()).toBe(true)
  expect(wrapper.find('.goal-card').exists()).toBe(true)
})

it('功能计划解释完成与发布的关系，不将完成项当作已上线', async () => {
  const wrapper = render(CoCreation); await flushPromises()
  expect(wrapper.text()).toContain('功能计划')
  expect(wrapper.text()).toContain('实际发布请看')
  expect(wrapper.findAllComponents(RouterLinkStub).some(link => link.props('to') === '/changelog')).toBe(true)
  expect(wrapper.text()).not.toContain('已上线')
})


it('管理身份与返回上下文明确，新增靠近目录，公开警告靠近编辑对象', async () => {
  const wrapper = render(GoalAdmin); await flushPromises()
  const header = wrapper.get('main > header')
  expect(header.get('h1').text()).toBe('开发目标管理')
  expect(header.find('button').exists()).toBe(false)
  expect(header.getComponent(RouterLinkStub).props('to')).toBe('/manage')
  expect(header.getComponent(RouterLinkStub).attributes('aria-label')).toBe('返回管理工作台')
  expect(wrapper.get('.goal-workspace-toolbar').text()).toContain('新增目标')
  expect(wrapper.get('.development-roadmap').text()).toContain('1 个目标')
  expect(wrapper.get('.goal-card').text()).toContain('开发中')
  await wrapper.get('.goal-create-action').trigger('click'); await flushPromises()
  expect(wrapper.get('.goal-editor .goal-admin-context').text()).toContain('保存后立即展示给所有用户')
  expect(wrapper.get('.goal-editor-actions [type="submit"]').text()).toBe('保存并公开')
  expect(goals.saveDevelopmentGoal).not.toHaveBeenCalled()
  expect(listPublicFeedback).not.toHaveBeenCalled()
})
