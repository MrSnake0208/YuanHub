import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import Page from '../src/pages/achievement/suggestions.vue'
import { auth } from '../src/store/auth.js'
import * as api from '../src/api/achievementSuggestions.js'
import { candidateErrors, newCandidate } from '../src/pages/achievement/suggestionRules.js'
vi.mock('../src/store/auth.js', async () => ({ auth: (await import('vue')).reactive({ userInfo: { id: 'owner' }, adminAccess: { permissions: [] } }) }))
vi.mock('../src/api/achievementSuggestions.js', () => ({ getSuggestionOptions: vi.fn(), getSuggestionReviewOptions: vi.fn(), submitAchievementSuggestion: vi.fn(), getMyAchievementSuggestions: vi.fn(), getAchievementSuggestion: vi.fn(), getAchievementSuggestionQueue: vi.fn(), reviewAchievementSuggestion: vi.fn() }))
const categories = [{ category_id: 'cat_test', name: '测试分类', enabled: true }]
const rewardItems = [{ item_key: 'test_coin', name: '测试币', games: ['如鸢', '代号鸢'] }]
const options = () => ({ catalog: { categories }, reward_items: rewardItems })
const reviewOptions = () => ({ revision: 3, draft: { categories }, reward_items: rewardItems, compatibility_issues: [] })
const row = (status = 'PENDING') => ({ suggestion: { id: 's1', original: { ...newCandidate('代号鸢'), name: '原稿名称', category_id: 'cat_test', condition: '原稿条件' }, status, version: 0, source_url: 'https://example.com', submission_note: '<b>文本</b>', reviewed_at: null }, currently_published: null })
const list = value => ({ items: value ? [value] : [], total: value ? 1 : 0, page: 1, page_size: 20 })
const button = (w, label) => w.findAll('button').find(b => b.text() === label)
let wrappers = []
async function page(review = false, query = '') {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: Page, props: { review } }, { path: '/mine', component: Page, props: { review: false } }] })
  await router.push('/' + query); await router.isReady()
  const w = mount(RouterView, { attachTo: document.body, global: { plugins: [router], stubs: { IslandSidebar: true, RouterLink: RouterLinkStub } } })
  wrappers.push(w); await flushPromises(); return w
}
beforeEach(() => {
  vi.resetAllMocks(); auth.userInfo = { id: 'owner' }; auth.adminAccess = { permissions: [] }
  api.getSuggestionOptions.mockResolvedValue(options()); api.getSuggestionReviewOptions.mockResolvedValue(reviewOptions())
  api.getMyAchievementSuggestions.mockResolvedValue(list(null)); api.getAchievementSuggestionQueue.mockResolvedValue(list(row()))
  api.getAchievementSuggestion.mockResolvedValue(row())
})
afterEach(() => { wrappers.forEach(w => { const element = w.element; w.unmount(); element.remove() }); wrappers = []; vi.restoreAllMocks() })
async function fill(w) {
  await w.get('#candidate-name').setValue('候选名称'); await w.get('#candidate-category_id').setValue('cat_test'); await w.get('#candidate-source_url').setValue('https://example.com/source')
}
it('未填写时聚焦摘要并链接字段，输入保留', async () => {
  const w = await page(); await w.find('form').trigger('submit')
  expect(w.get('[role="alert"]').element).toBe(document.activeElement)
  expect(w.get('[href="#candidate-name"]').exists()).toBe(true)
  expect(w.get('#candidate-name').attributes('aria-describedby')).toBe('candidate-name-error')
  expect(api.submitAchievementSuggestion).not.toHaveBeenCalled()
})
it('不确定提交原样重试同一请求键，成功显示待审且不写个人档案', async () => {
  const w = await page(); await fill(w)
  api.submitAchievementSuggestion.mockRejectedValueOnce(new Error('网络中断')).mockResolvedValueOnce(row())
  await w.find('form').trigger('submit'); await flushPromises()
  expect(w.get('#candidate-name').element.value).toBe('候选名称')
  expect(w.get('fieldset').attributes('disabled')).toBeDefined()
  const first = api.submitAchievementSuggestion.mock.calls[0][0]
  expect(first.candidate.achievement_id).toBeUndefined(); expect(first.candidate.sort).toBeUndefined()
  await button(w, '重试上次提交').trigger('click'); await flushPromises()
  expect(api.submitAchievementSuggestion.mock.calls[1][0]).toEqual(first)
  expect(api.submitAchievementSuggestion.mock.calls[0][1]).toBe('owner')
  expect(w.text()).toContain('已提交，等待管理员审核')
})
it('身份变更清空私有内容并忽略旧身份的晚到响应', async () => {
  let resolve
  api.getMyAchievementSuggestions.mockReturnValueOnce(new Promise(r => { resolve = r })).mockResolvedValue(list(null))
  const w = await page(false, '?mode=mine')
  auth.userInfo = { id: 'other' }; await flushPromises(); resolve(list(row())); await flushPromises()
  expect(w.text()).not.toContain('原稿名称')
  expect(api.getMyAchievementSuggestions.mock.calls.at(-1)[1]).toBe('other')
})
it('本人详情转义来源备注并按当前公开目录区分采纳与发布', async () => {
  const accepted = row('ACCEPTED'); accepted.suggestion.achievement_id = 'yh_new'; accepted.currently_published = false
  api.getMyAchievementSuggestions.mockResolvedValue(list(accepted)); api.getAchievementSuggestion.mockResolvedValue(accepted)
  const w = await page(false, '?mode=mine'); await w.get('.suggestion-list button').trigger('click'); await flushPromises()
  expect(w.text()).toContain('已采纳到草稿，待管理员发布'); expect(w.text()).toContain('当前尚未发布')
  expect(w.text()).toContain('<b>文本</b>'); expect(w.find('.suggestion-detail b').exists()).toBe(false)
  expect(api.getAchievementSuggestion).toHaveBeenCalledWith('s1', 'owner', false)
})
it('只有活动管理权限不能读取成就审核队列', async () => {
  auth.adminAccess = { permissions: ['activity_calendar:write'] }
  const w = await page(true)
  expect(w.text()).toContain('需要成就目录管理权限'); expect(api.getAchievementSuggestionQueue).not.toHaveBeenCalled()
})
it('审核版本冲突保留修正，刷新版本后只采纳到草稿', async () => {
  auth.adminAccess = { permissions: ['achievement_catalog:write'] }
  const w = await page(true); await w.get('.suggestion-list button').trigger('click'); await flushPromises()
  await w.get('#candidate-name').setValue('管理员修正')
  api.reviewAchievementSuggestion.mockRejectedValueOnce(Object.assign(new Error('目录版本冲突'), { status: 409 }))
  await button(w, '采纳到草稿').trigger('click'); await flushPromises()
  expect(w.get('#candidate-name').element.value).toBe('管理员修正')
  expect(api.reviewAchievementSuggestion.mock.calls[0][2]).toMatchObject({ expected_version: 0, expected_catalog_revision: 3, candidate: { name: '管理员修正' } })
  api.getSuggestionReviewOptions.mockResolvedValue({ ...reviewOptions(), revision: 4 })
  await button(w, '刷新审核与目录版本（保留修正）').trigger('click'); await flushPromises()
  expect(w.get('#candidate-name').element.value).toBe('管理员修正')
  const accepted = row('ACCEPTED'); accepted.suggestion.achievement_id = 'yh_new'; accepted.currently_published = false
  api.reviewAchievementSuggestion.mockResolvedValueOnce(accepted)
  await button(w, '采纳到草稿').trigger('click'); await flushPromises()
  expect(api.reviewAchievementSuggestion.mock.calls[1][2].expected_catalog_revision).toBe(4)
  expect(w.text()).toContain('已采纳到草稿，尚未发布')
  expect(w.findAllComponents(RouterLinkStub).some(l => l.props('to')?.query?.entry === 'yh_new')).toBe(true)
})
it('拒绝要求审核原因，不发送空理由', async () => {
  auth.adminAccess = { permissions: ['achievement_catalog:write'] }
  const w = await page(true); await w.get('.suggestion-list button').trigger('click'); await flushPromises()
  await button(w, '不采纳').trigger('click'); await flushPromises()
  expect(w.text()).toContain('请说明不采纳原因'); expect(api.reviewAchievementSuggestion).not.toHaveBeenCalled()
  await w.get('#candidate-review_note').setValue('与已有条目重复')
  api.reviewAchievementSuggestion.mockResolvedValue(row('REJECTED'))
  await button(w, '不采纳').trigger('click'); await flushPromises()
  expect(api.reviewAchievementSuggestion.mock.calls[0][1]).toBe('reject')
  expect(api.reviewAchievementSuggestion.mock.calls[0][2].review_note).toBe('与已有条目重复')
})
it('未知奖励不变为零，奖励与目标校验覆盖边界', () => {
  const candidate = { ...newCandidate('如鸢'), category_id: 'cat_test', name: '候选' }
  expect(candidate.rewards).toBe(null)
  expect(candidateErrors(candidate, categories, rewardItems)).toEqual({})
  candidate.target = 0; expect(candidateErrors(candidate, categories, rewardItems).target).toBeTruthy()
  candidate.rewards = [{ item_key: 'test_coin', name: '测试币', quantity: 0 }]
  expect(candidateErrors(candidate, categories, rewardItems).rewards).toBeTruthy()
})


it('同一页面组件从审核路由切换到本人路由时清空审核详情', async () => {
  auth.adminAccess = { permissions: ['achievement_catalog:write'] }
  const w = await page(true)
  await w.get('.suggestion-list button').trigger('click'); await flushPromises()
  expect(w.text()).toContain('原稿条件')
  await w.vm.$router.push('/mine'); await flushPromises()
  expect(w.text()).not.toContain('原稿条件')
  expect(w.get('#candidate-name').element.value).toBe('')
  await button(w, '我的投稿').trigger('click'); await flushPromises()
  expect(w.text()).toContain('暂无符合条件的投稿')
  expect(api.getMyAchievementSuggestions).toHaveBeenCalled()
})
