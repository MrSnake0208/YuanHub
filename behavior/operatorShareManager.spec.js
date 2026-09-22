import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import Manager from '../src/components/operator/OperatorShareManager.vue'
import * as api from '../src/api/operator.js'
import { dialog } from '../src/utils/dialog.js'
import { deferred } from '../test-support/factories.js'

vi.mock('../src/api/operator.js', () => ({
  createOperatorShare: vi.fn(), getOperatorShare: vi.fn(), regenerateOperatorShare: vi.fn(), revokeOperatorShare: vi.fn()
}))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn() } }))
const active = (id, code = id + '-code') => ({ account_id: id, active: true, share_code: code })
function button(wrapper, text) { return wrapper.findAll('button').find(node => node.text().includes(text)) }
beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset()
  dialog.confirm.mockReset()
  api.getOperatorShare.mockResolvedValue({ active: false })
})

describe('当前子账号分享管理：渲染与真实异步行为', () => {
  it('初始化只读取，不会创建、更新或撤销分享', async () => {
    const wrapper = mount(Manager, { props: { accountId: 'a' } })
    expect(wrapper.get('[role="status"]').text()).toContain('读取')
    await flushPromises()
    expect(api.getOperatorShare).toHaveBeenCalledExactlyOnceWith('a')
    expect(button(wrapper, '生成分享链接').exists()).toBe(true)
    for (const fn of [api.createOperatorShare, api.regenerateOperatorShare, api.revokeOperatorShare]) expect(fn).not.toHaveBeenCalled()
  })
  it('账号切换后 A 的迟到结果不能显示在 B 的工作区', async () => {
    const a = deferred(), b = deferred()
    api.getOperatorShare.mockImplementation(id => id === 'a' ? a.promise : b.promise)
    const wrapper = mount(Manager, { props: { accountId: 'a' } })
    await wrapper.setProps({ accountId: 'b' })
    b.resolve(active('b')); await flushPromises()
    a.resolve(active('a')); await flushPromises()
    expect(wrapper.get('input[readonly]').element.value).toContain('/operator/share/b-code')
    expect(wrapper.text()).not.toContain('a-code')
    expect(wrapper.emitted('share-change').at(-1)[0]).toMatchObject({ accountId: 'b', status: '已开启' })
  })
  it('旧账号请求结束不能清除新账号仍在等待的 loading', async () => {
    const a = deferred(), b = deferred()
    api.getOperatorShare.mockImplementation(id => id === 'a' ? a.promise : b.promise)
    const wrapper = mount(Manager, { props: { accountId: 'a' } })
    await wrapper.setProps({ accountId: 'b' })
    a.resolve(active('a')); await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('读取')
    b.resolve(active('b')); await flushPromises()
    expect(wrapper.get('input').element.value).toContain('b-code')
  })
  it.each(['重新生成', '撤销分享'])('确认 %s 期间切换账号不会对 B 执行 A 的指令', async label => {
    api.getOperatorShare.mockImplementation(id => Promise.resolve(active(id)))
    const confirmation = deferred(); dialog.confirm.mockReturnValue(confirmation.promise)
    const wrapper = mount(Manager, { props: { accountId: 'a' } }); await flushPromises()
    await button(wrapper, label).trigger('click')
    await wrapper.setProps({ accountId: 'b' }); await flushPromises()
    confirmation.resolve(true); await flushPromises()
    expect(api.regenerateOperatorShare).not.toHaveBeenCalled()
    expect(api.revokeOperatorShare).not.toHaveBeenCalled()
    expect(wrapper.get('input').element.value).toContain('b-code')
  })
  it('生成按钮只在显式点击后调用写 API，等待期间禁止重复点击', async () => {
    const result = deferred(); api.createOperatorShare.mockReturnValue(result.promise)
    const wrapper = mount(Manager, { props: { accountId: 'a' } }); await flushPromises()
    await button(wrapper, '生成分享链接').trigger('click')
    expect(api.createOperatorShare).toHaveBeenCalledExactlyOnceWith('a')
    expect(wrapper.findAll('button').every(node => node.element.disabled)).toBe(true)
    result.resolve(active('a', 'safe/code')); await flushPromises()
    expect(wrapper.get('a').attributes('href')).toBe('http://127.0.0.1/operator/share/safe%2Fcode')
    expect(wrapper.get('input').attributes()).toHaveProperty('readonly')
  })
  it('查询失败展示可理解的错误且不会自动重试写操作', async () => {
    api.getOperatorShare.mockRejectedValue(new TypeError('Failed to fetch'))
    const wrapper = mount(Manager, { props: { accountId: 'a' } }); await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('网络异常，请稍后重试')
    expect(api.createOperatorShare).not.toHaveBeenCalled()
    expect(api.regenerateOperatorShare).not.toHaveBeenCalled()
  })
  it('卸载后迟到请求不再发出成功状态事件', async () => {
    const result = deferred(); api.getOperatorShare.mockReturnValue(result.promise)
    const onShareChange = vi.fn()
    const wrapper = mount(Manager, { props: { accountId: 'a', onShareChange } })
    const count = onShareChange.mock.calls.length
    wrapper.unmount(); result.resolve(active('a')); await flushPromises()
    expect(onShareChange).toHaveBeenCalledTimes(count)
  })
})

it('regression: clearing the selected account cancels loading even while the previous read is pending', async () => {
  const pending = deferred(); api.getOperatorShare.mockReturnValue(pending.promise)
  const wrapper = mount(Manager, { props: { accountId: 'a' } })
  await wrapper.setProps({ accountId: '' })
  expect(wrapper.text()).not.toContain('正在读取分享状态')
  pending.resolve(active('a')); await flushPromises()
  expect(wrapper.text()).not.toContain('正在读取分享状态')
  expect(wrapper.find('input[readonly]').exists()).toBe(false)
  expect(api.getOperatorShare).toHaveBeenCalledTimes(1)
})

it('empty account initialization never calls account APIs', async () => {
  const wrapper = mount(Manager, { props: { accountId: '' } }); await flushPromises()
  expect(wrapper.text()).not.toContain('正在读取分享状态')
  for (const fn of Object.values(api)) expect(fn).not.toHaveBeenCalled()
})
