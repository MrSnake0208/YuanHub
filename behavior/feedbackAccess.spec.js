import { beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import FeedbackAccess from '../src/pages/feedback/admin.vue'
import { searchFeedbackAccessUsers } from '../src/api/user.js'
import { getFeedbackAccess, listFeedbackAccessGrants, updateFeedbackAccessGrant } from '../src/api/feedback.js'
import { dialog } from '../src/utils/dialog.js'

vi.mock('vue-router', () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('../src/store/auth.js', () => ({ auth: {
  userInfo: { id: 'root' }, adminAccess: { permissions: ['admin:feedback_access:manage'], manageAreas: [] }
} }))
vi.mock('../src/store/feedbackUnread.js', () => ({ feedbackUnreadState: { count: 0 } }))
vi.mock('../src/api/feedback.js', () => ({
  listFeedbackAccessGrants: vi.fn(), getFeedbackAccess: vi.fn(), updateFeedbackAccessGrant: vi.fn(), deleteFeedbackAccessGrant: vi.fn()
}))
vi.mock('../src/api/user.js', () => ({ searchFeedbackAccessUsers: vi.fn() }))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn() } }))
const render = () => mount(FeedbackAccess, { global: { stubs: {
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
  getFeedbackAccess.mockReset().mockResolvedValue({ availableAreas: [] })
  listFeedbackAccessGrants.mockReset().mockResolvedValue([])
  searchFeedbackAccessUsers.mockReset().mockResolvedValue([])
  updateFeedbackAccessGrant.mockReset().mockResolvedValue({})
  dialog.confirm.mockReset()
})

it('a slower old user search cannot replace the latest candidates', async () => {
  const old = deferred()
  searchFeedbackAccessUsers.mockImplementation(({ q }) => q === 'first' ? old.promise : Promise.resolve([user('second')]))
  const wrapper = render(); await flushPromises()
  await wrapper.get('.feedback-hero-action').trigger('click')
  await search(wrapper, 'first'); await search(wrapper, 'second')
  old.resolve([user('first')]); await flushPromises()
  expect(wrapper.get('.user-result').text()).toContain('second')
  expect(wrapper.get('.user-result').text()).not.toContain('first')
})

it('closing and reopening the editor invalidates a previous in-flight candidate search', async () => {
  const pending = deferred()
  searchFeedbackAccessUsers.mockReturnValue(pending.promise)
  const wrapper = render(); await flushPromises()
  await wrapper.get('.feedback-hero-action').trigger('click')
  await search(wrapper, 'first')
  await wrapper.get('[aria-label="关闭"]').trigger('click')
  await wrapper.get('.feedback-hero-action').trigger('click')
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
