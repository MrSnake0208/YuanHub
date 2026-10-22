import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import Dialog from '../src/components/operator/OperatorMilestoneDialog.vue'
import { getOperatorMilestones, putOperatorMilestones } from '../src/api/operatorMilestones.js'
vi.mock('../src/api/operatorMilestones.js', () => ({ getOperatorMilestones: vi.fn(), putOperatorMilestones: vi.fn() }))
const wrappers = []
const response = () => ({ revision: 2, milestones: [{ key: 'star_1', date: '2026-01-01', observed_at: null }, { key: 'star_2', date: null, observed_at: '2026-02-01T00:00:00Z' }] })
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes }); return { promise, resolve } }
const render = (props = {}) => { const w = mount(Dialog, { attachTo: document.body, props: { entry: { id: 'op', name: '测试' }, accountId: 'a', game: '如鸢', userId: 'u', ...props }, global: { stubs: { Teleport: true } } }); wrappers.push(w); return w }
beforeEach(() => { vi.resetAllMocks(); getOperatorMilestones.mockResolvedValue(response()); putOperatorMilestones.mockImplementation(async (a, g, o, u, body) => ({ revision: 3, milestones: response().milestones.map(row => ({ ...row, date: body.dates[row.key] })) })) })
afterEach(() => wrappers.splice(0).forEach(w => w.unmount()))
it('读取不写入；补录使用账号和revision，保存后可清空', async () => {
  const w = render(); await flushPromises()
  expect(putOperatorMilestones).not.toHaveBeenCalled()
  expect(w.text()).toContain('距首次获得：未知')
  await w.get('#milestone-star_2').setValue('2026-02-01')
  expect(w.text()).toContain('31 天')
  await w.get('form').trigger('submit'); await flushPromises()
  expect(putOperatorMilestones).toHaveBeenCalledExactlyOnceWith('a', '如鸢', 'op', 'u', { expected_revision: 2, dates: { star_1: '2026-01-01', star_2: '2026-02-01' } })
  expect(w.text()).toContain('日期已保存')
  await w.get('[aria-label="清空2 星日期"]').trigger('click')
  await w.get('form').trigger('submit'); await flushPromises()
  expect(putOperatorMilestones.mock.lastCall[4]).toEqual({ expected_revision: 3, dates: { star_1: '2026-01-01', star_2: null } })
})
it.each([{ accountId: 'b' }, { userId: 'v' }, { accountId: '' }])('切换上下文后丢弃旧响应并禁止保存 %s', async props => {
  const pending = deferred(); getOperatorMilestones.mockReturnValue(pending.promise)
  const w = render(); await w.setProps(props); pending.resolve(response()); await flushPromises()
  expect(w.emitted('close')).toHaveLength(1)
  expect(w.find('form').exists()).toBe(false)
  expect(putOperatorMilestones).not.toHaveBeenCalled()
})
it('冲突保留草稿并阻止重复提交，显式重新读取后恢复', async () => {
  const w = render(); await flushPromises(); await w.get('#milestone-star_2').setValue('2026-02-01')
  putOperatorMilestones.mockRejectedValueOnce({ status: 409 })
  await w.get('form').trigger('submit'); await flushPromises()
  expect(w.get('#milestone-star_2').element.value).toBe('2026-02-01')
  await w.get('form').trigger('submit'); expect(putOperatorMilestones).toHaveBeenCalledTimes(1)
  await w.findAll('button').find(b => b.text() === '放弃草稿并重新读取').trigger('click'); await flushPromises()
  expect(w.get('#milestone-star_2').element.value).toBe('')
})
it('保存期间重复提交只写一次，切换账号后不显示旧保存结果', async () => {
  const task = deferred(); putOperatorMilestones.mockReturnValue(task.promise)
  const w = render(); await flushPromises(); await w.get('#milestone-star_2').setValue('2026-02-01')
  await w.get('form').trigger('submit'); await w.get('form').trigger('submit')
  expect(putOperatorMilestones).toHaveBeenCalledTimes(1)
  await w.setProps({ accountId: 'b' }); task.resolve(response()); await flushPromises()
  expect(w.text()).not.toContain('日期已保存')
})
it('失败保留草稿；关闭未保存内容需要显式放弃', async () => {
  const w = render(); await flushPromises(); await w.get('#milestone-star_2').setValue('2026-02-01')
  putOperatorMilestones.mockRejectedValueOnce(new Error('网络不可用'))
  await w.get('form').trigger('submit'); await flushPromises()
  expect(w.text()).toContain('网络不可用')
  expect(w.get('#milestone-star_2').element.value).toBe('2026-02-01')
  await w.findAll('button').find(b => b.text() === '关闭').trigger('click')
  expect(w.emitted('close')).toBeUndefined()
  await w.findAll('button').find(b => b.text() === '放弃并关闭').trigger('click')
  expect(w.emitted('close')).toHaveLength(1)
})
