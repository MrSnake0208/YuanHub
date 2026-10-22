import { beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import RewardEntryWorkspace from '../src/components/inventory/RewardEntryWorkspace.vue'
import RewardDateTimePicker from '../src/components/inventory/RewardDateTimePicker.vue'
import * as api from '../src/api/inventory.js'
import { getRewardCatalog } from '../src/api/rewardCatalog.js'
import { getTrainingWorkspace } from '../src/api/operatorPlanner.js'
import { dailyRewardRecordId } from '../src/data/inventory/rewardChannels.js'
import { deferred } from '../test-support/factories.js'

vi.mock('../src/api/inventory.js', () => ({ importInventory: vi.fn(), getCurrent: vi.fn(), listRecords: vi.fn() }))
vi.mock('../src/api/rewardCatalog.js', () => ({ getRewardCatalog: vi.fn() }))
vi.mock('../src/api/operatorPlanner.js', () => ({ getTrainingWorkspace: vi.fn() }))
const success = { accepted: 1, duplicates: 0, history_only: 0, superseded: 0 }
const button = text => [...document.querySelectorAll('button')].find(node => node.textContent.includes(text))
async function click(text) { button(text).click(); await flushPromises() }
async function purpose(value) {
  const select = document.querySelector('[aria-label="日常记录用途"]')
  select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); await flushPromises()
}
function create(props = {}) { return mount(RewardEntryWorkspace, { attachTo: document.body, props: { accountId: 'acc-A', accountName: '账号A', game: '代号鸢', ...props } }) }
async function open(wrapper, daily = true) { await wrapper.vm[daily ? 'openDaily' : 'openManual'](); await flushPromises() }
async function setTime(wrapper, date, clock) {
  const picker = wrapper.findComponent(RewardDateTimePicker)
  picker.vm.$emit('update:date', date); picker.vm.$emit('update:clock', clock); await flushPromises()
}
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  vi.resetAllMocks()
  getRewardCatalog.mockResolvedValue(['zhuyu', 'baijinbi'].map((id, i) => ({ entity_type: 'item', id, name: ['茱萸', '白金币'][i] })))
  getTrainingWorkspace.mockResolvedValue({ schema_version: 1, account_id: 'acc-A', revision: 0 })
  api.listRecords.mockResolvedValue({ items: [], next_cursor: null })
  api.getCurrent.mockResolvedValue([])
  api.importInventory.mockResolvedValue(success)
})
it('快捷录入每日茱萸只记录实际道具，多选合计不折算白金币', async () => {
  const wrapper = create(); await open(wrapper, false)
  await click('每日茱萸'); await click('密探日常'); await purpose('income')
  expect(document.querySelector('.reward-receipt').textContent).toContain('合计 1 茱萸、50 白金币')
  await click('预览本次流水'); await click('确认补录 2 条')
  const records = api.importInventory.mock.calls[0][0].records
  expect(records.map(r => r.entries)).toEqual([[{ id: 'zhuyu', name: '茱萸', count: 1 }], [{ id: 'baijinbi', name: '白金币', count: 50 }]])
})
it('日常打卡无道具目录、不默认勾选、一次操作提交并保留来源键', async () => {
  const wrapper = create(); await open(wrapper)
  expect(document.querySelector('h3').textContent).toBe('日常打卡')
  expect(document.querySelector('.reward-picker')).toBeNull()
  expect(document.querySelector('.channel-options')).toBeNull()
  expect(button('一键记录').disabled).toBe(true)
  expect(api.importInventory).not.toHaveBeenCalled()
  await click('每日茱萸'); await click('一键记录')
  expect(api.importInventory).not.toHaveBeenCalled()
  await purpose('income'); await click('一键记录')
  expect(api.importInventory).toHaveBeenCalledTimes(1)
  const record = api.importInventory.mock.calls[0][0].records[0]
  expect(record.record_id).toBe(dailyRewardRecordId('daily-zhuyu', record.effective_at))
  expect(record.account_id).toBe('acc-A')
  expect(document.querySelector('.result').textContent).toContain('1 茱萸')
})
it('分页查找快捷入口已有记录，禁用该项目但可录其他来源', async () => {
  api.listRecords.mockImplementation(async ({ from, cursor }) => cursor
    ? { items: [{ record_id: dailyRewardRecordId('daily-zhuyu', from) }], next_cursor: null }
    : { items: [], next_cursor: 'page-2' })
  const wrapper = create(); await open(wrapper)
  expect(button('每日茱萸').disabled).toBe(true)
  expect(button('每日茱萸').textContent).toContain('已记录')
  expect(api.listRecords.mock.calls.some(([args]) => args.cursor === 'page-2')).toBe(true)
  await click('密探日常'); await purpose('income'); await click('一键记录')
  expect(api.importInventory.mock.calls[0][0].records.map(r => r.acquisition_channel)).toEqual(['密探日常'])
})
it('跨设备冲突刷新状态，保留尚未记录项目供再次提交', async () => {
  const wrapper = create(); await open(wrapper)
  await click('每日茱萸'); await click('密探日常'); await purpose('income')
  api.importInventory.mockRejectedValueOnce(Object.assign(new Error('conflict'), { status: 409 }))
  api.listRecords.mockImplementation(async ({ from }) => ({ items: [{ record_id: dailyRewardRecordId('daily-zhuyu', from) }], next_cursor: null }))
  await click('一键记录')
  expect(button('每日茱萸').disabled).toBe(true)
  expect(button('密探日常').getAttribute('aria-pressed')).toBe('true')
  await click('一键记录')
  expect(api.importInventory.mock.calls[1][0].records.map(r => r.acquisition_channel)).toEqual(['密探日常'])
})
it('结果不明时锁定正文，原样重试不生成新时间或来源键', async () => {
  const wrapper = create(); await open(wrapper)
  await click('每日茱萸'); await purpose('income')
  api.importInventory.mockRejectedValueOnce(new Error('Failed to fetch'))
  await click('一键记录')
  const first = JSON.parse(JSON.stringify(api.importInventory.mock.calls[0][0]))
  await click('原样重试补录')
  expect(api.importInventory.mock.calls[1][0]).toEqual(first)
  expect(wrapper.emitted('imported')).toEqual([['acc-A']])
})
it('已录状态读取失败禁止打卡，重试恢复', async () => {
  api.listRecords.mockRejectedValueOnce(new Error('offline'))
  const wrapper = create(); await open(wrapper)
  expect(button('每日茱萸').disabled).toBe(true)
  expect(button('一键记录').disabled).toBe(true)
  expect(api.importInventory).not.toHaveBeenCalled()
  await click('重试')
  expect(button('每日茱萸').disabled).toBe(false)
})
it('账号A迟到的已录状态不能覆盖账号B，清空账号关闭弹窗', async () => {
  const pending = deferred()
  api.listRecords.mockImplementationOnce(() => pending.promise)
  const wrapper = create(); await open(wrapper)
  await wrapper.setProps({ accountId: 'acc-B' }); await open(wrapper)
  pending.resolve({ items: [{ record_id: dailyRewardRecordId('daily-zhuyu', new Date().toISOString()) }], next_cursor: null })
  await flushPromises()
  expect(button('每日茱萸').disabled).toBe(false)
  await click('每日茱萸'); await purpose('income'); await click('一键记录')
  expect(api.importInventory.mock.calls[0][0].records[0].account_id).toBe('acc-B')
  await wrapper.setProps({ accountId: '' }); await open(wrapper)
  expect(document.querySelector('[role="dialog"]')).toBeNull()
})
it('茱萸补标不能借白金币基线，提交前重新核对茱萸基线', async () => {
  const wrapper = create(); await open(wrapper)
  await click('每日茱萸'); await purpose('annotation')
  const at = new Date(Date.now() + 60000).toISOString()
  api.getCurrent.mockResolvedValue([{ entity_type: 'item', entries: { baijinbi: { listed_baseline_at: at } } }])
  await click('一键记录')
  expect(api.importInventory).not.toHaveBeenCalled()
  expect(document.body.textContent).toContain('尚无茱萸')
  api.getCurrent.mockResolvedValueOnce([{ entity_type: 'item', entries: { zhuyu: { listed_baseline_at: at } } }]).mockResolvedValueOnce([])
  await click('一键记录')
  expect(api.importInventory).not.toHaveBeenCalled()
  api.getCurrent.mockResolvedValue([{ entity_type: 'item', entries: { zhuyu: { listed_baseline_at: at } } }])
  await click('一键记录')
  expect(api.importInventory).toHaveBeenCalledTimes(1)
})
it('修改发生时间跨北京时间05:00重新读取对应游戏日', async () => {
  const wrapper = create(); await open(wrapper)
  // 输入采用本机时间，将北京时间边界转换后传入。
  for (const iso of ['2026-10-21T20:59:59Z', '2026-10-21T21:00:00Z']) {
    const date = new Date(iso), local = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString()
    await setTime(wrapper, local.slice(0, 10), local.slice(11, 19))
  }
  expect(api.listRecords.mock.calls.slice(-2).map(([args]) => args.from)).toEqual(['2026-10-20T21:00:00.000Z', '2026-10-21T21:00:00.000Z'])
})
it('从普通录入进入打卡再返回，保留原有未提交草稿', async () => {
  const wrapper = create(); await open(wrapper, false)
  await click('月卡奖励'); await purpose('income')
  await wrapper.vm.openDaily(); await flushPromises()
  await click('每日茱萸')
  await wrapper.vm.openManual(); await flushPromises()
  expect(button('月卡奖励').getAttribute('aria-pressed')).toBe('true')
  expect(document.querySelector('[aria-label="日常记录用途"]').value).toBe('income')
})
it('账号切换后旧提交完成不能解锁新提交或触发旧账号刷新', async () => {
  const a = deferred(), b = deferred()
  const wrapper = create(); await open(wrapper)
  await click('每日茱萸'); await purpose('income')
  api.importInventory.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)
  await click('一键记录')
  await wrapper.setProps({ accountId: 'acc-B' }); await open(wrapper)
  await click('每日茱萸'); await purpose('income'); await click('一键记录')
  expect(api.importInventory).toHaveBeenCalledTimes(2)
  a.resolve(success); await flushPromises()
  expect(document.querySelector('.manual-form fieldset').disabled).toBe(true)
  expect(wrapper.emitted('imported')).toBeUndefined()
  b.resolve(success); await flushPromises()
  expect(wrapper.emitted('imported')).toEqual([['acc-B']])
})
it('目录请求A未完成时账号B仍可加载，A迟到目录不覆盖B', async () => {
  const a = deferred()
  getRewardCatalog.mockReturnValueOnce(a.promise)
  const wrapper = create()
  const openingA = wrapper.vm.openDaily(); await flushPromises()
  await wrapper.setProps({ accountId: 'acc-B' }); await open(wrapper)
  expect(button('每日茱萸')).toBeDefined()
  a.resolve([]); await openingA; await flushPromises()
  expect(button('每日茱萸')).toBeDefined()
  expect(document.body.textContent).not.toContain('奖励目录为空')
})
it('打卡成功不丢失普通录入草稿的未保存提醒', async () => {
  const wrapper = create(); await open(wrapper, false)
  await click('月卡奖励'); await purpose('income')
  await wrapper.vm.openDaily(); await flushPromises()
  await click('每日茱萸'); await purpose('income'); await click('一键记录')
  expect(wrapper.vm.hasDraft()).toBe(true)
  await click('继续打卡')
  expect(document.querySelector('.channel-options')).toBeNull()
  expect(document.querySelector('.stamina-field')).toBeNull()
})
it('只打开日常打卡不算未保存草稿，关闭后不阻塞其他库存操作', async () => {
  const wrapper = create(); await open(wrapper)
  expect(wrapper.vm.hasDraft()).toBe(false)
  document.querySelector('[aria-label="关闭奖励工作台"]').click(); await flushPromises()
  expect(wrapper.vm.hasDraft()).toBe(false)
})
it('A补标预检查迟到时不能自动提交B普通录入的预览', async () => {
  const a = deferred()
  const wrapper = create(); await open(wrapper)
  await click('每日茱萸'); await purpose('annotation')
  api.getCurrent.mockReturnValueOnce(a.promise)
  await click('一键记录')
  await wrapper.setProps({ accountId: 'acc-B' }); await open(wrapper, false)
  await click('每日茱萸'); await purpose('income'); await click('预览本次流水')
  a.resolve([{ entity_type: 'item', full_baseline_at: new Date(Date.now() + 60000).toISOString() }]); await flushPromises()
  expect(api.importInventory).not.toHaveBeenCalled()
  expect(document.querySelector('.preview-section')).not.toBeNull()
})
