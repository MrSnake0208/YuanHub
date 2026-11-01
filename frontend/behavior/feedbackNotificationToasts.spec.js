import { expect, it } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import FeedbackNotificationToasts from '../src/components/FeedbackNotificationToasts.vue'
import { notificationRealtimeState, dismissFeedbackNotification } from '../src/store/notificationRealtime.js'
import { notificationUnreadState } from '../src/store/notificationUnread.js'

it('卡片呈现私信摘要和两种详情路径，关闭卡片保留未读', async () => {
  notificationUnreadState.count = 2
  notificationRealtimeState.toasts = [
    { id: 'reply', kind: 'FEEDBACK_REPLY', refId: 'rpt a', title: '管理员回复', body: '请重试' },
    { id: 'message', kind: 'FEEDBACK_MESSAGE_FROM_REPORTER', refId: 'rpt_b', title: '用户追加', body: '还有这个问题' }
  ]
  const wrapper = mount(FeedbackNotificationToasts, { global: { stubs: { RouterLink: RouterLinkStub } } })
  try {
    const cards = wrapper.findAll('article')
    expect(cards[0].text()).toContain('管理员回复')
    expect(cards[0].text()).toContain('请重试')
    const links = wrapper.findAllComponents(RouterLinkStub)
    expect(links[0].props('to')).toBe('/feedback?id=rpt%20a')
    expect(links[1].props('to')).toBe('/feedback/manage?id=rpt_b')
    await cards[0].get('button').trigger('click'); await flushPromises()
    expect(notificationRealtimeState.toasts.map(item => item.id)).toEqual(['message'])
    expect(notificationUnreadState.count).toBe(2)
  } finally { wrapper.unmount(); dismissFeedbackNotification('message') }
})
