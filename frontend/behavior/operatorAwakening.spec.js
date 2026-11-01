import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import Dialog from '../src/components/operator/OperatorAwakeningDialog.vue'
import { patchOperatorCurrent, previewOperatorUpgrade, executeOperatorUpgrade } from '../src/api/operator.js'

vi.mock('../src/api/operator.js', () => ({ patchOperatorCurrent: vi.fn(), previewOperatorUpgrade: vi.fn(), executeOperatorUpgrade: vi.fn() }))
const wrappers = []
const entry = (awakened = null) => ({ id: 'op', name: '测试密探', rarity: 4, level: 100, elite: 17, revision: 7, huaji: { owned: true, stage: 25, awakened } })
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
function render(value = entry(), extra = {}) {
  const wrapper = mount(Dialog, { attachTo: document.body, props: { entry: value, accountId: 'acc', game: '如鸢', refresh: vi.fn().mockResolvedValue(value), ...extra }, global: { stubs: { Teleport: true } } })
  wrappers.push(wrapper)
  return wrapper
}
const confirm = wrapper => wrapper.get('button.primary')
beforeEach(() => { vi.resetAllMocks(); patchOperatorCurrent.mockResolvedValue(entry(true)) })
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()) })

it.each([null, false])('stage25 + %s 只PATCH觉醒事实，不触发升级或自动改未知', async awakened => {
  const wrapper = render(entry(awakened))
  await flushPromises()
  expect(wrapper.text()).toContain('不扣除材料')
  expect(patchOperatorCurrent).not.toHaveBeenCalled()
  await confirm(wrapper).trigger('click'); await flushPromises()
  expect(patchOperatorCurrent).toHaveBeenCalledExactlyOnceWith({ accountId: 'acc', operatorId: 'op', game: '如鸢',
    patch: { expected_revision: 7, reason: 'manual_correction', huaji: { awakened: true } } })
  expect(wrapper.emitted('saved')).toHaveLength(1)
  expect(previewOperatorUpgrade).not.toHaveBeenCalled()
  expect(executeOperatorUpgrade).not.toHaveBeenCalled()
})

it('未填觉醒默认未觉醒且无需确认false，取消不写入并恢复焦点', async () => {
  const opener = document.createElement('button'); document.body.append(opener); opener.focus()
  const wrapper = render()
  await flushPromises()
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  expect(wrapper.emitted('close')).toHaveLength(1)
  expect(patchOperatorCurrent).not.toHaveBeenCalled()
  wrapper.unmount(); await flushPromises()
  expect(document.activeElement).toBe(opener)
  opener.remove()
  const another = render()
  expect(another.text()).toContain('未记录时按未觉醒计算')
  expect(another.findAll('button').some(button => button.text() === '确认未觉醒')).toBe(false)
  expect(another.text()).not.toContain('待确认')
  expect(patchOperatorCurrent).not.toHaveBeenCalled()
})

it('保存中重复点击及快速关闭不会发送第二次请求', async () => {
  const task = deferred(); patchOperatorCurrent.mockReturnValue(task.promise)
  const wrapper = render(entry(false))
  await confirm(wrapper).trigger('click')
  await confirm(wrapper).trigger('click')
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  expect(wrapper.emitted('close')).toBeUndefined()
  expect(patchOperatorCurrent).toHaveBeenCalledTimes(1)
  task.resolve(entry(true)); await flushPromises()
  expect(wrapper.emitted('saved')).toHaveLength(1)
})

it('网络错误保留确认弹层和错误焦点，允许显式重试', async () => {
  patchOperatorCurrent.mockRejectedValueOnce(new Error('网络不可用'))
  const wrapper = render()
  await confirm(wrapper).trigger('click'); await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('网络不可用')
  expect(document.activeElement).toBe(wrapper.get('[role="alert"]').element)
  expect(wrapper.emitted('saved')).toBeUndefined()
  await confirm(wrapper).trigger('click'); await flushPromises()
  expect(patchOperatorCurrent).toHaveBeenCalledTimes(2)
})

it('409同步后不自动重试，二次确认使用最新revision且只写觉醒', async () => {
  patchOperatorCurrent.mockRejectedValueOnce(Object.assign(new Error('冲突'), { status: 409 }))
  const wrapper = render()
  const latest = { ...entry(), revision: 8 }
  const refresh = vi.fn(async () => { await wrapper.setProps({ entry: latest }); return latest })
  await wrapper.setProps({ refresh })
  await confirm(wrapper).trigger('click'); await flushPromises()
  expect(refresh).toHaveBeenCalledOnce()
  expect(patchOperatorCurrent).toHaveBeenCalledTimes(1)
  expect(wrapper.text()).toContain('重新确认')
  await confirm(wrapper).trigger('click'); await flushPromises()
  expect(patchOperatorCurrent.mock.lastCall[0].patch).toEqual({ expected_revision: 8, reason: 'manual_correction', huaji: { awakened: true } })
})

it('409后同步失败阻止保存；同步发现已觉醒后不重复写入', async () => {
  patchOperatorCurrent.mockRejectedValueOnce(Object.assign(new Error('冲突'), { status: 409 }))
  const refresh = vi.fn().mockRejectedValueOnce(new Error('同步失败'))
  const wrapper = render(entry(), { refresh })
  await confirm(wrapper).trigger('click'); await flushPromises()
  expect(wrapper.find('button.primary').exists()).toBe(false)
  const latest = { ...entry(true), revision: 9 }
  refresh.mockImplementationOnce(async () => { await wrapper.setProps({ entry: latest }); return latest })
  await wrapper.findAll('button').find(button => button.text() === '重新同步').trigger('click'); await flushPromises()
  expect(confirm(wrapper).element.disabled).toBe(true)
  expect(patchOperatorCurrent).toHaveBeenCalledTimes(1)
})

it.each(['account', 'game', 'unmount'])('%s变化后丢弃旧响应，不污染新账号或发送新请求', async change => {
  const task = deferred(); patchOperatorCurrent.mockReturnValue(task.promise)
  const wrapper = render()
  await confirm(wrapper).trigger('click')
  if (change === 'unmount') wrapper.unmount()
  else await wrapper.setProps(change === 'account' ? { accountId: 'other' } : { game: '代号鸢' })
  task.resolve(entry(true)); await flushPromises()
  expect(wrapper.emitted('saved')).toBeUndefined()
  expect(patchOperatorCurrent).toHaveBeenCalledTimes(1)
})

it.each([
  entry(true), { ...entry(), huaji: { owned: true, stage: null, awakened: true } },
  { ...entry(), huaji: { owned: false, stage: 0, awakened: null } },
  { ...entry(), huaji: { owned: true, stage: 19, awakened: null } },
  { ...entry(), rarity: 3 }, { ...entry(), spOf: 'base' },
  { ...entry(), huajiCapabilities: { awakening_supported: false } },
])('例外或完成态不能发出觉醒PATCH %#', async value => {
  const wrapper = render(value)
  await confirm(wrapper).trigger('click'); await flushPromises()
  expect(patchOperatorCurrent).not.toHaveBeenCalled()
})
