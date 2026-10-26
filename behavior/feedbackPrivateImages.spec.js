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
