import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import DrawResourceEntry from '../src/components/inventory/DrawResourceEntry.vue'
import { getDrawResources, recordDrawResources } from '../src/api/drawResources.js'
import { dialog } from '../src/utils/dialog.js'
vi.mock('../src/api/drawResources.js', () => ({ getDrawResources: vi.fn(), recordDrawResources: vi.fn() }))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn() } }))
const data = (account = 'a') => ({ account_id: account, game: '代号鸢', inventory_revision: 7, balances: { baijinbi: 4000, fuchuan: 20, tianjifuchuan: 0 } })
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
let wrapper
async function open() {
  wrapper = mount(DrawResourceEntry, { props: { userId: 'owner', accountId: 'a', game: '代号鸢' } })
  wrapper.get('details').element.open = true
  await wrapper.get('details').trigger('toggle'); await flushPromises()
}
const select = index => wrapper.findAll('select')[index]
const quantity = () => wrapper.get('input[aria-label="符传数量"]')
async function submit() { await wrapper.get('form').trigger('submit'); await flushPromises() }
afterEach(() => wrapper?.unmount())
beforeEach(() => { vi.resetAllMocks(); getDrawResources.mockResolvedValue(data()); dialog.confirm.mockResolvedValue(true) })
it('只读初始化、兑换预览和月卡十张步进，服务端成功后通知刷新', async () => {
  await open()
  expect(recordDrawResources).not.toHaveBeenCalled()
  await select(0).setValue('exchange'); await select(2).setValue('monthly-shop')
  expect(quantity().element.value).toBe('10')
  expect(wrapper.text()).toContain('白金币 −1,600')
  await wrapper.get('button[aria-label="增加符传数量"]').trigger('click')
  expect(quantity().element.value).toBe('20')
  expect(wrapper.text()).toContain('4,000 → 800')
  recordDrawResources.mockImplementation(async body => ({ account_id: body.account_id, record_id: `yuanhub:draw:${body.operation_id}`, record_type: 'resource_delta', entries: [{ id: 'baijinbi', name: '白金币', count: -3200 }, { id: 'fuchuan', name: '符传', count: 20 }] }))
  await submit()
  expect(recordDrawResources.mock.lastCall[0]).toMatchObject({ ticket_id: 'fuchuan', quantity: 20, channel: 'monthly-shop', expected_inventory_revision: 7 })
  expect(wrapper.emitted('recorded')).toEqual([['a']])
  expect(wrapper.text()).toContain('已记录：白金币−3200、符传+20')
})
it('活动奖励不扣币，未知或不足余额及非法输入不提交', async () => {
  await open()
  await wrapper.get('input[placeholder="例如：活动奖励、邮件奖励"]').setValue('活动邮件')
  expect(wrapper.text()).toContain('符传 +1')
  expect(wrapper.text()).not.toContain('白金币 −')
  await select(0).setValue('exchange'); await quantity().setValue('21')
  expect(wrapper.text()).toContain('库存不足')
  await submit(); expect(recordDrawResources).not.toHaveBeenCalled()
  await quantity().setValue('1e2'); await submit(); expect(recordDrawResources).not.toHaveBeenCalled()
})
it('取消确认不写入，确认期间账号改变不向新账号发送旧操作', async () => {
  await open(); await select(0).setValue('exchange')
  dialog.confirm.mockResolvedValueOnce(false)
  await submit(); expect(recordDrawResources).not.toHaveBeenCalled()
  const confirmation = deferred(); dialog.confirm.mockReturnValueOnce(confirmation.promise)
  await submit()
  expect(await wrapper.vm.confirmDiscard()).toBe(false)
  getDrawResources.mockResolvedValueOnce(data('b'))
  await wrapper.setProps({ accountId: 'b' }); await flushPromises()
  confirmation.resolve(true); await flushPromises()
  expect(recordDrawResources).not.toHaveBeenCalled()
})
it('不明失败锁定原操作，原样重试且确认前不能离开', async () => {
  await open(); await select(0).setValue('exchange')
  recordDrawResources.mockRejectedValue(new Error('断网'))
  await submit()
  const original = { ...recordDrawResources.mock.lastCall[0] }
  expect(wrapper.text()).toContain('原样重试')
  expect(await wrapper.vm.confirmDiscard()).toBe(false)
  expect(select(0).element.matches(':disabled')).toBe(true)
  const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
  await submit()
  expect(recordDrawResources.mock.lastCall).toEqual([original, 'owner'])
  expect(dialog.confirm).toHaveBeenCalledTimes(1)
})
it('版本冲突保留草稿但必须重新读取，切换用户或账号不接受旧响应', async () => {
  await open(); await select(0).setValue('exchange')
  recordDrawResources.mockRejectedValueOnce(Object.assign(new Error('库存已变更'), { status: 409 }))
  await submit(); await submit()
  expect(recordDrawResources).toHaveBeenCalledTimes(1)
  const late = deferred(); getDrawResources.mockReturnValueOnce(late.promise).mockResolvedValueOnce(data('b'))
  await wrapper.findAll('button').find(b => b.text() === '重新读取库存').trigger('click')
  await wrapper.setProps({ accountId: 'b', userId: 'other' }); await flushPromises()
  late.resolve({ ...data(), balances: { baijinbi: 999999, fuchuan: 999, tianjifuchuan: 999 } }); await flushPromises()
  expect(getDrawResources).toHaveBeenLastCalledWith('b', 'other')
  expect(wrapper.text()).not.toContain('999,999')
})
it('迟到的保存不刷新另一个账号，清空账号不请求', async () => {
  await open(); await select(0).setValue('exchange')
  const late = deferred(); recordDrawResources.mockReturnValueOnce(late.promise)
  await submit()
  const operation = recordDrawResources.mock.lastCall[0]
  getDrawResources.mockResolvedValueOnce(data('b'))
  await wrapper.setProps({ accountId: 'b' }); await flushPromises()
  late.resolve({ account_id: 'a', record_id: `yuanhub:draw:${operation.operation_id}`, entries: [] }); await flushPromises()
  expect(wrapper.emitted('recorded')).toBeUndefined()
  const count = getDrawResources.mock.calls.length
  await wrapper.setProps({ accountId: '' }); await flushPromises()
  expect(getDrawResources).toHaveBeenCalledTimes(count)
  expect(wrapper.find('form').exists()).toBe(false)
})

it('弹窗内使用与兑换复用原命令，切换时保留数量且无需第二个操作选择器', async () => {
  wrapper = mount(DrawResourceEntry, { props: { userId: 'owner', accountId: 'a', game: '代号鸢', embedded: true, operation: 'use' } })
  await flushPromises()
  expect(getDrawResources).toHaveBeenCalledWith('a', 'owner')
  expect(wrapper.find('summary').exists()).toBe(false)
  expect(wrapper.findAll('select')).toHaveLength(1)
  await quantity().setValue('2')
  expect(wrapper.text()).toContain('符传 −2')
  await wrapper.setProps({ operation: 'exchange' })
  expect(quantity().element.value).toBe('2')
  expect(wrapper.text()).toContain('白金币 −400')
  recordDrawResources.mockImplementation(async body => ({ account_id: body.account_id, record_id: `yuanhub:draw:${body.operation_id}`, entries: [] }))
  await submit()
  expect(recordDrawResources.mock.lastCall[0]).toMatchObject({ action: 'exchange', quantity: 2, channel: 'standard', expected_inventory_revision: 7 })
  expect(await wrapper.vm.confirmDiscard()).toBe(true)
  expect(dialog.confirm).toHaveBeenCalledTimes(1)
})
