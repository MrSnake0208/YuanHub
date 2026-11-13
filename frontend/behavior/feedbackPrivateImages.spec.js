import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import FeedbackTicketDetail from '../src/components/feedback/FeedbackTicketDetail.vue'
import { downloadFeedbackAttachment } from '../src/api/feedback.js'

vi.mock('../src/api/feedback.js', () => ({ downloadFeedbackAttachment: vi.fn() }))
beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: vi.fn(), revokeObjectURL: vi.fn() }))
})
afterEach(() => vi.unstubAllGlobals())
const item = id => ({ id, status: 'OPEN', messages: [{ id: 'msg', images: [{ id: 'image', privateStorage: true, url: '' }] }] })

it('附件下载保留鉴权参数和文件名，忙碌时不重复提交且延迟释放下载 URL', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  URL.createObjectURL.mockReturnValue('blob:attachment')
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  const blob = new Blob(['attachment'], { type: 'application/zip' })
  let resolve
  downloadFeedbackAttachment.mockReturnValue(new Promise(done => { resolve = done }))
  const wrapper = mount(FeedbackTicketDetail, { props: { item: { id: 'ticket', messages: [{ id: 'msg', files: [{ id: 'file', name: 'backup.zip', size: blob.size }] }] }, formatDate: () => '' } })
  const trigger = wrapper.get('[aria-label="下载附件 backup.zip"]')
  await trigger.trigger('click'); await trigger.trigger('click')
  expect(trigger.element.disabled).toBe(true)
  expect(downloadFeedbackAttachment).toHaveBeenCalledExactlyOnceWith('ticket', 'file')
  resolve({ blob }); await flushPromises()
  expect(click).toHaveBeenCalledTimes(1)
  expect(click.mock.instances[0].download).toBe('backup.zip')
  expect(URL.createObjectURL).toHaveBeenCalledWith(blob)
  expect(trigger.element.disabled).toBe(false)
  expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  vi.advanceTimersByTime(60000)
  expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:attachment')
})

it('私有截图通过工单鉴权下载，切换工单及卸载释放临时地址', async () => {
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:private')
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  downloadFeedbackAttachment.mockResolvedValue({ blob: new Blob(['image']) })
  const wrapper = mount(FeedbackTicketDetail, { props: { item: item('a'), formatDate: () => '' } })
  try {
    await flushPromises()
    expect(downloadFeedbackAttachment).toHaveBeenCalledWith('a', 'image')
    expect(wrapper.get('img').attributes('src')).toBe('blob:private')
    await wrapper.setProps({ item: item('b') }); await flushPromises()
    expect(revoke).toHaveBeenCalledWith('blob:private')
    expect(downloadFeedbackAttachment).toHaveBeenCalledWith('b', 'image')
    wrapper.unmount()
    expect(revoke).toHaveBeenCalledTimes(2)
  } finally { create.mockRestore(); revoke.mockRestore() }
})

it('离开后返回的旧截图不创建地址也不显示到新工单', async () => {
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:obsolete')
  let resolve
  downloadFeedbackAttachment.mockReturnValue(new Promise(done => { resolve = done }))
  const wrapper = mount(FeedbackTicketDetail, { props: { item: item('a'), formatDate: () => '' } })
  await wrapper.setProps({ item: { id: 'b', messages: [] } })
  resolve({ blob: new Blob(['image']) }); await flushPromises()
  expect(create).not.toHaveBeenCalled()
  expect(wrapper.find('img').exists()).toBe(false)
  wrapper.unmount(); create.mockRestore()
})
