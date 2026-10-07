import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import FeedbackPlaza from '../src/components/co-creation/FeedbackPlaza.vue'
import FeedbackSupportButton from '../src/components/co-creation/FeedbackSupportButton.vue'
import SimilarFeedbackList from '../src/components/co-creation/SimilarFeedbackList.vue'
import FeedbackPlazaPage from '../src/pages/feedback/plaza.vue'
import PublicFeedbackDetail from '../src/components/co-creation/PublicFeedbackDetail.vue'
import ChangelogRelatedFeedback from '../src/components/changelog/ChangelogRelatedFeedback.vue'
import * as api from '../src/api/coCreation.js'

const routing = vi.hoisted(() => ({ route: { query: {}, fullPath: '/feedback/plaza' }, push: vi.fn() }))
vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn(), onBeforeRouteUpdate: vi.fn(),
  useRoute: () => routing.route,
  useRouter: () => ({ push: routing.push })
}))
vi.mock('../src/api/coCreation.js', () => ({
  listPublicFeedback: vi.fn(),
  getPublicFeedback: vi.fn(),
  findSimilarFeedback: vi.fn(),
  supportPublicFeedback: vi.fn(),
  unsupportPublicFeedback: vi.fn(),
  normalizePublicFeedback: value => value
}))
vi.mock('../src/store/auth.js', () => ({ auth: { accessToken: 'token', userInfo: { id: 'u1' } } }))

const publicItem = (overrides = {}) => ({
  id: 'rpt_1',
  publicTitle: '数据页面增加当前账号标识',
  publicSummary: '在库存追踪等页面明确显示当前账号。',
  type: 'EXPERIENCE',
  publicStatus: 'IN_PROCESS',
  supportCount: 43,
  supportedByCurrentUser: false,
  publishedAt: '2026-09-01T00:00:00Z',
  publicUpdatedAt: '2026-09-02T00:00:00Z',
  completedAt: null,
  mergedInto: null,
  ...overrides
})

const formatDate = value => (value ? String(value).slice(0, 10) : '')
const render = (component, options = {}) => mount(component, {
  ...options,
  global: { ...(options.global || {}), stubs: { teleport: true, IslandSidebar: true, FeedbackWorkspaceNav: true, RouterLink: RouterLinkStub } }
})

beforeEach(() => {
  vi.clearAllMocks()
  routing.route.query = {}
})

describe('FeedbackPlaza', () => {
  it('renders public cards and opens the detail dialog', async () => {
    api.listPublicFeedback.mockResolvedValue({ items: [publicItem()], total: 1, page: 1, pageSize: 12 })
    api.getPublicFeedback.mockResolvedValue(publicItem())
    const wrapper = render(FeedbackPlaza)
    await flushPromises()

    expect(wrapper.text()).toContain('数据页面增加当前账号标识')
    expect(wrapper.text()).toContain('43 人支持')

    await wrapper.get('.public-card').trigger('click')
    await flushPromises()

    expect(api.getPublicFeedback).toHaveBeenCalledWith('rpt_1')
    expect(wrapper.get('[role="dialog"]').text()).toContain('公开说明')
  })

  it('shows the empty state when there are no public feedback items', async () => {
    api.listPublicFeedback.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 12 })
    const wrapper = render(FeedbackPlaza)
    await flushPromises()

    expect(wrapper.get('.plaza-state.empty').text()).toContain('暂时还没有公开的反馈')
  })

  it.each([['type', 0, 'BUG'], ['status', 1, 'COMPLETED']])('%s无结果使用筛选空态，清除后保留排序并回第一页', async (_, index, value) => {
    api.listPublicFeedback.mockResolvedValue({ items: [], total: 0 })
    const wrapper = render(FeedbackPlaza); await flushPromises()
    await wrapper.findAll('.feedback-status-tabs button')[0].trigger('click'); await flushPromises()
    const previousSort = api.listPublicFeedback.mock.lastCall[0].sort
    await wrapper.findAll('.feedback-filter select')[index].setValue(value); await flushPromises()
    expect(wrapper.get('.plaza-state.empty').text()).toContain('当前筛选没有找到')
    expect(wrapper.get('.plaza-state.empty').text()).not.toContain('暂时还没有公开')
    await wrapper.get('.plaza-state.empty .feedback-button').trigger('click'); await flushPromises()
    expect(api.listPublicFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, type: undefined, status: undefined, keyword: undefined, sort: previousSort }))
    expect(wrapper.findAll('.feedback-filter select').every(select => select.element.value === '')).toBe(true)
    expect(wrapper.get('.plaza-state.empty').text()).toContain('暂时还没有公开')
  })

  it('清除关键词同时取消待执行搜索，纯空格不算筛选', async () => {
    vi.useFakeTimers()
    api.listPublicFeedback.mockResolvedValue({ items: [], total: 0 })
    const wrapper = render(FeedbackPlaza); await flushPromises()
    await wrapper.get('input[type="search"]').setValue('   ')
    expect(wrapper.get('.plaza-state.empty').text()).toContain('暂时还没有公开')
    await wrapper.get('input[type="search"]').setValue('不存在的反馈')
    await wrapper.get('.plaza-state.empty .feedback-button').trigger('click'); await flushPromises()
    const count = api.listPublicFeedback.mock.calls.length
    await vi.advanceTimersByTimeAsync(400); await flushPromises()
    expect(api.listPublicFeedback).toHaveBeenCalledTimes(count)
    expect(wrapper.get('input[type="search"]').element.value).toBe('')
    expect(api.listPublicFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, keyword: undefined }))
  })

  it('筛选请求失败保留条件与重试，重试成功后才显示筛选空态', async () => {
    api.listPublicFeedback.mockResolvedValue({ items: [], total: 0 })
    const wrapper = render(FeedbackPlaza); await flushPromises()
    api.listPublicFeedback.mockRejectedValueOnce(new Error('offline'))
    await wrapper.findAll('.feedback-filter select')[0].setValue('BUG'); await flushPromises()
    expect(wrapper.find('.plaza-state.empty').exists()).toBe(false)
    expect(wrapper.get('.plaza-state.error').text()).toContain('反馈加载失败')
    expect(wrapper.findAll('.feedback-filter select')[0].element.value).toBe('BUG')
    await wrapper.get('.plaza-state.error button').trigger('click'); await flushPromises()
    expect(wrapper.get('.plaza-state.empty').text()).toContain('当前筛选没有找到')
  })
})

describe('FeedbackSupportButton', () => {
  it('supports on first click and emits the updated detail', async () => {
    api.supportPublicFeedback.mockResolvedValue(publicItem({ supportedByCurrentUser: true, supportCount: 44 }))
    const wrapper = render(FeedbackSupportButton, {
      props: { id: 'rpt_1', type: 'BUG', supported: false, supportCount: 43 }
    })

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(api.supportPublicFeedback).toHaveBeenCalledWith('rpt_1')
    expect(api.unsupportPublicFeedback).not.toHaveBeenCalled()
    const emitted = wrapper.emitted('updated')
    expect(emitted).toBeTruthy()
    expect(emitted[0][0].supportCount).toBe(44)
    expect(emitted[0][0].supportedByCurrentUser).toBe(true)
  })

  it('cancels support when already supported and surfaces failures', async () => {
    api.unsupportPublicFeedback.mockResolvedValue(publicItem({ supportedByCurrentUser: false, supportCount: 42 }))
    const wrapper = render(FeedbackSupportButton, {
      props: { id: 'rpt_1', type: 'FEATURE', supported: true, supportCount: 43 }
    })

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(api.unsupportPublicFeedback).toHaveBeenCalledWith('rpt_1')
    expect(wrapper.emitted('updated')[0][0].supportCount).toBe(42)
  })

  it('shows an error and emits it when the request fails', async () => {
    api.supportPublicFeedback.mockRejectedValue(new Error('支持失败'))
    const wrapper = render(FeedbackSupportButton, { props: { id: 'rpt_1', type: 'BUG', supportCount: 0 } })

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(wrapper.get('.support-error').text()).toContain('支持失败')
    expect(wrapper.emitted('error')).toBeTruthy()
  })
})

describe('SimilarFeedbackList', () => {
  it('renders candidates and opens details in a new tab', () => {
    const wrapper = render(SimilarFeedbackList, { props: { items: [publicItem()] } })
    expect(wrapper.text()).toContain('可能已经有人反馈')

    const detailLink = wrapper.get('.similar-actions a')
    expect(detailLink.text()).toBe('查看详情（新标签页）')
    expect(detailLink.attributes('href')).toBe('/feedback/plaza?feedback=rpt_1')
    expect(detailLink.attributes('target')).toBe('_blank')
    expect(detailLink.attributes('rel')).toBe('noopener noreferrer')
  })

  it('renders nothing when there are no candidates and not loading', () => {
    const wrapper = render(SimilarFeedbackList, { props: { items: [], loading: false } })
    expect(wrapper.text()).toBe('')
  })
})

describe('反馈中心公开广场', () => {
  it('合并主反馈和更新日志引用都进入新的公开广场', async () => {
    const detail = render(PublicFeedbackDetail, { props: { item: publicItem({ mergedInto: { id: 'main_1', publicTitle: '主反馈' } }), formatDate } })
    expect(detail.getComponent(RouterLinkStub).props('to')).toEqual({ path: '/feedback/plaza', query: { feedback: 'main_1' } })
    api.listPublicFeedback.mockResolvedValue({ items: [publicItem()] })
    const changelog = render(ChangelogRelatedFeedback, { props: { versionId: 'version_1' } })
    await flushPromises()
    expect(changelog.getComponent(RouterLinkStub).props('to')).toEqual({ path: '/feedback/plaza', query: { feedback: 'rpt_1' } })
  })
  it('访客页面仅读取公开反馈，并保留直接提交入口', async () => {
    api.listPublicFeedback.mockResolvedValue({ items: [publicItem()], total: 1 })
    const wrapper = render(FeedbackPlazaPage)
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('反馈广场')
    expect(wrapper.get('.plaza-context').text()).toContain('这里只展示管理员整理后的公开内容')
    expect(wrapper.get('.plaza-submit').text()).toBe('提交反馈')
    expect(wrapper.get('.plaza-submit').getComponent(RouterLinkStub).props('to')).toBe('/feedback?new=1')
    expect(api.listPublicFeedback).toHaveBeenCalled()
  })
  it('旧许愿入口的类型筛选和公开详情意图传递给广场', async () => {
    routing.route.query = { type: 'FEATURE', feedback: 'rpt_1' }
    api.listPublicFeedback.mockResolvedValue({ items: [], total: 0 })
    api.getPublicFeedback.mockResolvedValue(publicItem({ type: 'FEATURE' }))
    const wrapper = render(FeedbackPlazaPage)
    await flushPromises()
    expect(api.listPublicFeedback).toHaveBeenCalledWith(expect.objectContaining({ type: 'FEATURE' }))
    expect(api.getPublicFeedback).toHaveBeenCalledWith('rpt_1')
    expect(wrapper.get('[role="dialog"]').text()).toContain('公开说明')
  })
  it('搜索无结果时提交直接打开反馈表单并携带类型', async () => {
    api.listPublicFeedback.mockResolvedValue({ items: [], total: 0 })
    const wrapper = render(FeedbackPlaza, { props: { initialType: 'FEATURE' } })
    await flushPromises()
    await wrapper.get('.plaza-state.empty .feedback-primary-action').trigger('click')
    expect(routing.push).toHaveBeenCalledWith({ path: '/feedback', query: { new: '1', type: 'FEATURE' } })
  })
})
