import { beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import FeedbackAccess from '../src/pages/feedback/admin.vue'
import { searchFeedbackAccessUsers } from '../src/api/user.js'
import { createFeedbackCategory, getFeedbackAccess, listFeedbackAccessGrants, renameFeedbackCategory, reorderFeedbackCategories, setFeedbackCategoryHidden, updateFeedbackAccessGrant } from '../src/api/feedback.js'
import { dialog } from '../src/utils/dialog.js'

const router = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => router }))
vi.mock('../src/store/auth.js', () => ({ auth: {
  userInfo: { id: 'root' }, adminAccess: { permissions: ['admin:feedback_access:manage'], manageAreas: [] }
} }))
vi.mock('../src/store/feedbackUnread.js', () => ({ feedbackUnreadState: { count: 0 } }))
vi.mock('../src/api/feedback.js', () => ({
  listFeedbackAccessGrants: vi.fn(), getFeedbackAccess: vi.fn(), updateFeedbackAccessGrant: vi.fn(), deleteFeedbackAccessGrant: vi.fn(),
  createFeedbackCategory: vi.fn(), renameFeedbackCategory: vi.fn(), reorderFeedbackCategories: vi.fn(), setFeedbackCategoryHidden: vi.fn()
}))
vi.mock('../src/api/user.js', () => ({ searchFeedbackAccessUsers: vi.fn() }))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn() } }))
const render = (options = {}) => mount(FeedbackAccess, { ...options, global: { stubs: {
  IslandSidebar: true, AdminBackLink: true, FeedbackWorkspaceNav: true, teleport: true
} } })
const user = id => ({ id, userName: `测试用户 ${id}`, email: `${id}@example.test` })
function deferred() {
  let resolve
  return { promise: new Promise(done => { resolve = done }), resolve: value => resolve(value) }
}
async function search(wrapper, query) {
  await wrapper.get('input[name="feedback-access-user"]').setValue(query)
  await vi.advanceTimersByTimeAsync(250); await flushPromises()
}
beforeEach(() => {
  vi.useFakeTimers()
  router.replace.mockReset()
  getFeedbackAccess.mockReset().mockResolvedValue({ available_categories: [{ key: 'OPERATOR', label: '密探养成' }] })
  listFeedbackAccessGrants.mockReset().mockResolvedValue([])
  searchFeedbackAccessUsers.mockReset().mockResolvedValue([])
  updateFeedbackAccessGrant.mockReset().mockResolvedValue({})
  createFeedbackCategory.mockReset().mockResolvedValue({ key: 'CUSTOM_TEST', label: '新板块' })
  renameFeedbackCategory.mockReset().mockResolvedValue({ key: 'OPERATOR', label: '密探' })
  setFeedbackCategoryHidden.mockReset().mockResolvedValue({})
  reorderFeedbackCategories.mockReset()
  dialog.confirm.mockReset()
})

const orderedCategories = () => [
  { key: 'OPERATOR', label: '密探养成', hidden: false },
  { key: 'CUSTOM_HIDDEN', label: '隐藏板块', hidden: true },
  { key: 'CALENDAR', label: '活动日历', hidden: false }
]
const categoryNames = wrapper => wrapper.findAll('.category-list li > span').map(item => item.text())

it('上移下移保存完整目录顺序含隐藏项，首尾禁用，重载保序', async () => {
  let catalog = orderedCategories()
  getFeedbackAccess.mockImplementation(async () => ({ category_catalog: catalog }))
  reorderFeedbackCategories.mockImplementation(async keys => {
    catalog = keys.map(key => catalog.find(area => area.key === key))
    return catalog
  })
  const wrapper = render(); await flushPromises()
  expect(wrapper.get('[aria-label="上移 密探养成"]').attributes('disabled')).toBeDefined()
  expect(wrapper.get('[aria-label="下移 活动日历"]').attributes('disabled')).toBeDefined()
  await wrapper.get('[aria-label="下移 密探养成"]').trigger('click'); await flushPromises()
  expect(reorderFeedbackCategories).toHaveBeenLastCalledWith(
    ['CUSTOM_HIDDEN', 'OPERATOR', 'CALENDAR'], ['OPERATOR', 'CUSTOM_HIDDEN', 'CALENDAR']
  )
  expect(categoryNames(wrapper)).toEqual(['隐藏板块（已隐藏）', '密探养成', '活动日历'])
  await wrapper.get('[aria-label="上移 活动日历"]').trigger('click'); await flushPromises()
  expect(reorderFeedbackCategories).toHaveBeenLastCalledWith(
    ['CUSTOM_HIDDEN', 'CALENDAR', 'OPERATOR'], ['CUSTOM_HIDDEN', 'OPERATOR', 'CALENDAR']
  )
  wrapper.unmount()
  const reloaded = render(); await flushPromises()
  expect(categoryNames(reloaded)).toEqual(['隐藏板块（已隐藏）', '活动日历', '密探养成'])
  await reloaded.get('.access-create').trigger('click')
  expect(reloaded.findAll('.permission-group')[1].findAll('label').map(label => label.text())).toEqual(['活动日历', '密探养成'])
  reloaded.unmount()
})

it('排序保存中禁用重复操作，失败保留原顺序并可重试', async () => {
  getFeedbackAccess.mockResolvedValue({ category_catalog: orderedCategories() })
  let reject
  reorderFeedbackCategories.mockReturnValue(new Promise((_, fail) => { reject = fail }))
  const wrapper = render(); await flushPromises()
  const original = categoryNames(wrapper)
  await wrapper.get('[aria-label="下移 密探养成"]').trigger('click')
  expect(wrapper.get('[role="status"]').text()).toContain('正在保存板块')
  expect(wrapper.findAll('.category-list button').every(button => button.attributes('disabled') !== undefined)).toBe(true)
  await wrapper.get('[aria-label="上移 活动日历"]').trigger('click')
  expect(reorderFeedbackCategories).toHaveBeenCalledTimes(1)
  expect(categoryNames(wrapper)).toEqual(original)
  reject(Object.assign(new Error('反馈板块顺序已更新，请刷新后重试'), { status: 409 })); await flushPromises()
  expect(categoryNames(wrapper)).toEqual(original)
  expect(wrapper.get('[role="alert"]').text()).toContain('请刷新后重试')
  expect(wrapper.get('[aria-label="下移 密探养成"]').attributes('disabled')).toBeUndefined()
  reorderFeedbackCategories.mockResolvedValue([orderedCategories()[1], orderedCategories()[0], orderedCategories()[2]])
  await wrapper.get('[aria-label="下移 密探养成"]').trigger('click'); await flushPromises()
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  expect(categoryNames(wrapper)[0]).toContain('隐藏板块')
  wrapper.unmount()
})

it('排序无权限时走原403页面并保留当前顺序', async () => {
  getFeedbackAccess.mockResolvedValue({ category_catalog: orderedCategories() })
  reorderFeedbackCategories.mockRejectedValue(Object.assign(new Error('权限不足'), { status: 403 }))
  const wrapper = render(); await flushPromises()
  const original = categoryNames(wrapper)
  await wrapper.get('[aria-label="下移 密探养成"]').trigger('click'); await flushPromises()
  expect(router.replace).toHaveBeenCalledWith({ path: '/forbidden', query: { from: '/feedback/admin' } })
  expect(categoryNames(wrapper)).toEqual(original)
  wrapper.unmount()
})

it('改名期间禁止排序，离开页面后的排序响应不继续请求目录', async () => {
  getFeedbackAccess.mockResolvedValue({ category_catalog: orderedCategories() })
  const pending = deferred()
  reorderFeedbackCategories.mockReturnValue(pending.promise)
  const wrapper = render(); await flushPromises()
  await wrapper.get('[aria-label="重命名 密探养成"]').trigger('click')
  expect(wrapper.get('[aria-label="上移 活动日历"]').attributes('disabled')).toBeDefined()
  await wrapper.get('[aria-label="上移 活动日历"]').trigger('click')
  expect(reorderFeedbackCategories).not.toHaveBeenCalled()
  await wrapper.get('.category-list li button:last-child').trigger('click')
  await wrapper.get('[aria-label="下移 密探养成"]').trigger('click')
  const reads = getFeedbackAccess.mock.calls.length
  wrapper.unmount()
  pending.resolve(orderedCategories().reverse()); await flushPromises()
  expect(getFeedbackAccess).toHaveBeenCalledTimes(reads)
  expect(reorderFeedbackCategories).toHaveBeenCalledTimes(1)
})

it('超级管理员新增和改名板块后重新读取目录', async () => {
  const wrapper = render(); await flushPromises()
  await wrapper.get('#new-feedback-category').setValue('新板块')
  getFeedbackAccess.mockResolvedValue({ available_categories: [
    { key: 'OPERATOR', label: '密探养成' }, { key: 'CUSTOM_TEST', label: '新板块' }
  ] })
  await wrapper.get('.category-create').trigger('submit'); await flushPromises()
  expect(createFeedbackCategory).toHaveBeenCalledWith('新板块')
  expect(wrapper.get('.category-list').text()).toContain('新板块')

  await wrapper.get('[aria-label="重命名 新板块"]').trigger('click')
  await wrapper.get('[aria-label="修改 新板块 名称"]').setValue('新名称')
  getFeedbackAccess.mockResolvedValue({ available_categories: [
    { key: 'OPERATOR', label: '密探养成' }, { key: 'CUSTOM_TEST', label: '新名称' }
  ] })
  await wrapper.get('.category-list li:last-child button').trigger('click'); await flushPromises()
  expect(renameFeedbackCategory).toHaveBeenCalledWith('CUSTOM_TEST', '新名称')
  expect(wrapper.get('.category-list').text()).toContain('新名称')
  wrapper.unmount()
})

it('权限任务身份明确，新增授权位于用户授权工作区', async () => {
  const wrapper = render(); await flushPromises()
  expect(wrapper.get('main h1').text()).toBe('反馈权限')
  expect(wrapper.find('main > header button').exists()).toBe(false)
  expect(wrapper.get('.access-heading').text()).toContain('用户授权')
  expect(wrapper.get('.access-heading .access-create').text()).toBe('新增授权')
  expect(wrapper.findAll('.access-create')).toHaveLength(1)
  wrapper.unmount()
})

it('a slower old user search cannot replace the latest candidates', async () => {
  const old = deferred()
  searchFeedbackAccessUsers.mockImplementation(({ q }) => q === 'first' ? old.promise : Promise.resolve([user('second')]))
  const wrapper = render(); await flushPromises()
  await wrapper.get('.access-create').trigger('click')
  await search(wrapper, 'first'); await search(wrapper, 'second')
  old.resolve([user('first')]); await flushPromises()
  expect(wrapper.get('.user-result').text()).toContain('second')
  expect(wrapper.get('.user-result').text()).not.toContain('first')
})

it('岗位和旧授权均展示后端提供的同一板块目录', async () => {
  getFeedbackAccess.mockResolvedValue({ available_categories: [
    { key: 'STAR', label: '星石' }, { key: 'MAAYUAN', label: '麻圆' }
  ] })
  const wrapper = render(); await flushPromises()
  await wrapper.get('.access-create').trigger('click')
  const groups = wrapper.findAll('.permission-group')
  expect(groups).toHaveLength(5)
  expect(groups.slice(1).every(group => group.text().includes('星石') && group.text().includes('麻圆'))).toBe(true)
  wrapper.unmount()
})

it('岗位与兼容权限分开预览，折叠后保存不丢旧授权', async () => {
  listFeedbackAccessGrants.mockResolvedValue([{
    userId: 'manager', userName: '测试管理员', feedbackRoles: ['OPERATOR'], operatorAreas: ['OPERATOR'],
    developerAreas: [], receiveAreas: ['OPERATOR'], manageAreas: ['OPERATOR']
  }])
  dialog.confirm.mockResolvedValue(true)
  const wrapper = render(); await flushPromises()
  await wrapper.get('[aria-label="编辑 测试管理员"]').trigger('click')
  expect(wrapper.get('.legacy-permissions').attributes('open')).toBeUndefined()
  expect(wrapper.get('.access-preview').text()).toContain('工作台运营板块：密探养成')
  expect(wrapper.get('.access-preview').text()).toContain('不会自动授予工作台岗位')
  await wrapper.get('.modal-foot .primary').trigger('click'); await flushPromises()
  expect(updateFeedbackAccessGrant).toHaveBeenCalledWith('manager', expect.objectContaining({
    feedbackRoles: ['OPERATOR'], operatorAreas: ['OPERATOR'], receiveAreas: ['OPERATOR'], manageAreas: ['OPERATOR']
  }))
  wrapper.unmount()
})

it('权限弹窗的原生折叠入口参与焦点顺序，Esc 归还焦点', async () => {
  const wrapper = render({ attachTo: document.body }); await flushPromises()
  const opener = wrapper.get('.access-create').element
  opener.focus()
  await wrapper.get('.access-create').trigger('click'); await flushPromises()
  const panel = wrapper.get('.access-modal').element
  expect(panel.contains(document.activeElement)).toBe(true)
  const summary = wrapper.get('.legacy-permissions summary').element
  summary.focus()
  const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
  summary.dispatchEvent(tab)
  expect(tab.defaultPrevented).toBe(false)
  summary.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  await flushPromises()
  expect(wrapper.find('.access-modal').exists()).toBe(false)
  expect(document.activeElement).toBe(opener)
  wrapper.unmount()
})

it('closing and reopening the editor invalidates a previous in-flight candidate search', async () => {
  const pending = deferred()
  searchFeedbackAccessUsers.mockReturnValue(pending.promise)
  const wrapper = render(); await flushPromises()
  await wrapper.get('.access-create').trigger('click')
  await search(wrapper, 'first')
  await wrapper.get('[aria-label="关闭"]').trigger('click')
  await wrapper.get('.access-create').trigger('click')
  pending.resolve([user('first')]); await flushPromises()
  expect(wrapper.find('.user-result').exists()).toBe(false)
})

it('confirmation freezes the reviewed permission grant and prevents duplicate saves', async () => {
  const pending = deferred()
  dialog.confirm.mockReturnValue(pending.promise)
  listFeedbackAccessGrants.mockResolvedValue([{ userId: 'manager', userName: '测试管理员', receiveAreas: ['OPERATOR'], manageAreas: [] }])
  const wrapper = render(); await flushPromises()
  await wrapper.get('[aria-label="编辑 测试管理员"]').trigger('click')
  await wrapper.get('.modal-foot .primary').trigger('click'); await flushPromises()
  expect(wrapper.get('.modal-foot .primary').attributes('disabled')).toBeDefined()
  expect(wrapper.get('.permission-group').attributes('disabled')).toBeDefined()
  await wrapper.get('.modal-foot .primary').trigger('click')
  expect(dialog.confirm).toHaveBeenCalledTimes(1)
  pending.resolve(true); await flushPromises()
  expect(updateFeedbackAccessGrant).toHaveBeenCalledExactlyOnceWith('manager', expect.objectContaining({ receiveAreas: ['OPERATOR'], manageAreas: [] }))
})

it('leaving the page before confirmation resolves cannot save a grant later', async () => {
  const pending = deferred()
  dialog.confirm.mockReturnValue(pending.promise)
  listFeedbackAccessGrants.mockResolvedValue([{ userId: 'manager', userName: '测试管理员', receiveAreas: [], manageAreas: [] }])
  const wrapper = render(); await flushPromises()
  await wrapper.get('[aria-label="编辑 测试管理员"]').trigger('click')
  await wrapper.get('.modal-foot .primary').trigger('click'); await flushPromises()
  wrapper.unmount()
  pending.resolve(true); await flushPromises()
  expect(updateFeedbackAccessGrant).not.toHaveBeenCalled()
})


it('隐藏全部板块后仍可恢复，授权选择不显示隐藏项且保存保留既有授权', async () => {
  const visible = { key: 'OPERATOR', label: '密探养成', hidden: false }
  const hidden = { ...visible, hidden: true }
  listFeedbackAccessGrants.mockResolvedValue([{
    userId: 'manager', userName: '测试管理员', feedbackRoles: ['OPERATOR'],
    operatorAreas: ['OPERATOR'], receiveAreas: ['OPERATOR'], manageAreas: ['OPERATOR']
  }])
  const wrapper = render(); await flushPromises()
  getFeedbackAccess.mockResolvedValue({ available_categories: [], category_catalog: [hidden] })
  await wrapper.get('[aria-label="隐藏 密探养成"]').trigger('click'); await flushPromises()
  expect(setFeedbackCategoryHidden).toHaveBeenCalledWith('OPERATOR', true)
  expect(wrapper.get('.category-list').text()).toContain('已隐藏')
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)

  await wrapper.get('[aria-label="编辑 测试管理员"]').trigger('click')
  expect(wrapper.findAll('.permission-group').slice(1).every(group => group.findAll('input[type="checkbox"]').length === 0)).toBe(true)
  expect(wrapper.get('.access-preview').text()).toContain('密探养成')
  dialog.confirm.mockResolvedValue(true)
  await wrapper.get('.modal-foot .primary').trigger('click'); await flushPromises()
  expect(updateFeedbackAccessGrant).toHaveBeenCalledWith('manager', expect.objectContaining({
    operatorAreas: ['OPERATOR'], receiveAreas: ['OPERATOR'], manageAreas: ['OPERATOR']
  }))

  getFeedbackAccess.mockResolvedValue({ available_categories: [visible], category_catalog: [visible] })
  await wrapper.get('[aria-label="恢复显示 密探养成"]').trigger('click'); await flushPromises()
  expect(setFeedbackCategoryHidden).toHaveBeenLastCalledWith('OPERATOR', false)
  expect(wrapper.get('.category-list').text()).not.toContain('已隐藏')
  await wrapper.get('.access-create').trigger('click')
  expect(wrapper.findAll('.permission-group')[1].text()).toContain('密探养成')
  wrapper.unmount()
})

it('隐藏请求处理中禁止重复提交，失败保留原状态并提示', async () => {
  const pending = deferred()
  setFeedbackCategoryHidden.mockReturnValue(pending.promise)
  const wrapper = render(); await flushPromises()
  await wrapper.get('[aria-label="隐藏 密探养成"]').trigger('click')
  expect(wrapper.get('[aria-label="隐藏 密探养成"]').attributes('disabled')).toBeDefined()
  await wrapper.get('[aria-label="隐藏 密探养成"]').trigger('click')
  expect(setFeedbackCategoryHidden).toHaveBeenCalledTimes(1)
  pending.resolve(Promise.reject(new Error('目录已更新，请刷新'))); await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('目录已更新')
  expect(wrapper.find('[aria-label="恢复显示 密探养成"]').exists()).toBe(false)
  wrapper.unmount()
})
