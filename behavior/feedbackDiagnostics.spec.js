import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import FeedbackTicketDetail from '../src/components/feedback/FeedbackTicketDetail.vue'

vi.mock('../src/api/feedback.js', () => ({ downloadFeedbackAttachment: vi.fn() }))

const baseItem = { id: 'rpt_1', status: 'OPEN', content: '反馈内容', messages: [] }

function mountDetail(item, extra = {}) {
  return mount(FeedbackTicketDetail, {
    props: { item, formatDate: () => '2026-01-02', ...extra }
  })
}

describe('反馈工单应用诊断信息', () => {
  it('管理员视图以低权重单行展示产品版本与 Build', () => {
    const wrapper = mountDetail(
      { ...baseItem, diagnostics: { productVersion: '0.9.0-beta.1', frontendCommit: 'abc1234', buildTime: '2026-01-02T03:04:05Z' } },
      { showReporter: true }
    )
    const line = wrapper.get('.detail-build')
    expect(line.text()).toBe('YuanHub v0.9.0-beta.1 · Build abc1234')
    // 构建时间只在 title 中补充，避免增加视觉权重
    expect(line.attributes('title')).toContain('2026-01-02T03:04:05Z')
  })

  it('无 Git 环境 commit 为 unknown 时只显示版本号', () => {
    const wrapper = mountDetail(
      { ...baseItem, diagnostics: { productVersion: '0.9.0-beta.1', frontendCommit: 'unknown', buildTime: 'unknown' } },
      { showReporter: true }
    )
    expect(wrapper.get('.detail-build').text()).toBe('YuanHub v0.9.0-beta.1')
  })

  it('旧工单缺少 diagnostics 时不渲染诊断行', () => {
    const wrapper = mountDetail(baseItem, { showReporter: true })
    expect(wrapper.find('.detail-build').exists()).toBe(false)
  })

  it('diagnostics 存在但产品版本为空时不伪造版本号', () => {
    const wrapper = mountDetail(
      { ...baseItem, diagnostics: { productVersion: '', frontendCommit: 'abc1234', buildTime: '' } },
      { showReporter: true }
    )
    expect(wrapper.find('.detail-build').exists()).toBe(false)
  })

  it('提交人视图不展示诊断行', () => {
    const wrapper = mountDetail({
      ...baseItem,
      diagnostics: { productVersion: '0.9.0-beta.1', frontendCommit: 'abc1234', buildTime: 't' }
    })
    expect(wrapper.find('.detail-build').exists()).toBe(false)
  })

  it('诊断行不改变现有消息左右排列', () => {
    const wrapper = mountDetail({
      ...baseItem,
      diagnostics: { productVersion: '0.9.0-beta.1', frontendCommit: 'abc1234', buildTime: 't' },
      messages: [
        {
          id: 'm1',
          senderKind: 'REPORTER',
          isAdmin: false,
          author: { id: 'user1', userName: '提交人' },
          content: '用户消息',
          createdAt: '2026-01-01T00:00:00Z',
          images: [],
          files: []
        },
        {
          id: 'm2',
          senderKind: 'ADMIN',
          isAdmin: true,
          author: { id: 'admin1', userName: '管理员' },
          content: '管理员消息',
          createdAt: '2026-01-01T00:00:00Z',
          images: [],
          files: []
        }
      ]
    }, { showReporter: true, viewerUserId: 'admin1', viewerActorMode: 'ADMIN' })

    const messages = wrapper.findAll('.detail-message')
    expect(messages).toHaveLength(2)
    // 管理员视角：提交人 = 对方（左），管理员 = 自己（右）
    expect(messages[0].classes()).toContain('is-reporter')
    expect(messages[0].classes()).toContain('is-other')
    expect(messages[1].classes()).toContain('is-admin')
    expect(messages[1].classes()).toContain('is-self')
    expect(wrapper.find('.detail-build').exists()).toBe(true)
  })
})
