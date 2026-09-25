import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import FeedbackPlaza from '../src/components/co-creation/FeedbackPlaza.vue'
import FeedbackSupportButton from '../src/components/co-creation/FeedbackSupportButton.vue'
import SimilarFeedbackList from '../src/components/co-creation/SimilarFeedbackList.vue'
import * as api from '../src/api/coCreation.js'

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {}, fullPath: '/co-creation' }),
  useRouter: () => ({ push: vi.fn() })
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
  global: { ...(options.global || {}), stubs: { teleport: true } }
})

beforeEach(() => {
  vi.clearAllMocks()
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
  it('renders candidates and emits view', async () => {
    const wrapper = render(SimilarFeedbackList, { props: { items: [publicItem()] } })
    expect(wrapper.text()).toContain('可能已经有人反馈')

    const viewButton = wrapper.findAll('button').find(button => button.text() === '查看详情')
    await viewButton.trigger('click')
    expect(wrapper.emitted('view')[0][0].id).toBe('rpt_1')
  })

  it('renders nothing when there are no candidates and not loading', () => {
    const wrapper = render(SimilarFeedbackList, { props: { items: [], loading: false } })
    expect(wrapper.text()).toBe('')
  })
})
